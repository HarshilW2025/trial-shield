"""One-time CVV for the Protected card.

The code is an HMAC-based one-time password, the construction in RFC 4226 that authenticator apps and bank
security codes use, and the same idea as the dynamic CVV2 cards built to Visa's dCVV2 specification. Here it is cut
to 3 digits and bound to what the customer approved:

    code = HOTP(card_key, counter || SHA-256(card | amount cap | expiry), 3 digits)

The issuer keeps only the counter and the binding (never a list of codes) and recomputes the code at authorisation.
A code works once, only until it expires, and only up to the amount the customer approved. Three wrong guesses lock
the card's card-not-present payments, so guessing is no better than 3 in 1,000 even while a code is open.
"""
import hashlib
import hmac
import secrets
import struct
import time


def hotp(key: bytes, message, digits: int = 6, digest=hashlib.sha1) -> str:
    """RFC 4226 HOTP. `message` is the 8 byte counter (int) or any bytes. Dynamic truncation per RFC 4226 5.3."""
    msg = struct.pack(">Q", message) if isinstance(message, int) else message
    mac = hmac.new(key, msg, digest).digest()
    offset = mac[-1] & 0x0F
    value = struct.unpack(">I", mac[offset:offset + 4])[0] & 0x7FFFFFFF
    return str(value % (10 ** digits)).zfill(digits)


def _binding(card_ref: str, counter: int, cap_cents: int, expires_at: int) -> bytes:
    return struct.pack(">Q", counter) + hashlib.sha256(f"{card_ref}|{cap_cents}|{expires_at}".encode()).digest()


class OneTimeCVV:
    TTL_SECONDS = 600       # 10 minutes, like a bank security code
    LOCKOUT_AFTER = 3       # consecutive wrong CVVs before card-not-present payments lock

    def __init__(self, card_ref: str, key: bytes = None, clock=time.time):
        self.card_ref = card_ref
        self.key = key or secrets.token_bytes(32)   # in production this key lives in the issuer's HSM
        self.clock = clock
        self.counter = 0
        self.issued = []        # binding records only: counter, cap, expiry, used
        self.failures = 0
        self.locked = False

    def _code(self, rec) -> str:
        return hotp(self.key, _binding(self.card_ref, rec["counter"], rec["cap_cents"], rec["expires_at"]), 3, hashlib.sha256)

    def issue(self, amount_cap: float, merchant_hint: str = "") -> dict:
        self.counter += 1
        rec = {"counter": self.counter, "cap_cents": int(round(amount_cap * 100)), "expires_at": int(self.clock()) + self.TTL_SECONDS,
               "used": False, "merchant_hint": merchant_hint}
        self.issued.append(rec)
        return {"cvv": self._code(rec), "expires_at": rec["expires_at"], "counter": rec["counter"], "cap": amount_cap}

    def verify(self, cvv: str, amount: float):
        """Returns (result, reason). result is 'M' (match) or 'N' (no match), as in a CVV2 result code."""
        if self.locked:
            return "N", "Card-not-present payments locked after repeated wrong CVVs"
        now, cents = int(self.clock()), int(round(amount * 100))
        live = [r for r in self.issued if not r["used"] and r["expires_at"] >= now]
        for rec in sorted(live, key=lambda r: -r["counter"]):
            if hmac.compare_digest(self._code(rec), str(cvv)):
                if cents > rec["cap_cents"]:
                    return "N", f"Above the ${rec['cap_cents'] / 100:.2f} this CVV was approved for"
                rec["used"] = True
                self.failures = 0
                return "M", "One-time CVV matched and is now retired"
        # Not a live code. Say why when we can, then count it as a failure.
        reason = "CVV does not match"
        for rec in self.issued:
            if hmac.compare_digest(self._code(rec), str(cvv)):
                reason = "One-time CVV already used" if rec["used"] else "One-time CVV expired"
                break
        self.failures += 1
        if self.failures >= self.LOCKOUT_AFTER:
            self.locked = True
            reason += f"; {self.LOCKOUT_AFTER} wrong CVVs in a row, card-not-present payments locked"
        return "N", reason
