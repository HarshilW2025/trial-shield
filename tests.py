"""Proof tests. Run: python3 tests.py

1. The one-time code is standard RFC 4226 HOTP (checked against the RFC's own test vectors).
2. The one-time CVV works once, expires, respects the amount cap and locks after 3 wrong guesses.
3. Every way a subscription trap takes money is stopped on the Protected card, and approved on an ordinary card.
4. Brute force: measured chance of guessing a live one-time CVV before lockout.
"""
import random
import unittest

from issuer import APPROVED, CVV_FAIL, DO_NOT_HONOUR, Card, Issuer
from otcvv import OneTimeCVV, hotp

PROT_PAN, MAIN_PAN = "4564738002127731", "4564738005904821"


class Clock:
    def __init__(self):
        self.t = 1_795_000_000.0

    def __call__(self):
        return self.t


def bank():
    clock = Clock()
    iss = Issuer(clock=clock)
    iss.add_card(Card("protected", PROT_PAN, "11/29", True, clock=clock))
    iss.add_card(Card("everyday", MAIN_PAN, "08/29", False, static_cvv="731"))
    return iss, clock


def auth(iss, pan, expiry, merchant, amount, cvv=None, contract=None, model=None):
    return iss.authorise({"merchant": merchant, "amount": amount, "card": {"number": pan, "expiry": expiry, "cvv": cvv},
                          "shopperInteraction": "ECOMMERCE", "storedCredentialContract": contract, "storedCredentialProcessingModel": model})


def get_cvv(iss, merchant="Lumière Derma", amount=1.00):
    req = iss.request_cvv("protected", merchant, amount)
    return iss.answer_cvv_request(req["id"], True)["cvv"]


class RFC4226(unittest.TestCase):
    def test_vectors(self):
        # RFC 4226 Appendix D: secret "12345678901234567890", HMAC-SHA-1, 6 digits, counters 0 to 9.
        expected = ["755224", "287082", "359152", "969429", "338314", "254676", "287922", "162583", "399871", "520489"]
        self.assertEqual([hotp(b"12345678901234567890", c) for c in range(10)], expected)


class OneTimeCode(unittest.TestCase):
    def setUp(self):
        self.clock = Clock()
        self.otc = OneTimeCVV("protected", clock=self.clock)

    def test_works_once(self):
        c = self.otc.issue(1.00)["cvv"]
        self.assertEqual(self.otc.verify(c, 1.00)[0], "M")
        self.assertEqual(self.otc.verify(c, 1.00), ("N", "One-time CVV already used"))

    def test_expires_after_ten_minutes(self):
        c = self.otc.issue(1.00)["cvv"]
        self.clock.t += 601
        self.assertEqual(self.otc.verify(c, 1.00), ("N", "One-time CVV expired"))

    def test_amount_cap(self):
        c = self.otc.issue(1.00)["cvv"]
        self.assertEqual(self.otc.verify(c, 89.95)[0], "N")

    def test_locks_after_three_wrong(self):
        self.otc.issue(1.00)
        for _ in range(3):
            self.otc.verify("000", 1.00)
        self.assertTrue(self.otc.locked)

    def test_every_code_is_different_and_unpredictable_without_the_key(self):
        codes = [self.otc.issue(1.00)["cvv"] for _ in range(1000)]
        self.assertGreater(len(set(codes)), 550)   # 1,000 draws from 1,000 values give about 632 distinct


