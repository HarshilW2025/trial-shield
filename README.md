# Trial Shield

**Stop subscription traps before they charge you.** Bytes and Balance, University of Queensland. Westpac Innovation and Coding Competition 2026.

A "$1 today" offer can quietly become $114.90 a month. Trial Shield gives the customer a second card on the same account, the **Protected card**:

* **A fresh one-time CVV for every purchase.** The banking app makes it like a security code. It works once, for 10 minutes, up to the amount approved.
* **Every later charge asks the customer first.** That covers renewals, add-ons, one-click orders, App Store and PayPal. No answer means no.
* **One rule:** no fresh CVV and no approval means no payment. Merchants can't get around it by labelling a charge differently.

A browser extension reads the fine print at checkout, shows the catch in plain words, suggests the Protected card and fills it in.

## What's here

| File | What it is |
|---|---|
| `trial-shield-web-prototype.zip` | The full app concept: the customer's banking app (Protected card, approvals, checkout demo, merchant test bench, fine print reader, explain a charge, subscriptions) and the bank staff view (operations, impact, trap merchant watchlist, disputes, Power BI export) |
| `trial-shield-extension-and-bank.zip` | The working proof: a real Chrome extension, a bank service that makes and checks one-time CVVs, two made-up shops with back offices, 16 automated tests, screenshots and `FEASIBILITY.md` with sources |

Every card number is made up, so nothing can be charged anywhere.

## Run the web prototype (1 minute)

1. Download and unzip `trial-shield-web-prototype.zip`.
2. Open `index.html` in Chrome.
3. Choose **Customer** or **Bank staff**.

Try these:
* **Home:** approve or decline the waiting Kayo Sports charge.
* **Cards Hub, then Protected card:** get a one-time CVV.
* **Checkout demo, then Run all:** the merchant test bench shows the Everyday card losing $932.64 and the Protected card $0.00.
* **Check an offer's fine print:** use the skincare example.

Opened as a local file, it uses its built-in offline rules to read fine print and explain charges, so no internet or API key is needed.

## Run the extension demo (2 minutes)

You need Python 3.9 or later (no packages) and Google Chrome.

1. Download and unzip `trial-shield-extension-and-bank.zip`.
2. **Start the bank and shops.** On a Mac, double-click `start-demo.command`. Or run:
   ```
   cd trial-shield-extension-and-bank/bank
   python3 server.py
   ```
3. **Load the extension.** In Chrome, open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and choose the `extension` folder.
4. **Open the banking app** at http://127.0.0.1:8790/app in a window beside the shop. This is where the customer approves.

## Demo walkthrough

1. Open http://localhost:8801. The extension shows the catch in red: $1 today, then **$89.95 a month from day 10, plus $24.95 a month from day 14, about $114.90 a month**.
2. Keep **Protected card**, click **Fill card details**, and approve in the banking app. The card number and a fresh CVV fill in.
3. Click **Pay $1.00**: approved. Click it again: **declined N7, one-time CVV already used**.
4. Open http://localhost:8801/office, the shop's back office. Try:
   * **Charge the subscription**: declined, and an approval request appears in the banking app.
   * **Dishonest renewal with no labels**: still declined.
   * **Attacker reuses the copied card details**: declined N7.
5. Approve the $89.95 in the banking app, then charge twice. The first is approved, and the second asks again.
6. Open http://localhost:8802. The extension fills card fields inside a payment box from another website, the way Stripe's work.
7. On the checkout, pick **Everyday Debit** to see the warning about what would go through.

To run the tests:
```
cd trial-shield-extension-and-bank/bank
python3 tests.py
```

## Why Westpac can build it

Westpac already has a CVC that changes every 24 hours, one-time codes through Westpac Protect, and labels on every card charge through its OnlinePay gateway. The proof uses OnlinePay's own field names. Sources are in `FEASIBILITY.md` inside the extension zip.

## Disclaimer

This is a student concept, not a Westpac product. It uses example data, simulated card network calls and made-up shops.
