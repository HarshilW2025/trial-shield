"""Issuer authorisation rule for the Protected card.

Input is an authorisation request labelled with the fields Westpac's own payment gateway (OnlinePay) uses for every
card payment:

    shopperInteraction              ECOMMERCE
    storedCredentialContract        (none) | ONE_CLICK | MERCHANT_INITIATED
    storedCredentialProcessingModel (none) | CREDENTIAL_ON_FILE | RECURRING | UNSCHEDULED_CREDENTIAL_ON_FILE

Card networks have required merchants to label stored credential and merchant initiated charges since 2017, and
PCI DSS forbids merchants from keeping the CVV after authorisation, so later charges never carry one.

The Protected card rule does not depend on the merchant labelling honestly:
    a charge with a CVV must carry a live one-time CVV;
    a charge without one, however it is labelled, needs the cardholder's approval of that one charge.
No fresh CVV and no approval means no payment.
"""
import itertools
import time

from otcvv import OneTimeCVV

APPROVED, DO_NOT_HONOUR, CVV_FAIL = "00", "05", "N7"   # N7 is the Visa response code for a CVV2 failure

LABELS = {
    (None, None): "One-off online purchase, card details not stored",
    (None, "CREDENTIAL_ON_FILE"): "Online purchase, shopper agrees to store the card",
    ("ONE_CLICK", "CREDENTIAL_ON_FILE"): "One-click purchase with stored card details",
    (None, "RECURRING"): "Subscription sign-up",
    ("MERCHANT_INITIATED", "RECURRING"): "Subscription charge started by the merchant",
    (None, "UNSCHEDULED_CREDENTIAL_ON_FILE"): "Sign-up for later unscheduled charges",
    ("MERCHANT_INITIATED", "UNSCHEDULED_CREDENTIAL_ON_FILE"): "Unscheduled charge started by the merchant",
}


def norm(s):
    return " ".join(str(s or "").lower().split())


class Card:
    def __init__(self, ref, pan, expiry, protected, static_cvv=None, clock=time.time):
        self.ref, self.pan, self.expiry, self.protected, self.static_cvv = ref, pan, expiry, protected, static_cvv
        self.otc = OneTimeCVV(ref, clock=clock) if protected else None
        self.stopped = set()


