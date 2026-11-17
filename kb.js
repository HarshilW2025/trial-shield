// Generated from shield/knowledge/*.md and shield/samples.py in the Django project.
window.TS_KB = [
 {
  "doc_id": "cancel-guides",
  "title": "How cancellation usually works by type of subscription",
  "url": "https://www.westpac.com.au/faq/direct-debit-cancel",
  "sections": [
   {
    "heading": "Streaming and music services",
    "text": "Most streaming and music services let customers cancel online in account settings. The cancellation usually takes effect at the end of the current billing period, with no refund for the part month. Where the bank's in app subscription cancel supports the merchant, the request can be sent from the banking app instead."
   },
   {
    "heading": "App Store subscriptions",
    "text": "Subscriptions bought inside iPhone apps are billed by Apple. They are cancelled in Settings, then the customer's name, then Subscriptions. Deleting the app does not cancel the subscription."
   },
   {
    "heading": "PayPal billed services",
    "text": "Cancel the agreement under Automatic payments in PayPal, and also cancel the account with the service."
   },
   {
    "heading": "Gyms and fitness memberships",
    "text": "Gyms often use direct debits and may have minimum terms or notice periods in the membership agreement. A bank must stop a direct debit on request, but the contract may still require notice to the gym."
   },
   {
    "heading": "Software on annual plans billed monthly",
    "text": "Some software plans advertised per month are 12 month contracts billed monthly, and cancelling early can attract an early termination fee. Cancelling before the trial ends avoids the commitment."
   },
   {
    "heading": "Trap merchants",
    "text": "For subscription trap merchants, stopping the card credential prevents further charges immediately. The customer should also send written notice of cancellation and keep evidence, which supports a dispute if a further charge occurs."
   }
  ]
 },
 {
  "doc_id": "descriptor-patterns",
  "title": "Reading card statement descriptors",
  "url": "https://statementdecoder-web.onrender.com/blog/apple-com-bill-charge-explained",
  "sections": [
   {
    "heading": "APPLE.COM/BILL",
    "text": "Apple bills every App Store app subscription, in app purchase, iCloud+ plan and Apple service under the descriptor APPLE.COM/BILL, often followed by CORK IRL or ITUNES.COM. The app or developer name never appears on the bank statement, so the bank cannot tell which app is charging. To identify the charge, the customer can open Settings on iPhone, tap their name, then Subscriptions, or sign in at reportaproblem.apple.com, which lists every charge with the app name, date and amount. Duplicate charges can happen when a person subscribes once inside an app through Apple and again directly on the vendor's website. A charge can also come from a family member using Family Sharing."
   },
   {
    "heading": "PAYPAL *NAME",
    "text": "PAYPAL * followed by a short merchant name means the payment went through PayPal. The agreement is held in PayPal; it can be cancelled under Automatic payments in the PayPal account."
   },
   {
    "heading": "SP * and SQ *",
    "text": "SP * is a common prefix for small online stores processed through a commerce platform, and SQ * is the Square point of sale prefix. The words after the prefix are usually the store name, sometimes shortened."
   },
   {
    "heading": "DD *",
    "text": "DD indicates a direct debit drawn from the account using a BSB and account number. Banks must stop a direct debit when the customer asks."
   },
   {
    "heading": "Codes and locations",
    "text": "Many merchants add a reference code or a head office city, for example a streaming service billing from Stockholm, or a code after the merchant name. A location different from where the customer shopped is normal and not on its own a sign of fraud."
   },
   {
    "heading": "Small charge then large charge",
    "text": "A small charge such as $1.00 followed some days later by a much larger charge from the same or a similar descriptor is the typical shape of a trial that converted, and of subscription traps where the full price is disclosed only in the fine print."
   }
  ]
 },
 {
  "doc_id": "law-direct-debit-vs-card",
  "title": "Cancelling direct debits versus card recurring payments in Australia",
  "url": "https://www.uts.edu.au/vi/news/2026/04/banks-must-cancel-direct-debits-on-request-why-isnt-it-the-same-for-card-payments",
  "sections": [
   {
    "heading": "Direct debits",
    "text": "When a customer asks their bank to cancel a direct debit, the bank must stop the payment. It cannot require the customer to contact the business first. Direct debits are set up with a BSB and account number and usually appear on statements with a DD prefix."
   },
   {
    "heading": "Card recurring payments",
    "text": "Australian law does not require banks to stop a recurring card payment on request. Some banks offer subscription management in their apps voluntarily; others tell customers to contact the merchant. Westpac's FAQ says customers must contact the merchant to cancel a recurring card payment, or use Savings Finder or the in app subscription cancel where the subscription is eligible."
   },
   {
    "heading": "Overseas comparison",
    "text": "In the UK, banks must stop a recurring card payment on request even if the customer has not contacted the business. In the EU, consumers can withdraw consent for recurring charges on any payment method, including cards. In India, banks must give customers an online way to cancel, pause or manage recurring card payments."
   },
   {
    "heading": "Reform argument",
    "text": "UTS researchers argue Australians deserve equal cancellation rights through their bank regardless of payment method, suggesting an extension of the ePayments Code or a targeted obligation on banks to offer basic subscription controls for card payments."
   }
  ]
 },
 {
  "doc_id": "law-unfair-trading-practices",
  "title": "Unfair Trading Practices Act 2026 and subscription traps",
  "url": "https://mccullough.com.au/2026/07/03/unfair-trading-practices-laws-australia-2027/",
  "sections": [
   {
    "heading": "Status and timing",
    "text": "The Competition and Consumer Amendment (Unfair Trading Practices) Bill 2026 passed Parliament on 2 July 2026. It amends the Australian Consumer Law and takes effect from 1 July 2027."
   },
   {
    "heading": "General prohibition",
    "text": "From 1 July 2027 a business must not engage in conduct that manipulates a consumer, or unreasonably distorts the environment in which the consumer makes a decision, where that causes or is likely to cause financial or other detriment."
   },
   {
    "heading": "Subscription trap requirements",
    "text": "Businesses must disclose key contract information before sign up, including payment terms, contract period, renewal terms and how to cancel. They must send ongoing notices for subscription renewals and for the end of introductory or discounted periods. Cancelling must be accessible and require only reasonably necessary steps to end the contract. A business that offers online sign up must offer online cancellation to every customer, including customers who signed up through another channel."
   },
   {
    "heading": "Penalties",
    "text": "The maximum penalty is the greater of $100 million, three times the value of the benefit obtained, or 30 per cent of adjusted turnover during the breach period."
   },
   {
    "heading": "What it means for customers today",
    "text": "Until 1 July 2027 these obligations do not apply. A customer caught by a hard to cancel subscription before then relies on the existing Australian Consumer Law, card scheme dispute rights and their bank's tools."
   }
  ]
 },
 {
  "doc_id": "pci-cvv-recurring",
  "title": "Why a dynamic CVV cannot stop a recurring charge",
  "url": "https://spreedly.com/blog/what-are-cvc-cvv-codes",
  "sections": [
   {
    "heading": "CVV is checked only when the customer is present",
    "text": "The card verification value (CVV or CVC) proves possession of the card at the moment it is entered. PCI DSS classes it as sensitive authentication data that merchants must not store after authorisation."
   },
   {
    "heading": "Stored credential and merchant initiated transactions",
    "text": "After the first customer initiated transaction, a merchant charges a stored card on file without the CVV. Subscription renewals are merchant initiated transactions, so they carry no CVV check at all."
   },
   {
    "heading": "Consequence",
    "text": "A CVV that changes every 24 hours, such as Westpac's dynamic CVC on its Digital Card, protects against stolen card details being reused, but it cannot block a free trial converting into a paid subscription. The control has to sit on the stored credential itself: a merchant bound token the issuer can suspend."
   }
  ]
 },
 {
  "doc_id": "scheme-rules-free-trials",
  "title": "Visa and Mastercard rules for free trials",
  "url": "https://www.trustpay.eu/?p=6933",
  "sections": [
   {
    "heading": "Visa rules (since 18 April 2020)",
    "text": "Merchants that offer free trials or introductory offers that roll into a subscription must get the cardholder's agreement to the terms, send a confirmation after sign up, and send a reminder at least seven days before the trial or introductory period ends. The reminder must include the date the trial ends, the ongoing amount and billing frequency, and a link or simple way to cancel. The cardholder must be able to cancel online without contacting the merchant through another channel such as a phone call."
   },
   {
    "heading": "Mastercard rules (since 12 April 2019)",
    "text": "For free trials of physical products such as skincare, health products and vitamins, the merchant must obtain the cardholder's explicit approval at the end of the trial before it starts recurring billing, and send the amount, payment date, merchant name and cancellation instructions. The rule does not apply to digital subscriptions."
   },
   {
    "heading": "Limits of scheme rules",
    "text": "Both rules depend on merchants complying and customers reading the reminder email. A customer who misses the reminder is still charged. Disputes over trial conversions are handled after the charge through chargeback rights."
   }
  ]
 },
 {
  "doc_id": "token-lifecycle",
  "title": "Network token lifecycle controls available to issuers",
  "url": "https://developer.visa.com/use-cases/keep-your-card-top-of-wallet",
  "sections": [
   {
    "heading": "Visa Token Service",
    "text": "Through the Visa Token Service provisioning and credential management APIs, an issuer can activate, suspend, resume or delete a token, and update the underlying card number and expiry."
   },
   {
    "heading": "Mastercard MDES",
    "text": "The Mastercard Digital Enablement Service customer service API lets issuers suspend, unsuspend, delete and update tokens."
   },
   {
    "heading": "Card on file visibility",
    "text": "Visa's Card on File Data API lets an issuer show a cardholder which merchants hold their card on file. Visa launched an enhanced Subscription Manager for issuers in March 2026 to view, manage, switch and cancel recurring payments in banking apps. Mastercard offers Smart Subscriptions and Subscription Controls to issuers, and co developed Westpac's in app cancel."
   },
   {
    "heading": "Apple Pay merchant tokens",
    "text": "For recurring payments made with Apple Pay, merchants can request an Apple Pay merchant token (MPAN), which ties together a payment card, a business and a customer instead of a single device. Users can manage merchant tokens in Wallet."
   },
   {
    "heading": "Why this matters for Trial Shield",
    "text": "Because suspend and resume already exist per token, a bank can issue a token bound to one trial merchant and suspend it on the night before the trial converts. The customer's main card keeps working everywhere else."
   }
  ]
 },
 {
  "doc_id": "trap-patterns",
  "title": "Signs of a subscription trap",
  "url": "https://www.westpac.co.nz/about-us/media/westpac-nzs-crackdown-on-subscription-traps-saves-customers-millions/",
  "sections": [
   {
    "heading": "What a subscription trap is",
    "text": "A subscription trap is an offer that looks like a one off purchase or a cheap trial but enrols the customer in recurring payments that are hard to cancel. Westpac NZ describes overseas e-commerce sites that sell real goods but entice customers to authorise misleading recurring payments, disclosing the subscription only in fine print."
   },
   {
    "heading": "Warning signs in offer terms",
    "text": "A tiny upfront price, such as $1 or free with paid shipping, that converts into a much larger recurring charge. A very short trial window of a few days. Automatic enrolment in a second membership or rewards club. Cancellation only by phone, by mail, or during limited overseas business hours. A low monthly price that is actually a 12 month contract, or an early termination fee. A billing name on the statement that differs from the brand. Terms that say charges start unless the customer cancels within a set number of days."
   },
   {
    "heading": "Lower risk signs",
    "text": "The price after the trial is stated clearly next to the sign up button. Cancellation is online in account settings and takes effect at the end of the billing period. The trial length is a week or more and a reminder is promised before it ends."
   }
  ]
 },
 {
  "doc_id": "westpac-tools",
  "title": "Westpac subscription and card tools today",
  "url": "https://www.westpac.com.au/personal-banking/online-banking/insights-hub/subscription-manager/",
  "sections": [
   {
    "heading": "In app subscription cancel",
    "text": "Westpac customers can view and cancel eligible card subscriptions in the Westpac App, a feature co developed with Mastercard and announced in November 2025. The customer finds the transaction, selects Manage and confirms Cancel subscription. Cancellation usually takes 1 to 5 business days depending on the merchant. If a payment is due before cancellation is confirmed, the customer may still be charged. Not all merchants or subscription types are supported. Subscriptions billed through a third party such as PayPal or Apple must be cancelled with that provider or the merchant. Only the primary credit card holder can cancel."
   },
   {
    "heading": "Digital Card and dynamic CVC",
    "text": "The Westpac Digital Card shows a dynamic CVC that changes every 24 hours. Westpac reports an 80 per cent reduction in fraud for customers using the dynamic CVC. The dynamic CVC can still be used to set up recurring card payments."
   },
   {
    "heading": "Savings Finder and Bills Calendar",
    "text": "Savings Finder identifies recurring payments and savings opportunities. Bills Calendar shows upcoming payments."
   },
   {
    "heading": "Westpac NZ subscription trap block",
    "text": "Since April 2024 Westpac NZ blocks recurring payments to overseas online merchants that entice customers into misleading recurring subscriptions, reporting more than $25 million of unwanted charges prevented."
   },
   {
    "heading": "Subscription spending",
    "text": "Westpac data shows customers spend about $6.7 billion a year on subscriptions, and research found 31 per cent of Australians waste money on duplicate or unused services."
   }
  ]
 }
];
window.TS_SAMPLES = {
 "skincare": {
  "label": "$1 skincare kit",
  "text": "LUMIÈRE DERMA | Try our Retinol Glow Kit for just $1 shipping!\nLimited time intro offer. Your kit ships today.\n\n*By completing this order you are enrolled in the Lumière VIP Beauty Club. If you do not cancel within 10 days of your order date, you will be charged $89.95 and receive a full-size kit every 30 days thereafter. You will also receive a complimentary 14 day trial of our Glow Rewards membership which renews at $24.95 per month. To cancel, call our customer care line Monday to Friday 9am to 3pm EST. Charges will appear as LDBEAUTY*CLUB."
 },
 "software": {
  "label": "Photo editor 'monthly' plan",
  "text": "PixelForge Pro, 14 day free trial\nThen just $19.99/mo*\n\n*Annual plan, billed monthly. After your trial you will be enrolled in an annual commitment of 12 monthly payments of $19.99. If you cancel after your 14 day trial, an early termination fee of 50% of your remaining contract obligation applies. Cancel online in Account > Plans before the trial ends to avoid charges."
 },
 "streaming": {
  "label": "Streaming trial",
  "text": "Start your 7-day free trial of Paramount+\nThen A$11.99/month. Cancel anytime.\n\nBy clicking Start Free Trial you agree that your subscription will automatically continue at A$11.99 per month after your free trial unless you cancel before the trial ends. You can cancel in Account > Subscription at any time. Cancellations take effect at the end of the current billing period. No refunds for partial months."
 },
 "meals": {
  "label": "Meal kit confirmation email",
  "text": "Subject: Welcome to FreshFork! Your first box is on its way\n\nHi Alex, thanks for joining FreshFork. Your first box is 60% off ($39.00 today). From your second delivery your plan continues at $94.90 per week (3 meals for 2 people), delivered every Thursday. Skip or cancel any week in the app by 11:59pm Friday, 6 days before delivery. Payments are processed by FRESHFORK PTY LTD."
 }
};
