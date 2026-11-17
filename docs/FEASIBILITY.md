# Trial Shield: feasibility evidence

**Claim.** A Protected card where every purchase needs a fresh one-time CVV, and every later charge needs the cardholder's approval of that one charge, stops subscription traps. Westpac could build it from parts it already runs.

**The rule:** no fresh CVV and no approval from the cardholder means no payment.

## 1. What this proof shows (run it yourself: see the main README)

| Test | Result |
|---|---|
| The one-time code is standard RFC 4226 HOTP | Matches all 10 reference values in RFC 4226 Appendix D |
| One-time CVV, first use | Approved (`00`, CVV result `M`) |
| Same CVV used again | Declined `N7`: one-time CVV already used |
| CVV after 10 minutes, or above the approved amount | Declined `N7` |
| 3 wrong CVVs in a row | Card-not-present payments lock |
| Brute force while a code is live (100,000 simulated attacks) | About 0.3% succeed (0.30% to 0.33% across runs; theory 0.300%), capped at the amount approved |
| Trial converts (`MERCHANT_INITIATED` · `RECURRING`, no CVV) | Declined `05`, approval request sent to the phone |
| Hidden add-on membership | Declined `05`, separate approval request |
| One-click order on the saved card (`ONE_CLICK` · `CREDENTIAL_ON_FILE`) | Declined `05`, approval request |
| Dishonest merchant leaves the labels off | Still declined `05`: the rule does not trust labels |
| Card details skimmed at checkout, used at another shop | Declined `N7` |
| Cardholder approves the renewal | The merchant's retry is approved, once |
| The next month's renewal | Asks again |
| Price rise | Asks again |
| Same requests on an ordinary card | All approved, nothing asks the cardholder |
| Browser extension, plain checkout form | Finds the form, shows the catch ($114.90 a month), fills the Protected card and a one-time CVV after the phone approval |
| Browser extension, card fields in a cross-origin hosted frame with no autocomplete attributes (Stripe or Shopify style) | Fills all 3 fields inside the payment provider's frame |

16 automated tests pass (`python3 bank/tests.py`). The end-to-end run uses real Chrome with the extension loaded; screenshots are in `screenshots/`.

## 2. Every piece already runs in production

| Piece | Already running | Source |
|---|---|---|
| Issuer verifies a CVV that is not fixed | Westpac's Digital Card dynamic CVC, which updates every 24 hours | https://www.westpac.com.au/security/protect-yourself-and-your-business/ |
| Dynamic CVV at scale | IDEMIA Motion Code, built on Visa's dCVV2 specification; over 600,000 cards in ten countries by 2018 | https://www.businesswirechina.com/en/news/37913.html , https://www.electronicpaymentsinternational.com/news/pnc-trials-dynamic-cvv2-technology-commercial-card-customers |
| Card details that work once | Revolut disposable virtual cards since 2018: details are destroyed and regenerated after each payment | https://www.revolut.com/blog/post/how-to-create-disposable-card/ |
| A one-time code approved in the app | Westpac Protect Security Code: a one-time passcode by app notification or SMS | https://www.westpac.com.au/security/protect-yourself-and-your-business/smscode/ |
| The bank knows who started a charge | Visa and Mastercard stored credential frameworks (2017): merchants must flag stored credential and merchant initiated charges | https://merchantriskcouncil.org/learning/resource-center/member-news/blog/2025/boosting-authorization-success-a-practical-guide-to-visa-nti-and-mastercard-trace-id-mandates |
| The same labels at Westpac | Westpac's OnlinePay gateway labels every charge: `ONE_CLICK`, `MERCHANT_INITIATED`, `RECURRING`, `CREDENTIAL_ON_FILE`, `UNSCHEDULED_CREDENTIAL_ON_FILE` | https://merchants.westpac.com.au/onlinepay/reference/ecom-payments |
| Later charges carry no CVV | PCI DSS 3.3.1.2: the CVV may not be stored after authorisation, and the PCI Council says it is not needed for recurring charges | https://www.pcisecuritystandards.org/faqs/1280/ |
| A bank extension that fills card details at checkout | Capital One Eno makes merchant-specific virtual cards from the checkout page | https://www.capitalone.com/digital/eno/virtual-card-numbers/ |
| Merchant tokens the bank controls | Westpac My Merchants | https://www.westpac.com.au/personal-banking/mobile-wallets/my-merchants/ |

## 3. What is new

The pieces exist separately. The gap is between them:

* **Revolut's disposable card** stops repeat charges by killing the card number, so it cannot be used for subscriptions at all, including ones the customer wants (https://www.which.co.uk/news/2018/03/revolut-launches-disposable-virtual-cards-to-fight-online-fraud/).
* **Dynamic CVVs** (Westpac's 24 hour CVC, Motion Code) protect against stolen details. They cannot stop a renewal, because renewals never carry a CVV.

The Protected card adds a rule at the issuer: a charge without a fresh CVV needs the cardholder's approval of that one charge. That keeps the subscriptions people want and stops the ones they forgot. It does not depend on merchants labelling charges honestly.

## 4. Why the one-time CVV is a strong barrier

| | Static CVV (today) | One-time CVV |
|---|---|---|
| Card details leaked or skimmed | Work until the card is replaced | Worthless once used, and after 10 minutes |
| Guessing | Unlimited across shops unless the bank detects it | 3 tries, then locked: under 0.3%, only while a code is live, only up to the amount approved |
| Renewal after a free trial | Goes through (no CVV is sent) | Waits for the cardholder's approval |

## 5. Honest limits and what production needs

* **A bank cannot hold a payment open while someone reaches for their phone.** So the approval request goes out ahead of an expected charge. An unapproved charge is declined, and subscription merchants routinely retry declined charges, so an approval given late still lets the retry through.
* **CVV verification** would sit in Westpac's card processing, where the 24 hour dynamic CVC is already checked. Visa's dCVV2 service shows networks can verify dynamic codes for issuers too.
* **The approval channel** exists: Westpac already sends app approvals and one-time codes.
* **The extension** needs a security review and store listing. The Protected card also works without it: the customer gets the CVV from the app and types it in, or uses Apple Pay.
* **Customer effort:** approvals are per charge on the Protected card only. Subscriptions the customer wants stay on the Everyday card.
* **This proof** was run on two demo shops covering the two common checkout patterns. It has not been run on live merchant sites from this environment. Try it on a real checkout yourself: the card numbers are not real cards, so nothing can be charged.