class Issuer:
    def __init__(self, clock=time.time):
        self.clock = clock
        self.cards = {}
        self.approvals = []      # one charge each: merchant, amount, status pending|approved|declined|used
        self.cvv_requests = []   # extension asks for a one-time CVV; the cardholder approves on their phone
        self.log = []
        self._ids = itertools.count(1)

    def add_card(self, card):
        self.cards[card.pan] = card
        return card

    # ----- one-time CVV, requested by the browser extension and approved in the banking app -----
    def request_cvv(self, card_ref, merchant, amount):
        req = {"id": next(self._ids), "card": card_ref, "merchant": merchant, "amount": round(float(amount), 2),
               "status": "pending", "created": self.clock()}
        self.cvv_requests.append(req)
        self._log("CVV_REQUEST", f"One-time CVV requested for {merchant}, up to ${req['amount']:.2f}. Push sent to the cardholder.")
        return req

    def answer_cvv_request(self, req_id, approve):
        req = next(r for r in self.cvv_requests if r["id"] == req_id)
        if req["status"] != "pending":
            return req
        if not approve:
            req["status"] = "declined"
            self._log("CVV_DECLINED", f"Cardholder declined the CVV request for {req['merchant']}.")
            return req
        card = next(c for c in self.cards.values() if c.ref == req["card"])
        issued = card.otc.issue(req["amount"], req["merchant"])
        req.update(status="approved", pan=card.pan, expiry=card.expiry, cvv=issued["cvv"], expires_at=issued["expires_at"])
        self._log("CVV_ISSUED", f"One-time CVV issued for {req['merchant']}, up to ${req['amount']:.2f}, valid 10 minutes.")
        return req

    # ----- per charge approvals -----
    def answer_approval(self, approval_id, approve, stop_merchant=False):
        a = next(x for x in self.approvals if x["id"] == approval_id)
        if a["status"] == "pending":
            a["status"] = "approved" if approve else "declined"
            self._log("APPROVAL", f"Cardholder {'approved' if approve else 'declined'} ${a['amount']:.2f} to {a['merchant']} (this one charge only).")
        if stop_merchant:
            next(c for c in self.cards.values() if c.ref == a["card"]).stopped.add(norm(a["merchant"]))
            self._log("STOP", f"Cardholder stopped all charges from {a['merchant']}.")
        return a

    # ----- authorisation -----
    def authorise(self, req):
        """req: {merchant, amount, card: {number, expiry, cvv?}, shopperInteraction, storedCredentialContract,
        storedCredentialProcessingModel}. Returns the issuer's response."""
        card = self.cards.get(str(req["card"]["number"]).replace(" ", ""))
        merchant, amount = req["merchant"], round(float(req["amount"]), 2)
        cvv = (req["card"].get("cvv") or "").strip() or None
        label = LABELS.get((req.get("storedCredentialContract"), req.get("storedCredentialProcessingModel")), "Unlabelled charge")
        if card is None:
            return self._respond(req, label, DO_NOT_HONOUR, "Unknown card", None)
        if card.expiry != req["card"].get("expiry"):
            return self._respond(req, label, DO_NOT_HONOUR, "Expiry does not match", None)

        if not card.protected:
            # The Everyday card as cards work today: a static CVV if one is sent, and labelled
            # merchant initiated charges approved because the cardholder agreed once at sign-up.
            if cvv and cvv != card.static_cvv:
                return self._respond(req, label, CVV_FAIL, "CVV does not match", "N")
            return self._respond(req, label, APPROVED, "Approved. Nothing asks the cardholder", "M" if cvv else None)

        if norm(merchant) in card.stopped:
            return self._respond(req, label, DO_NOT_HONOUR, f"Cardholder stopped all charges from {merchant}", None)

        if cvv:
            result, reason = card.otc.verify(cvv, amount)
            return self._respond(req, label, APPROVED if result == "M" else CVV_FAIL, reason, result)

        # No CVV: whatever the label says, the cardholder approves each charge.
        match = next((a for a in self.approvals if a["status"] == "approved" and a["card"] == card.ref
                      and norm(a["merchant"]) == norm(merchant) and abs(a["amount"] - amount) < 0.005), None)
        if match:
            match["status"] = "used"
            return self._respond(req, label, APPROVED, "Approved under the cardholder's approval of this one charge. The next charge asks again", None)
        pending = next((a for a in self.approvals if a["status"] == "pending" and a["card"] == card.ref
                        and norm(a["merchant"]) == norm(merchant) and abs(a["amount"] - amount) < 0.005), None)
        if pending is None:
            pending = {"id": next(self._ids), "card": card.ref, "merchant": merchant, "amount": amount, "label": label,
                       "status": "pending", "created": self.clock(), "attempts": 0}
            self.approvals.append(pending)
            self._log("APPROVAL_REQUEST", f"Push sent: {merchant} wants ${amount:.2f} ({label}). Nothing is paid unless the cardholder approves.")
        pending["attempts"] += 1
        resp = self._respond(req, label, DO_NOT_HONOUR, "No fresh CVV and no approval from the cardholder yet. Approval request sent", None)
        resp["approvalRequestId"] = pending["id"]
        return resp

    def _respond(self, req, label, code, reason, cvv_result):
        resp = {"responseCode": code, "decision": "APPROVED" if code == APPROVED else "DECLINED", "reason": reason,
                "cvvResult": cvv_result, "transactionType": label, "transactionId": f"T{next(self._ids):06d}"}
        self._log("AUTH", f"{req['merchant']} ${float(req['amount']):.2f} · {label} · {resp['decision']} {code}: {reason}")
        return resp

    def _log(self, kind, text):
        self.log.append({"at": self.clock(), "kind": kind, "text": text})