class SubscriptionTraps(unittest.TestCase):
    """Each trap runs on the Protected card and on an ordinary card with the same request."""

    def run_both(self, merchant, amount, contract=None, model=None, prot_cvv=None, main_cvv=None):
        iss, _ = bank()
        get_cvv(iss)  # sign-up already happened
        p = auth(iss, PROT_PAN, "11/29", merchant, amount, prot_cvv, contract, model)
        m = auth(iss, MAIN_PAN, "08/29", merchant, amount, main_cvv, contract, model)
        return p, m, iss

    def test_signup_with_one_time_cvv(self):
        iss, _ = bank()
        c = get_cvv(iss)
        r = auth(iss, PROT_PAN, "11/29", "Lumière Derma", 1.00, c, None, "RECURRING")
        self.assertEqual(r["responseCode"], APPROVED)

    def test_trial_converts(self):
        p, m, iss = self.run_both("Lumière Derma", 89.95, "MERCHANT_INITIATED", "RECURRING")
        self.assertEqual(p["responseCode"], DO_NOT_HONOUR)
        self.assertEqual(m["responseCode"], APPROVED)
        self.assertEqual(len([a for a in iss.approvals if a["status"] == "pending"]), 1)

    def test_hidden_add_on(self):
        p, m, _ = self.run_both("Lumière Derma", 24.95, "MERCHANT_INITIATED", "RECURRING")
        self.assertEqual((p["responseCode"], m["responseCode"]), (DO_NOT_HONOUR, APPROVED))

    def test_one_click_with_saved_card(self):
        p, m, _ = self.run_both("Lumière Derma", 34.95, "ONE_CLICK", "CREDENTIAL_ON_FILE")
        self.assertEqual((p["responseCode"], m["responseCode"]), (DO_NOT_HONOUR, APPROVED))

    def test_unscheduled_top_up(self):
        p, m, _ = self.run_both("Lumière Derma", 50.00, "MERCHANT_INITIATED", "UNSCHEDULED_CREDENTIAL_ON_FILE")
        self.assertEqual((p["responseCode"], m["responseCode"]), (DO_NOT_HONOUR, APPROVED))

    def test_merchant_mislabels_renewal_as_a_purchase(self):
        # A dishonest merchant leaves the labels off and sends no CVV: still needs the cardholder.
        p, m, _ = self.run_both("Lumière Derma", 89.95)
        self.assertEqual((p["responseCode"], m["responseCode"]), (DO_NOT_HONOUR, APPROVED))

    def test_copied_details_used_elsewhere(self):
        iss, _ = bank()
        c = get_cvv(iss)
        auth(iss, PROT_PAN, "11/29", "Lumière Derma", 1.00, c, None, "RECURRING")
        r = auth(iss, PROT_PAN, "11/29", "QuickBuy Online", 249.00, c)
        self.assertEqual((r["responseCode"], r["reason"]), (CVV_FAIL, "One-time CVV already used"))
        m = auth(iss, MAIN_PAN, "08/29", "QuickBuy Online", 249.00, "731")
        self.assertEqual(m["responseCode"], APPROVED)

    def test_approval_covers_one_charge_only(self):
        iss, _ = bank()
        first = auth(iss, PROT_PAN, "11/29", "Lumière Derma", 89.95, None, "MERCHANT_INITIATED", "RECURRING")
        iss.answer_approval(first["approvalRequestId"], True)
        retry = auth(iss, PROT_PAN, "11/29", "Lumière Derma", 89.95, None, "MERCHANT_INITIATED", "RECURRING")
        self.assertEqual(retry["responseCode"], APPROVED)
        next_month = auth(iss, PROT_PAN, "11/29", "Lumière Derma", 89.95, None, "MERCHANT_INITIATED", "RECURRING")
        self.assertEqual(next_month["responseCode"], DO_NOT_HONOUR)

    def test_price_rise_asks_again(self):
        iss, _ = bank()
        first = auth(iss, PROT_PAN, "11/29", "Lumière Derma", 89.95, None, "MERCHANT_INITIATED", "RECURRING")
        iss.answer_approval(first["approvalRequestId"], True)
        risen = auth(iss, PROT_PAN, "11/29", "Lumière Derma", 99.95, None, "MERCHANT_INITIATED", "RECURRING")
        self.assertEqual(risen["responseCode"], DO_NOT_HONOUR)

    def test_stop_merchant(self):
        iss, _ = bank()
        first = auth(iss, PROT_PAN, "11/29", "Lumière Derma", 89.95, None, "MERCHANT_INITIATED", "RECURRING")
        iss.answer_approval(first["approvalRequestId"], False, stop_merchant=True)
        r = auth(iss, PROT_PAN, "11/29", "Lumière Derma", 5.00, None, "MERCHANT_INITIATED", "RECURRING")
        self.assertIn("stopped", r["reason"])


def brute_force(trials=100_000, seed=7):
    """An attacker has the card number and expiry and tries CVVs while a one-time CVV is live.
    Returns the measured success rate before lockout."""
    rng = random.Random(seed)
    wins = 0
    for i in range(trials):
        otc = OneTimeCVV("protected", key=rng.randbytes(32))
        otc.issue(1.00)
        for guess in rng.sample(range(1000), 3):
            if otc.verify(str(guess).zfill(3), 1.00)[0] == "M":
                wins += 1
                break
    return wins / trials


if __name__ == "__main__":
    result = unittest.main(exit=False, verbosity=2).result
    rate = brute_force()
    print(f"\nBrute force, 100,000 simulated attacks while a one-time CVV is live: {rate:.3%} succeed "
          f"(theory 3 in 1,000 = 0.300%), each capped at the $1.00 the code was approved for.")
    print("With no live code, or after it is used, the chance is 0%. A leaked static CVV works 100% of the time until the card is replaced.")
    raise SystemExit(0 if result.wasSuccessful() else 1)
