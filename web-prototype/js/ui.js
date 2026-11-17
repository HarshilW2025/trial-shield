// Views for the Trial Shield web prototype.
// Customer: the banking app (with notes mapping each screen to the Westpac App today) and a checkout demo on a
// fictional merchant site, where the customer picks their Everyday card or their Protected card.
// Bank staff: the operations console. Hash routed.
(function () {
  "use strict";
  const E = window.TS, A = window.TSAI;
  const $ = (sel) => document.querySelector(sel);
  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const app = $("#app");
  const freshExt = () => ({ open: true, scan: null, busy: false, card: null, step: "choose", cvvId: null });
  const freshForm = () => ({ pan: "", exp: "", cvv: "", result: null, ok: false, signed: null });
  const ui = { scan: null, scanText: null, sample: "skincare", busy: {}, consoleSource: "", showDigital: false,
    ext: freshExt(), form: freshForm(), cvvReq: null, wallet: "prot", traps: {} };
  if (!E.load()) E.seed();
  ["disputes", "blocked", "scans", "approvals"].forEach((k) => { E.s[k] = E.s[k] || []; });

  // ---------- small helpers ----------
  const chip = (cls, text, icon) => `<span class="chip chip-${cls}">${icon ? `<i class="bi bi-${icon}"></i> ` : ""}${esc(text)}</span>`;
  const avatar = (n) => `<div class="ts-avatar">${esc(E.plain(String(n)).replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase())}</div>`;
  const day = (ms, o) => E.fmtMs(ms, o || { weekday: "short", day: "numeric", month: "short" });
  const dShort = (d) => E.fmt(d, { weekday: "short", day: "numeric", month: "short" });
  const bold = (escaped) => escaped.replace(/(\$\d[\d,]*(?:\.\d{2})?(?: (?:a|per|every) (?:week|fortnight|month|year|30 days))?|\b\d+ days\b|\bevery 30 days\b|\b12 month contract\b)/g, "<strong>$1</strong>");
  const tokenOf = (ref) => (ref ? E.s.tokens[ref] : null);
  const SHOP = { merchant: "Lumière Derma", descriptor: "LDBEAUTY*CLUB", amount: 1, url: "lumiere-derma.example/checkout" };
  const short = (m) => String(m).replace(/^PayPal: /, "").split(" ")[0];
  const monthlyTotal = (d) => (d.costs || []).reduce((a, c) => a + E.monthly(c), 0);
  const GENERIC = /^(full[- ]size kit|kit|box|bottle|delivery|main plan|subscription)$/i;
  const what = (w) => (GENERIC.test(w) ? "the " + w.toLowerCase() : w);
  function catchDetail(d) {
    if (!d.costs || !d.costs.length) return "";
    const first = d.costs[0];
    const parts = d.costs.map((c, i) => `${i ? "plus " : ""}${E.money(c.amount)} a ${c.cycle} for ${what(c.what)}${i && c.starts && c.starts !== first.starts ? " " + c.starts : ""}`);
    const lead = first.starts ? first.starts.charAt(0).toUpperCase() + first.starts.slice(1) : "After the trial";
    return `${lead} you'll be charged ${parts.join(", ")}${d.costs.length > 1 ? `: about ${E.money(monthlyTotal(d))} a month in total` : ""}.`;
  }
  const riskClass = (r) => (r === "high" ? "" : r === "medium" ? "medium" : "low");
  const riskLabel = (r) => (r === "high" ? "Warning: likely subscription trap" : r === "medium" ? "Read this before you agree" : "Fair terms");
  const riskIcon = (r) => (r === "high" ? "exclamation-octagon-fill" : r === "medium" ? "exclamation-triangle-fill" : "check-circle-fill");
  function toast(msg) {
    const el = document.createElement("div");
    el.className = "toast align-items-center border-0 text-bg-dark"; el.setAttribute("role", "status");
    el.innerHTML = `<div class="d-flex"><div class="toast-body">${esc(msg)}</div><button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button></div>`;
    const box = $("#toasts"); box.appendChild(el); while (box.children.length > 3) box.firstElementChild.remove(); new bootstrap.Toast(el, { delay: 5000 }).show(); el.addEventListener("hidden.bs.toast", () => el.remove());
  }
  function aiPill() {
    const st = A.state, p = $("#aiPill"); if (!p) return;
    p.className = "ts-pill " + (st === "offline" ? "offline" : st === "checking" ? "" : "live");
    p.lastElementChild.textContent = st === "offline" ? "Offline rules" : st === "checking" ? "Connecting AI" : "AI live · Claude";
  }
  document.addEventListener("ts-ai", aiPill);
  // One-time CVV countdowns
  function tick() {
    document.querySelectorAll("[data-exp]").forEach((el) => {
      const ms = Number(el.dataset.exp) - Date.now();
      el.textContent = ms > 0 ? `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}` : "expired";
    });
  }
  setInterval(tick, 1000);

  // ---------- Westpac today: where each screen sits (from Westpac's public pages) ----------
  const SRC = {
    cardsHub: ["Cards Hub", "https://www.westpac.com.au/personal-banking/online-banking/making-the-most/cards-hub/"],
    digital: ["Digital Card access", "https://westpac.com.au/faq/digital-card-access"],
    cvc: ["Dynamic CVC FAQ", "https://westpac.com.au/faq/digital-card-temp-pin"],
    unknown: ["Identify unknown transactions", "https://www.westpac.com.au/personal-banking/online-banking/making-the-most/identify-unknown-transaction/"],
    subs: ["Cancel subscriptions in the app", "https://www.westpac.com.au/personal-banking/online-banking/insights-hub/subscription-manager/"],
    search: ["Smart Search", "https://www.westpac.com.au/faq/filter-transactions"],
    dd: ["Cancelling a direct debit", "https://www.westpac.com.au/faq/direct-debit-cancel"],
    push: ["Push notifications", "https://www.westpac.com.au/personal-banking/online-banking/making-the-most/notifications/"],
    protect: ["Westpac Protect Security Code", "https://www.westpac.com.au/security/protect-yourself-and-your-business/smscode/"],
    gateway: ["Westpac payment gateway: card transaction types", "https://merchants.westpac.com.au/onlinepay/reference/ecom-payments"],
    mymerchants: ["My Merchants", "https://www.westpac.com.au/personal-banking/mobile-wallets/my-merchants/"],
    threeds: ["3D Secure", "https://merchants.westpac.com.au/docs/3d-secure"],
    eno: ["Capital One Eno virtual cards", "https://www.capitalone.com/digital/eno/virtual-card-numbers/"],
  };
  const src = (k) => `<a class="src" href="${SRC[k][1]}" target="_blank" rel="noopener">${esc(SRC[k][0])}</a>`;
  const item = (x) => (Array.isArray(x) ? `<li>${esc(x[0])}${x[1] ? " " + src(x[1]) : ""}</li>` : `<li>${esc(x)}</li>`);
  const NOTES = {
    home: { title: "Home and Smart Search", today: [["Push notifications for things like deposits or a new card on the way: search Notifications in Smart Search.", "push"], ["Smart Search finds features by name, such as Digital card or Cards Hub.", "search"]],
      added: ["Approval requests on Home and on the lock screen: approve or decline one charge at a time.", "Coming up: every charge a sign-up will make, and whether it will ask you first."] },
    cards: { title: "Cards Hub", today: [["Cards Hub manages cards in the app: search Cards Hub in Smart Search.", "cardsHub"], ["Digital Card: Show Digital Card for the card details including the CVC.", "digital"], ["The dynamic CVC changes every 24 hours, and can still be used to set up recurring payments.", "cvc"], ["My Merchants swaps the card number for a digital token at selected merchants.", "mymerchants"]],
      added: ["A second card on the same account, the Protected card, next to the Everyday card. The customer picks one at each checkout.", "A setting on the Everyday card to ask before charges from new subscriptions, in case the wrong card was used.", "Four ways to pick a card at checkout."] },
    protected: { title: "Protected card", today: [["Westpac Protect Security Code: a one-time passcode by app notification or SMS to confirm certain transactions.", "protect"], ["Westpac's own payment gateway labels every card charge: a one-off purchase, a one-click purchase with saved details, a subscription sign-up, or a later charge the merchant starts itself.", "gateway"], ["The dynamic CVC changes every 24 hours, so it cannot stop a renewal, which carries no CVV.", "cvc"]],
      added: ["A one-time CVV for every purchase, like a security code: valid 10 minutes, retired after one use, and locked to one shop and amount when the extension asks for it.", "Every charge without a fresh CVV waits for the customer to approve that one charge. The bank can tell these charges apart using the labels above.", "An approval never becomes a standing permission. No answer means decline."] },
    fineprint: { title: "Check an offer's fine print", today: [["Nothing in the app reads offer terms before you pay today. Customers rely on the merchant's reminder email.", null]],
      added: ["AI reads the fine print and leads with the catch in bold.", "Every warning is linked to the exact words in the fine print, highlighted.", "The result says which card to use. The charges it finds are the ones the Protected card will ask you about."] },
    activity: { title: "Transactions", today: [["Tap a transaction to view more details. If you are unsure, a temporary card lock keeps the card secure.", "unknown"]],
      added: ["Explain this charge: the likely service, how sure we are, and where to check, even for APPLE.COM/BILL.", "A declined charge that is waiting for you can be approved right here.", "Ask a banker: sends the charge history to the bank's disputes queue."] },
    subscriptions: { title: "Subscriptions", today: [["Cancel eligible card subscriptions in the app; it takes 1 to 5 business days. Apple and PayPal billing are not covered.", "subs"], ["Direct debits can be stopped by the bank on request.", "dd"]],
      added: ["Every subscription shows the right way out: in app cancel, pause the merchant's token, stop the direct debit, or the Apple steps.", "Subscriptions on the Protected card ask before every renewal. Stopping one blocks the merchant."] },
  };
  const SHOP_NOTES = {
    today: [["3D Secure: the bank can confirm an online purchase while the shopper is at the checkout. It does not cover later charges the merchant starts itself.", "threeds"],
      ["My Merchants: digital tokens for selected merchants, found under Cards, then Controls.", "mymerchants"],
      ["Apple Pay: each purchase needs Face ID, but a merchant token set up for a subscription charges later without it.", null]],
    added: [["A browser extension at the checkout, the pattern Capital One's Eno uses in the US. It reads the fine print, suggests a card and fills a fresh CVV.", "eno"],
      "The Protected card in the Apple Pay wallet next to the Everyday card.",
      "A merchant test bench: every way a subscription can take money, on both cards."],
  };

  // =====================================================================
  // Role picker
  // =====================================================================
  function picker() {
    document.title = "Trial Shield";
    app.innerHTML = `
      <div class="ts-picker"><div class="ts-picker-inner">
        <div class="d-flex align-items-center gap-2 mb-2"><span class="ts-brand p-0"><span class="mark"><i class="bi bi-shield-check"></i></span></span><span class="fw-bold fs-5">Trial Shield</span></div>
        <h1 class="h2 fw-bold mb-2" style="text-wrap: balance">Stop subscription charges before they happen</h1>
        <p class="text-muted mb-4" style="max-width: 62ch">Choose a view. The customer sees Trial Shield in their banking app and at a website's checkout. Bank staff see the operations console, impact analytics, trap merchants and disputes. Demo accounts only; no password needed.</p>
        <div class="row g-3">
          <div class="col-md-6"><button class="ts-role" data-act="role" data-role="customer">
            <span class="icon"><i class="bi bi-phone"></i></span><h2>Customer</h2>
            <span class="text-muted">Alex Nguyen · Everyday Debit •••• 4821 and Protected card •••• 7731</span>
            <span class="small">A one-time CVV for every purchase, approval before every later charge, the checkout extension and Apple Pay, the fine print reader and subscriptions.</span>
            <span class="btn btn-primary align-self-start mt-1">Continue as customer</span></button></div>
          <div class="col-md-6"><button class="ts-role" data-act="role" data-role="staff">
            <span class="icon"><i class="bi bi-building"></i></span><h2>Bank staff</h2>
            <span class="text-muted">Payments and fraud operations</span>
            <span class="small">Operations console, impact analytics, trap merchant watchlist, disputes queue and Power BI feeds.</span>
            <span class="btn btn-outline-primary align-self-start mt-1">Continue as bank staff</span></button></div>
        </div>
      </div></div>`;
  }

  // =====================================================================
  // Customer app
  // =====================================================================
  function custShell(screen, html) {
    const n = NOTES[screen];
    const tab = { home: "home", cards: "cards", protected: "cards", fineprint: "cards", activity: "activity", subscriptions: "subscriptions" }[screen];
    const pend = E.pending().length;
    app.innerHTML = `
      <div class="ts-cust">
        <section class="ts-phone" aria-label="Banking app">
          <div class="ts-phone-top position-relative">
            <div class="hello"><div><div class="small text-muted">${day(E.s.now, { weekday: "long", day: "numeric", month: "long" })}</div><div class="fw-bold">Hi Alex</div></div>
              <span class="ts-pill" id="aiPill"><span class="dot"></span><span>Connecting AI</span></span></div>
            <div class="ts-search"><i class="bi bi-search text-muted"></i><input id="smartSearch" type="search" placeholder="Smart Search" aria-label="Smart Search" autocomplete="off"></div>
            <div class="ts-suggest d-none" id="suggest" role="listbox"></div>
          </div>
          <div class="ts-phone-body" id="screen">${html}</div>
          <nav class="ts-phone-tabs" aria-label="App sections">
            <a href="#home" class="${tab === "home" ? "active" : ""}"><i class="bi bi-house"></i>Home${pend ? `<span class="ts-tabdot">${pend}</span>` : ""}</a>
            <a href="#cards" class="${tab === "cards" ? "active" : ""}"><i class="bi bi-credit-card-2-front"></i>Cards</a>
            <a href="#activity" class="${tab === "activity" ? "active" : ""}"><i class="bi bi-receipt"></i>Activity</a>
            <a href="#subscriptions" class="${tab === "subscriptions" ? "active" : ""}"><i class="bi bi-arrow-repeat"></i>Subscriptions</a>
          </nav>
        </section>
        <aside class="ts-notes" aria-label="How this fits the Westpac App">
          <div><div class="small text-muted fw-semibold text-uppercase" style="letter-spacing:.06em">Where this sits in the Westpac App</div><h2>${esc(n.title)}</h2></div>
          <div class="ts-note today"><div class="kicker"><i class="bi bi-check2-square"></i> In the Westpac App today</div><ul>${n.today.map(item).join("")}</ul></div>
          <div class="ts-note added"><div class="kicker"><i class="bi bi-shield-plus"></i> Added by Trial Shield</div><ul>${n.added.map(item).join("")}</ul></div>
          <a class="ts-note ts-note-link text-reset text-decoration-none" href="#shop"><div class="kicker" style="color:var(--ts-brand)"><i class="bi bi-bag"></i> Checkout demo</div>
            <div class="small">See the card picker on a website: the extension, Apple Pay, the one-time CVV and the merchant test bench.</div></a>
          <div class="ts-note"><div class="kicker text-muted">Demo controls</div>
            <div class="small text-muted mb-2">Demo clock: <strong class="text-body">${day(E.s.now, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</strong>. Moving it runs approval requests, first charges and renewals.</div>
            <div class="d-flex flex-wrap gap-2">
              <button class="btn btn-sm btn-light" data-act="skip" data-days="1">+1 day</button><button class="btn btn-sm btn-light" data-act="skip" data-days="3">+3 days</button>
              <button class="btn btn-sm btn-light" data-act="skip" data-days="7">+1 week</button><button class="btn btn-sm btn-light" data-act="skip" data-days="30">+30 days</button>
              <button class="btn btn-sm btn-light text-danger" data-act="reset"><i class="bi bi-arrow-counterclockwise"></i> Reset</button>
              <button class="btn btn-sm btn-outline-primary" data-act="role" data-role="staff"><i class="bi bi-building"></i> Switch to bank staff</button>
            </div></div>
        </aside>
      </div>`;
    document.title = `${n.title} · Trial Shield`;
    aiPill(); wireSearch(); tick();
    $("#screen").scrollTop = 0;
  }

  const SEARCH = [
    ["protected card one time cvv otp code", "Protected card", "shield-lock", "#protected"],
    ["approve approvals waiting charges requests", "Charges waiting for approval", "bell", "#protected"],
    ["fine print offer trial terms read check", "Check an offer's fine print", "search", "#fineprint"],
    ["checkout shop extension apple pay wallet", "Checkout demo", "bag", "#shop"],
    ["cards hub card lock", "Cards Hub", "credit-card-2-front", "#cards"],
    ["digital card cvc cvv", "Digital Card", "phone", "#cards"],
    ["explain charge unknown transaction apple", "Explain a charge", "question-circle", "#activity"],
    ["subscriptions cancel manage", "Manage subscriptions", "arrow-repeat", "#subscriptions"],
  ];
  function wireSearch() {
    const input = $("#smartSearch"), box = $("#suggest");
    const show = () => {
      const q = input.value.trim().toLowerCase();
      if (!q) { box.classList.add("d-none"); return; }
      const hits = SEARCH.filter(([k, label]) => (k + " " + label.toLowerCase()).split(" ").some((w) => w.startsWith(q) || q.split(" ").some((p) => p && w.startsWith(p))));
      box.innerHTML = (hits.length ? hits : SEARCH.slice(0, 2)).map(([, label, icon, href]) => `<button type="button" data-go="${href}" role="option"><i class="bi bi-${icon}"></i>${esc(label)}</button>`).join("");
      box.classList.remove("d-none");
    };
    input.addEventListener("input", show);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { const first = box.querySelector("[data-go]"); if (first) location.hash = first.dataset.go; } });
    box.addEventListener("click", (e) => { const b = e.target.closest("[data-go]"); if (b) location.hash = b.dataset.go; });
  }

  // ---------- shared pieces ----------
  function apprCard(a) {
    const soon = a.due && a.due > E.today();
    const back = a.cycle ? `It comes back every ${a.cycle}.` : a.kind === "stored" ? "The site kept your card details." : "It is a recurring charge, so it will come back.";
    const rise = a.prev && a.amount > a.prev + 0.005 ? ` <strong style="color:var(--ts-bad)">Up from ${E.money(a.prev)}.</strong>` : "";
    return `<div class="ts-appr" role="alert">
      <div class="d-flex gap-2 align-items-center">${avatar(a.merchant)}<div class="grow"><div class="fw-bold">${esc(a.merchant)} wants <span class="num" style="color:var(--ts-bad)">${E.money(a.amount)}</span></div>
        <div class="small text-muted"><span class="mono">${esc(a.descriptor)}</span> · ${soon ? "on " + dShort(a.due) : "now"}</div></div></div>
      <div class="small">${esc(E.KIND[a.kind] || "")}${a.what ? `: ${esc(a.what)}` : ""}.${rise}</div>
      <div class="small fw-semibold">${back} Approving pays this one charge only. We ask again next time.</div>
      <div class="small ${a.attempts ? "fw-semibold" : "text-muted"}" ${a.attempts ? 'style="color:var(--ts-bad)"' : ""}>${a.attempts ? `Declined ${a.attempts === 1 ? "once" : a.attempts + " times"} while waiting for you.` : "No answer means it declines."}</div>
      <div class="d-flex flex-wrap gap-2 align-items-center"><button class="btn btn-primary btn-sm" data-act="appr" data-id="${a.id}" data-yes="1"><i class="bi bi-person-bounding-box"></i> Approve with Face ID</button>
        <button class="btn btn-light btn-sm" data-act="appr" data-id="${a.id}" data-yes="0">Decline</button>
        <button class="btn btn-link btn-sm text-danger p-0 ms-auto" data-act="appr" data-id="${a.id}" data-yes="0" data-stop="1">Stop ${esc(short(a.merchant))}</button></div>
    </div>`;
  }
  function chargeState(tr, c) {
    if (c.sub) return chip("good", "Paid");
    const waiting = E.pending().some((a) => a.descriptor === c.descriptor && Math.abs(a.amount - c.amount) < 0.005);
    if (waiting) return chip("warn", "Waiting for you");
    if (c.attempted) return chip("neutral", "Declined");
    return E.asks(tokenOf(tr.token), tr.merchant) ? chip("brand", "Asks you first") : chip("bad", "Goes through");
  }
  function signupBlock(tr) {
    return `<div class="ts-row align-items-start">${avatar(tr.merchant)}<div class="grow"><div class="title">${esc(tr.merchant)}</div>
      <div class="sub">${day(tr.created, { day: "numeric", month: "short" })} via ${esc(tr.via)} · ${tr.card === "prot" ? "Protected card" : "Everyday card"}${tr.upfront ? ` · paid ${E.money(tr.upfront)}` : ""}</div>
      ${tr.catch ? `<div class="small mt-1">${bold(esc(tr.catch))}</div>` : ""}
      <table class="ts-costs small num mt-1">${tr.charges.map((c) => `<tr><td>${esc(c.what)}<div class="text-muted">${E.money(c.amount)} a ${esc(c.cycle)} from ${E.fmt(c.date, { day: "numeric", month: "short" })}</div></td><td class="text-end">${chargeState(tr, c)}</td></tr>`).join("")}</table>
    </div></div>`;
  }
  const stoppedTotal = () => E.s.txns.filter((t) => t.status === "declined" && !E.s.txns.some((u) => u.status === "approved" && u.id > t.id && u.descriptor === t.descriptor && Math.abs(u.amount - t.amount) < 0.005)).reduce((a, t) => a + t.amount, 0);
  const cvvDigits = (code, cls = "ts-cvv") => `<span class="${cls}">${code.split("").map((c) => `<span>${c}</span>`).join("")}</span>`;

  // ---------- Home ----------
  function home() {
    const now = E.s.now, pend = E.pending();
    const spent = E.s.txns.filter((t) => t.status === "approved" && t.at > now - 30 * 864e5).reduce((a, t) => a + t.amount, 0);
    const coming = E.s.trials.filter((t) => t.status === "active");
    custShell("home", `
      ${pend.length ? `<div class="d-flex justify-content-between align-items-center"><div class="fw-bold">Waiting for your approval</div>${chip("bad", String(pend.length))}</div>
        ${pend.slice(0, 2).map(apprCard).join("")}${pend.length > 2 ? `<a class="small" href="#protected">See all ${pend.length} requests</a>` : ""}` : ""}
      <div class="ts-card"><div class="ts-list">
        <div class="ts-row"><div class="grow"><div class="title">Everyday account</div><div class="sub num">BSB 034-002 · 12 3456</div></div><div class="num fw-bold">$2,341.18</div></div>
        <div class="ts-row"><div class="grow"><div class="title">Savings account</div><div class="sub num">BSB 034-002 · 98 7654</div></div><div class="num fw-bold">$8,120.00</div></div>
      </div></div>
      <div class="row g-2">
        <div class="col-6"><div class="ts-card ts-card-body ts-stat h-100"><div class="label">Spent in 30 days</div><div class="value num" style="font-size:20px">${E.money(spent)}</div></div></div>
        <div class="col-6"><div class="ts-card ts-card-body ts-stat h-100"><div class="label">Charges stopped</div><div class="value num" style="font-size:20px;color:var(--ts-good)">${E.money(stoppedTotal())}</div></div></div>
      </div>
      <div class="ts-card"><div class="ts-card-head"><h2>Your cards</h2><a class="small" href="#cards">Cards Hub</a></div><div class="ts-list">
        <a class="ts-row text-reset text-decoration-none" href="#cards"><span class="ts-minicard" aria-hidden="true"></span><div class="grow"><div class="title">Everyday Debit</div><div class="sub">•••• 4821 · ${E.s.mainAsk ? "asks before new subscriptions" : "recurring charges go through"}</div></div><i class="bi bi-chevron-right text-muted"></i></a>
        <a class="ts-row text-reset text-decoration-none" href="#protected"><span class="ts-minicard prot" aria-hidden="true"></span><div class="grow"><div class="title">Protected card</div><div class="sub">•••• 7731 · new CVV every purchase, asks before every later charge</div></div><i class="bi bi-chevron-right text-muted"></i></a>
      </div></div>
      ${coming.length ? `<div class="ts-card"><div class="ts-card-head"><h2>Coming up</h2></div><div class="ts-list">${coming.map((tr) => {
        const c = tr.charges.find((x) => !x.attempted) || tr.charges[0];
        return `<a class="ts-row text-reset text-decoration-none" href="#protected">${avatar(tr.merchant)}<div class="grow"><div class="title">${esc(tr.merchant)}</div><div class="sub num">${E.money(c.amount)} on ${E.fmt(c.date, { day: "numeric", month: "short" })} · ${tr.card === "prot" ? "Protected card" : "Everyday card"}</div></div>${chargeState(tr, c)}</a>`;
      }).join("")}</div></div>` : ""}
      <div class="ts-card"><div class="ts-card-head"><h2>Recent activity</h2><a class="small" href="#activity">See all</a></div>
        <div class="ts-list">${E.s.txns.slice(0, 5).map(txnRow).join("")}</div></div>`);
  }
  function txnRow(t) {
    const prot = E.isProt(tokenOf(t.tokenRef));
    return `<a class="ts-row text-reset text-decoration-none" href="#txn-${t.id}"><div class="grow"><div class="mono">${esc(t.descriptor)}</div><div class="sub">${day(t.at)}${prot ? " · Protected card" : ""}${t.status === "declined" ? ` · <span style="color:var(--ts-bad)">Declined</span>` : ""}${t.explanation ? " · " + esc(t.explanation.likely_service) : ""}</div></div><div class="num fw-semibold ${t.status === "declined" ? "text-decoration-line-through text-muted" : ""}">-${E.money(t.amount)}</div></a>`;
  }

  // ---------- Cards Hub ----------
  function cards() {
    const p = E.prot();
    custShell("cards", `
      <div><div class="fw-bold">Cards Hub</div><div class="small text-muted">Two cards on your Everyday account. You choose which one to pay with at each checkout.</div></div>
      <div class="ts-vcard" aria-label="Everyday Debit card" style="background: linear-gradient(140deg,#262a31,#3a3f48)"><div class="row1"><span>Everyday Debit · Visa</span><span>Main card</span></div><div class="pan num">•••• •••• •••• 4821</div><div class="meta"><div>Card holder<b>Alex Nguyen</b></div><div>Expires<b>08/29</b></div></div></div>
      <div class="ts-card"><div class="ts-card-head"><h2>Digital Card</h2>${chip("neutral", "In the app today")}</div><div class="ts-card-body small">
        ${ui.showDigital ? `<dl class="ts-kv num mb-2"><dt>Number</dt><dd class="mono">${E.MAIN.pan}</dd><dt>Expiry</dt><dd>${E.MAIN.expiry}</dd><dt>Dynamic CVC</dt><dd class="mono fw-bold">${E.MAIN.cvc}</dd></dl><div class="text-muted">The dynamic CVC changes every 24 hours. It can still be used to set up recurring payments, which later charge without any CVV.</div>`
        : `<button class="btn btn-sm btn-light" data-act="digital">Show Digital Card</button>`}</div></div>
      <label class="ts-choice"><input type="checkbox" data-act="mainask" ${E.s.mainAsk ? "checked" : ""}><span><strong>Ask me before charges from new subscriptions</strong> ${chip("brand", "New")}<br><span class="small text-muted">For the Everyday card. A recurring charge from any merchant that isn't already one of your subscriptions waits for your approval, in case you paid with the wrong card.</span></span></label>
      <a class="ts-vcard active" href="#protected" aria-label="Protected card, open"><div class="row1"><span>Protected card · Visa</span><span>One-time CVV</span></div><div class="pan num">${esc(p.pan)}</div><div class="meta"><div>Card holder<b>Alex Nguyen</b></div><div>Expires<b>${esc(p.expiry)}</b></div><div>CVV<b>From the app</b></div></div></a>
      <div class="small text-muted">Use it for free trials, subscriptions and sites you don't know. No fresh CVV and no approval from you means no payment.</div>
      <div class="ts-card"><div class="ts-card-head"><h2>Choose a card at checkout</h2>${chip("brand", "New")}</div><div class="ts-list">
        <a class="ts-row text-reset text-decoration-none" href="#shop"><i class="bi bi-puzzle fs-5" style="color:var(--ts-brand)"></i><div class="grow"><div class="title">Browser extension</div><div class="sub">Reads the fine print, suggests a card, fills it and a fresh CVV.</div></div><i class="bi bi-chevron-right text-muted"></i></a>
        <a class="ts-row text-reset text-decoration-none" href="#shop"><i class="bi bi-wallet2 fs-5" style="color:var(--ts-brand)"></i><div class="grow"><div class="title">Apple Pay</div><div class="sub">The Protected card sits in your wallet next to your Everyday card.</div></div><i class="bi bi-chevron-right text-muted"></i></a>
        <a class="ts-row text-reset text-decoration-none" href="#protected"><i class="bi bi-key fs-5" style="color:var(--ts-brand)"></i><div class="grow"><div class="title">Type it in</div><div class="sub">Get a one-time CVV in the app, like a security code.</div></div><i class="bi bi-chevron-right text-muted"></i></a>
        <div class="ts-row"><i class="bi bi-cart-check fs-5 text-muted"></i><div class="grow"><div class="title text-muted">Click to Pay</div><div class="sub">The card networks' saved card checkout. A later phase.</div></div></div>
      </div></div>
      <div class="ts-card ts-card-body small"><div class="fw-semibold mb-1">Card services</div><div class="text-muted">Lock card temporarily · Change PIN · Activate card · My Merchants. These are existing Cards Hub services and are not part of this prototype.</div></div>`);
  }

  // ---------- Protected card ----------
  function protectedCard() {
    const p = E.prot(), c = E.openCvv("app"), pend = E.pending();
    const signups = E.s.trials.filter((t) => t.card === "prot").sort((a, b) => b.created - a.created);
    const answered = E.s.approvals.filter((a) => a.status !== "pending").slice(0, 8);
    const word = { approved: ["good", "Approved, not yet charged"], used: ["good", "Paid once"], declined: ["neutral", "Declined"], expired: ["neutral", "No answer, declined"] };
    custShell("protected", `
      <a class="ts-back" href="#cards"><i class="bi bi-chevron-left"></i> Cards Hub</a>
      <div class="ts-vcard active" aria-label="Protected card"><div class="row1"><span>Protected card · Visa</span><span>No fixed CVV</span></div><div class="pan num">${esc(p.pan)}</div>
        <div class="meta"><div>Card holder<b>Alex Nguyen</b></div><div>Expires<b>${esc(p.expiry)}</b></div><div>CVV<b>${c ? cvvDigits(c.code) : "New each time"}</b></div></div></div>
      <div class="ts-card ts-card-body">
        ${c ? `<div class="d-flex justify-content-between align-items-center gap-2"><div><div class="fw-semibold">Your one-time CVV</div><div class="small text-muted">For one purchase. Expires in <span class="num fw-semibold" data-exp="${c.expires}">10:00</span></div></div>${cvvDigits(c.code, "ts-otp")}</div>
          <div class="small text-muted mt-2">Once a shop uses it, it is retired. Recurring charges can't use a CVV at all, so those ask you below.</div>`
        : `<div class="fw-semibold">Paying somewhere now?</div><div class="small text-muted">Get a one-time CVV, like a security code. It works for one purchase in the next 10 minutes.</div>`}
        <button class="btn ${c ? "btn-light" : "btn-primary"} w-100 mt-2" data-act="newcvv"><i class="bi bi-key"></i> ${c ? "Get a different one" : "Get a one-time CVV"}</button>
      </div>
      <div class="ts-rule"><div class="fw-bold mb-1">No fresh CVV and no approval from you means no payment.</div>
        <div class="ts-layer"><div class="n">1</div><div><div class="fw-semibold">At a checkout</div><div class="small text-muted">A new one-time CVV for every purchase. Copied card details are useless afterwards.</div></div></div>
        <div class="ts-layer"><div class="n">2</div><div><div class="fw-semibold">Every charge after that</div><div class="small text-muted">Renewals, saved card orders, Apple Pay merchant tokens, the App Store and PayPal each wait for you to approve that one charge. An approval never carries over to the next one.</div></div></div>
        <div class="ts-layer"><div class="n">3</div><div><div class="fw-semibold">If you don't answer</div><div class="small text-muted">It declines. Stop a merchant and it can't even ask again.</div></div></div>
      </div>
      <div class="ts-card"><div class="ts-card-head"><h2>Waiting for your approval</h2>${pend.length ? chip("bad", String(pend.length)) : ""}</div><div class="ts-card-body d-grid gap-2">${pend.map(apprCard).join("") || `<div class="small text-muted">Nothing waiting. When a merchant tries to charge this card, it shows here and on your lock screen.</div>`}</div></div>
      <div class="ts-card"><div class="ts-card-head"><h2>Sign-ups on this card</h2></div><div class="ts-list">${signups.map(signupBlock).join("") || `<div class="ts-row small text-muted">None yet. Try the checkout demo.</div>`}</div></div>
      ${(p.stopped || []).length ? `<div class="ts-card"><div class="ts-card-head"><h2>Stopped merchants</h2></div><div class="ts-card-body small">${p.stopped.map((m) => chip("neutral", m, "slash-circle")).join(" ")}<div class="text-muted mt-2">These merchants can't charge this card or ask you again.</div></div></div>` : ""}
      ${answered.length ? `<div class="ts-card"><div class="ts-card-head"><h2>Your answers</h2></div><div class="ts-list">${answered.map((a) => `<div class="ts-row"><div class="grow"><div class="title">${esc(a.merchant)} · <span class="num">${E.money(a.amount)}</span></div><div class="sub mono">${esc(a.descriptor)}</div></div>${chip(...(word[a.status] || ["neutral", a.status]))}</div>`).join("")}</div></div>` : ""}
      <a class="btn btn-outline-primary" href="#shop"><i class="bi bi-bag"></i> See it at a checkout</a>`);
  }

  // ---------- Fine print reader ----------
  function fineprint() {
    const samples = window.TS_SAMPLES;
    if (ui.scanText == null) ui.scanText = samples[ui.sample].text;
    custShell("fineprint", `
      <a class="ts-back" href="#cards"><i class="bi bi-chevron-left"></i> Cards Hub</a>
      <div><div class="fw-bold fs-5">Check an offer's fine print</div><div class="small text-muted">Paste the sign-up page, the terms next to the button, or the confirmation email. We read the fine print before you pay.</div></div>
      <div class="d-flex flex-wrap gap-2" role="group" aria-label="Example offers">${Object.entries(samples).map(([k, s]) => `<button type="button" class="btn btn-sm btn-light ${k === ui.sample ? "active" : ""}" data-act="sample" data-key="${k}">${esc(s.label)}</button>`).join("")}</div>
      <label for="offerText" class="visually-hidden">Offer terms</label>
      <textarea id="offerText" class="form-control ts-offer" rows="7" spellcheck="false">${esc(ui.scanText)}</textarea>
      <button class="btn btn-primary" data-act="scan" ${ui.busy.scan ? "disabled" : ""}>${ui.busy.scan ? '<span class="spinner-border spinner-border-sm"></span> Reading the fine print' : '<i class="bi bi-search"></i> Read the fine print'}</button>
      <div id="scanResult">${ui.scan ? scanResult() : ""}</div>`);
    $("#offerText").addEventListener("input", (e) => { ui.scanText = e.target.value; });
  }
  function highlight(text, flags) {
    // Wrap each flag's quoted words in the original text, numbered to match the warnings.
    const spans = [];
    const low = text.toLowerCase();
    flags.forEach((f, i) => {
      if (!f.quote) return;
      const at = low.indexOf(f.quote.toLowerCase());
      if (at >= 0 && !spans.some((s) => at < s.end && at + f.quote.length > s.start)) spans.push({ start: at, end: at + f.quote.length, n: i + 1 });
    });
    spans.sort((a, b) => a.start - b.start);
    let out = "", pos = 0;
    for (const s of spans) { out += esc(text.slice(pos, s.start)) + `<mark id="q${s.n}"><sup>${s.n}</sup>${esc(text.slice(s.start, s.end))}</mark>`; pos = s.end; }
    return out + esc(text.slice(pos));
  }
  function catchBox(d, compact) {
    const detail = catchDetail(d);
    return `<div class="ts-catch ${riskClass(d.trap_risk)} ${compact ? "compact" : "mb-3"}" role="alert">
      <div class="label"><i class="bi bi-${riskIcon(d.trap_risk)}"></i>${riskLabel(d.trap_risk)} · ${esc(d.merchant)}</div>
      <div class="headline">${bold(esc(d.catch))}</div>${detail ? `<div class="detail">${bold(esc(detail))}</div>` : ""}</div>`;
  }
  function scanResult() {
    const { data: d, mode, ms, sources } = ui.scan;
    const end = d.trial_end_date ? E.fmt(d.trial_end_date, { weekday: "long", day: "numeric", month: "long" }) : null;
    const amounts = d.costs.map((c) => E.money(c.amount));
    return `
      ${catchBox(d)}
      ${d.costs.length ? `<div class="ts-card ts-card-body mb-3"><div class="fw-semibold small mb-1">What you will pay</div><table class="ts-costs num">
        ${Number(d.upfront_price) > 0 ? `<tr><td>Today</td><td class="text-end">${E.money(d.upfront_price)}</td></tr>` : ""}
        ${d.costs.map((c) => `<tr><td>${esc(c.what)} <span class="text-muted small">${esc(c.starts)}</span></td><td class="text-end">${E.money(c.amount)} a ${esc(c.cycle)}</td></tr>`).join("")}
        <tr><td>Every month after the trial</td><td class="text-end" style="color:var(--ts-bad)">about ${E.money(monthlyTotal(d))}</td></tr></table></div>` : ""}
      ${d.red_flags.length ? `<div class="ts-card ts-card-body mb-3"><div class="fw-semibold small mb-2">Where the fine print says it</div>
        <ul class="ts-flags mb-3">${d.red_flags.map((f, i) => `<li><span class="ts-flagno">${i + 1}</span><span>${esc(f.text)}${f.quote ? "" : ' <span class="fw-normal text-muted small">(no exact quote)</span>'}</span></li>`).join("")}</ul>
        <div class="ts-fine" aria-label="Original fine print with the risky clauses highlighted">${highlight(ui.scanText, d.red_flags)}</div></div>` : ""}
      <div class="ts-card ts-card-body mb-3 small"><dl class="ts-kv num mb-1"><dt>Trial ends</dt><dd>${end || "Not stated"}</dd><dt>To cancel</dt><dd>${esc(d.how_to_cancel || "Not stated")}</dd>${d.minimum_commitment ? `<dt>Lock in</dt><dd>${esc(d.minimum_commitment)}</dd>` : ""}</dl>
        <div class="ts-sources">${mode === "live" ? `Read by Claude in ${(ms / 1000).toFixed(1)} s` : "Offline rules"} · checked against ${sources.map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a>`).join(", ")}</div></div>
      <div class="ts-card"><div class="ts-card-head"><h2>Which card to use</h2></div><div class="ts-card-body d-grid gap-2">
        <div class="small">${d.trap_risk === "low" ? "Either card is fine for this offer. With the Protected card we still ask before each charge." :
          `Use your <strong>Protected card</strong>. You get a fresh CVV for ${Number(d.upfront_price) > 0 ? "the " + E.money(d.upfront_price) + " today" : "the sign-up"}, and we ask you before ${amounts.length > 1 ? "each of the " + amounts.join(" and ") + " charges" : amounts.length ? "the " + amounts[0] + " charge" : "any later charge"}, every single time.`}</div>
        <button class="btn btn-primary" data-act="newcvv" data-go="#protected"><i class="bi bi-key"></i> Get a one-time CVV</button>
        <a class="btn btn-outline-primary" href="#shop"><i class="bi bi-bag"></i> See it at a checkout</a>
      </div></div>`;
  }

  // ---------- Activity ----------
  function activity() {
    custShell("activity", `<div class="fw-bold">Everyday account</div>
      <div class="ts-card"><div class="ts-list">${E.s.txns.slice(0, 40).map(txnRow).join("")}</div></div>`);
  }
  function txn(id) {
    const t = E.s.txns.find((x) => x.id === id);
    if (!t) { location.hash = "#activity"; return; }
    const tk = tokenOf(t.tokenRef), sub = E.s.subs.find((s) => s.id === t.subId), x = t.explanation;
    const disputed = E.s.disputes.some((d) => d.txn === t.id);
    const waiting = E.s.approvals.find((a) => a.declinedTxn === t.id && a.status === "pending");
    const type = t.mit ? (E.KIND[t.kind] || "Recurring, started by the merchant (no CVV)") : t.channel === "wallet" ? "Apple Pay purchase with Face ID" : t.kind === "stored" ? E.KIND.stored : E.isProt(tk) ? "Purchase with a one-time CVV" : "Purchase";
    custShell("activity", `
      <a class="ts-back" href="#activity"><i class="bi bi-chevron-left"></i> Activity</a>
      <div class="ts-card ts-card-body text-center"><div class="mono mb-1">${esc(t.descriptor)}</div><div class="fs-3 fw-bold num ${t.status === "declined" ? "text-decoration-line-through text-muted" : ""}">-${E.money(t.amount)}</div><div class="small text-muted">${day(t.at, { weekday: "long", day: "numeric", month: "long" })}</div>${t.status === "declined" ? `<div class="mt-2">${chip("bad", "Declined: " + t.reason)}</div>` : ""}</div>
      ${waiting ? apprCard(waiting) : ""}
      <div class="ts-card ts-card-body small"><dl class="ts-kv mb-0"><dt>Paid with</dt><dd>${esc(E.cardName(tk))}</dd><dt>Type</dt><dd>${esc(type)}</dd>${sub ? `<dt>Subscription</dt><dd>${esc(sub.name)}</dd>` : ""}</dl></div>
      <div class="ts-card"><div class="ts-card-head"><h2>Explain this charge</h2>${chip("brand", "New")}</div><div class="ts-card-body">
        ${x ? `<div class="d-flex flex-wrap align-items-center gap-2 mb-2"><strong>${esc(x.likely_service)}</strong>${x.risk === "suspicious" ? chip("bad", "Looks suspicious") : x.risk === "check" ? chip("warn", "Worth checking") : chip("good", "Looks normal")}</div>
          <p class="mb-2 small">${esc(x.explanation)}</p>
          <div class="d-flex justify-content-between small text-muted"><span>How sure we are</span><span class="num">${x.confidence}%</span></div><div class="ts-meter mb-2"><span style="width:${x.confidence}%"></span></div>
          <div class="small"><strong>Check it yourself:</strong> ${esc(x.how_to_verify)}</div>
          <div class="ts-sources mt-2">${x.mode === "live" ? "Claude" : "Offline rules"} · ${(x.sources || []).map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a>`).join(", ")}</div>`
        : `<button class="btn btn-outline-primary btn-sm" data-act="explain" data-id="${t.id}" ${ui.busy["t" + t.id] ? "disabled" : ""}>${ui.busy["t" + t.id] ? '<span class="spinner-border spinner-border-sm"></span> Checking' : '<i class="bi bi-question-circle"></i> What is this charge?'}</button>`}
      </div></div>
      <div class="ts-card"><div class="ts-list">
        ${sub && ["active", "unpaid"].includes(sub.status) ? `<button class="ts-row border-0 bg-transparent w-100 text-start" data-act="cancel" data-id="${sub.id}"><i class="bi bi-x-circle"></i><div class="grow"><div class="title">${sub.rail === "subman" ? "Cancel subscription" : "Stop this subscription"}</div><div class="sub">${sub.rail === "subman" ? "Existing in app cancel (1 to 5 business days)" : "Trial Shield picks the right route"}</div></div><i class="bi bi-chevron-right text-muted"></i></button>` : ""}
        <button class="ts-row border-0 bg-transparent w-100 text-start" data-act="dispute" data-id="${t.id}" ${disputed ? "disabled" : ""}><i class="bi bi-person-raised-hand"></i><div class="grow"><div class="title">${disputed ? "Sent to a banker" : "Ask a banker about a refund"}</div><div class="sub">${disputed ? "You'll hear back in the app" : "A person reviews it, not the AI"}</div></div></button>
        <div class="ts-row"><i class="bi bi-lock text-muted"></i><div class="grow"><div class="title text-muted">Lock card temporarily</div><div class="sub">Existing Cards Hub service</div></div></div>
      </div></div>`);
  }

  // ---------- Subscriptions ----------
  function subscriptions() {
    const route = { subman: "In app cancel", token: "Pause merchant token", directdebit: "Stop direct debit", apple: "Cancel in Apple", protected: "Protected card: asks before each charge" };
    const list = [...E.s.subs].sort((a, b) => (a.status === "cancelled" ? 1 : 0) - (b.status === "cancelled" ? 1 : 0) || b.amount - a.amount);
    const monthly = list.filter((s) => s.status !== "cancelled").reduce((a, s) => a + E.monthly(s), 0);
    custShell("subscriptions", `<div><div class="small text-muted">Recurring charges</div><div class="fs-4 fw-bold num">${E.money(monthly)} <span class="fs-6 fw-normal text-muted">a month</span></div></div>
      <div class="ts-card"><div class="ts-list">${list.map((s) => `<div class="ts-row">${avatar(s.merchant)}<div class="grow"><div class="title">${esc(s.name)}</div><div class="sub num">${E.money(s.amount)}/${esc(s.cycle)} · ${esc(route[s.rail])}${s.prev < s.amount && s.prev > 5 ? ` · <span style="color:var(--ts-warn)">up from ${E.money(s.prev)}</span>` : ""}</div></div>
        ${s.status === "active" ? `<button class="btn btn-sm btn-light" data-act="cancel" data-id="${s.id}">Cancel</button>` : s.status === "unpaid" ? `<button class="btn btn-sm btn-light" data-act="cancel" data-id="${s.id}">Unpaid · Cancel</button>` : s.status === "cancel_requested" ? chip("warn", "Requested") : chip("neutral", "Cancelled")}</div>`).join("")}</div></div>`);
  }

  // ---------- Cancel sheet ----------
  const modal = new bootstrap.Modal($("#sheet"));
  async function openCancel(id) {
    const s = E.s.subs.find((x) => x.id === id);
    const [title, how] = E.RAILS[s.rail];
    const drafts = s.rail === "token" || s.rail === "protected";
    $("#sheetBody").innerHTML = `
      <div class="modal-header border-0 pb-0"><h2 class="modal-title h5" id="sheetTitle">Cancel ${esc(s.name)}?</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button></div>
      <div class="modal-body"><div class="text-muted small mb-3 num">${E.money(s.amount)} per ${esc(s.cycle)} · <span class="mono">${esc(s.descriptor)}</span></div>
        <div class="ts-card ts-card-body mb-3"><div class="d-flex justify-content-between align-items-center mb-1"><strong>${esc(title)}</strong>${s.rail === "subman" ? chip("neutral", "In the app today") : chip("brand", "Trial Shield")}</div><div class="small">${esc(how)}</div></div>
        <div id="draftArea">${drafts ? `<div class="small text-muted mb-2"><span class="spinner-border spinner-border-sm"></span> Drafting a cancellation message for ${esc(s.merchant)}</div><div class="ts-skeleton mb-2"></div><div class="ts-skeleton" style="width:70%"></div>` : ""}</div></div>
      <div class="modal-footer border-0 pt-0"><button class="btn btn-light" data-bs-dismiss="modal">Not now</button><button class="btn btn-danger" data-act="confirmcancel" data-id="${s.id}">${s.rail === "apple" ? "I have cancelled it in Apple" : "Confirm cancel"}</button></div>`;
    modal.show();
    if (drafts) {
      const res = await A.draft(s);
      E.log("AI", "draft", `Cancellation message drafted for ${s.name}${res.mode === "live" ? "" : " (template)"}.`);
      const area = $("#draftArea");
      if (area) area.innerHTML = `<div class="d-flex justify-content-between align-items-center mb-1"><span class="fw-semibold small">Message to ${esc(s.merchant)}</span>${res.mode === "live" ? chip("good", "AI draft") : chip("neutral", "Template")}</div><div class="border rounded-3 p-3 small" style="white-space: pre-wrap; background:#fafbfc" id="draftText"><strong>Subject: ${esc(res.data.subject)}</strong>\n\n${esc(res.data.body)}</div><button type="button" class="btn btn-sm btn-light mt-2" data-act="copydraft"><i class="bi bi-clipboard"></i> Copy message</button>`;
    }
  }

  // =====================================================================
  // Checkout demo: a made-up merchant's website, the extension, Apple Pay and the lock screen
  // =====================================================================
  const FINE = () => window.TS_SAMPLES.skincare.text;
  const shopTerms = () => (ui.ext.scan ? ui.ext.scan.data : A.extractTerms(FINE(), E.today()));
  async function runExtScan() {
    if (ui.ext.scan || ui.ext.busy) return;
    ui.ext.busy = true;
    const text = FINE();
    E.log("APP", "scan.request", `Browser extension read ${text.length} characters of fine print on lumiere-derma.example. Only this text is sent to the AI.`);
    const res = await A.scan(text);
    ui.ext.scan = res; ui.ext.busy = false;
    if (ui.ext.card == null) ui.ext.card = res.data.trap_risk === "low" ? "main" : "prot";
    E.s.scans.push({ merchant: res.data.merchant, risk: res.data.trap_risk, billing: res.data.billing_name, flag: res.data.red_flags[0] ? res.data.red_flags[0].text : "" });
    E.log("AI", "scan", `Read checkout fine print for ${res.data.merchant}: ${res.data.catch} Trap risk ${res.data.trap_risk} (${res.mode === "live" ? "Claude" : "offline rules"}, ${res.ms} ms).`);
    E.save();
    if (location.hash === "#shop") shop();
  }

  function extPanel(d) {
    const x = ui.ext, card = x.card || "prot";
    const tr = x.step === "paid" && ui.form.signed ? E.s.trials.find((t) => t.id === ui.form.signed) : null;
    const filled = x.step === "filled" ? (E.prot().cvvs || []).find((c) => c.id === x.cvvId) : null;
    let body;
    if (tr) {
      const asks = E.asks(tokenOf(tr.token), tr.merchant);
      body = `<div class="ext-ok"><i class="bi bi-check-circle-fill"></i> Paid ${E.money(tr.upfront)} with the ${tr.card === "prot" ? "Protected card" : "Everyday card"}${tr.via === "Apple Pay" ? " in Apple Pay" : ""}.</div>
        <div class="small">${tr.charges.map((c) => `<div class="d-flex justify-content-between gap-2"><span>${esc(c.what)} from ${E.fmt(c.date, { day: "numeric", month: "short" })}</span><strong class="num">${E.money(c.amount)} a ${esc(c.cycle)}</strong></div>`).join("")}</div>
        <div class="small fw-semibold" style="color:${asks ? "var(--ts-good)" : "var(--ts-bad)"}">${asks ? "Each of these asks you first. If you don't answer, it declines." : "These go through without asking, unless you remember to cancel."}</div>
        ${tr.charges.length ? `<button class="btn btn-outline-primary btn-sm w-100" data-act="jump" data-date="${tr.end}"><i class="bi bi-fast-forward"></i> Skip to ${dShort(tr.end)}, the first charge</button>` : ""}
        <button class="btn btn-light btn-sm w-100" data-act="extreset">Start the checkout again</button>`;
    } else {
      body = `<div class="ext-sec">Pay with</div>
        <label class="ts-choice"><input type="radio" name="extcard" value="prot" data-act="extcard" ${card === "prot" ? "checked" : ""}><span><strong>Protected card •••• 7731</strong>${d && d.trap_risk !== "low" ? ' <span class="chip chip-brand">Suggested here</span>' : ""}<br><span class="small text-muted">A new one-time CVV for this ${E.money(SHOP.amount)} only. Every charge after today asks you first.</span></span></label>
        <label class="ts-choice"><input type="radio" name="extcard" value="main" data-act="extcard" ${card === "main" ? "checked" : ""}><span><strong>Everyday Debit •••• 4821</strong><br><span class="small text-muted">Fills your Digital Card and today's CVC. Later charges go through${E.s.mainAsk ? ", except new subscriptions, which ask you" : " without asking"}.</span></span></label>
        ${card === "main" && d && d.trap_risk !== "low" && !E.s.mainAsk ? `<div class="small fw-semibold" style="color:var(--ts-bad)"><i class="bi bi-exclamation-triangle-fill"></i> This site signs you up to about ${E.money(monthlyTotal(d))} a month. On this card those charges go through unless you remember to cancel.</div>` : ""}
        ${x.step === "waiting" ? `<div class="ext-wait"><span class="spinner-border spinner-border-sm"></span> Approve on your phone to make a one-time CVV.</div>`
          : filled ? `<div class="ext-ok"><i class="bi bi-check-circle-fill"></i> Filled the Protected card with one-time CVV <span class="mono fw-bold">${filled.code}</span>. It works once, at ${esc(SHOP.merchant)}, up to ${E.money(filled.amount)}, for <span class="num" data-exp="${filled.expires}">10:00</span>.</div>`
          : x.step === "filled-main" ? `<div class="ext-ok"><i class="bi bi-check-circle-fill"></i> Filled Everyday Debit •••• 4821 and today's CVC.</div>` : ""}
        <button class="btn btn-primary w-100" data-act="extfill" ${x.step === "waiting" ? "disabled" : ""}><i class="bi bi-input-cursor-text"></i> ${filled || x.step === "filled-main" ? "Fill again" : "Fill card details"}</button>`;
    }
    return `<div class="ts-ext" role="dialog" aria-label="Trial Shield browser extension">
      <div class="ext-head"><span class="mark"><i class="bi bi-shield-check"></i></span><div class="grow"><div class="fw-bold">Trial Shield</div><div class="tiny text-muted">Browser extension for your bank cards (concept)</div></div><button type="button" class="btn-close" data-act="ext" aria-label="Close the extension"></button></div>
      <div class="ext-body">
        ${d ? catchBox(d, true) : `<div class="small text-muted"><span class="spinner-border spinner-border-sm"></span> Reading this page's fine print</div><div class="ts-skeleton"></div>`}
        ${body}
      </div></div>`;
  }

  function lockScreen() {
    const items = [];
    const hdr = (t) => `<div class="app"><i class="bi bi-shield-check"></i> Banking app · ${t}</div>`;
    if (ui.cvvReq) items.push(`<div class="ts-notif hi">${hdr("now")}<div class="fw-semibold">Make a one-time CVV?</div><div class="small">${esc(ui.cvvReq.merchant)} checkout, ${E.money(ui.cvvReq.amount)}, Protected card •••• 7731.</div>
      <div class="d-flex gap-2 mt-2"><button class="btn btn-sm btn-primary" data-act="cvvreq" data-yes="1"><i class="bi bi-person-bounding-box"></i> Approve with Face ID</button><button class="btn btn-sm btn-light" data-act="cvvreq" data-yes="0">Decline</button></div></div>`);
    (E.prot().cvvs || []).filter((c) => !c.used && c.expires > Date.now()).slice(0, 2).forEach((c) => items.push(`<div class="ts-notif">${hdr("CVV")}<div class="fw-semibold">Your one-time CVV is <span class="mono">${c.code}</span></div><div class="small">${c.merchant ? `For ${esc(c.merchant)} only${c.amount != null ? `, up to ${E.money(c.amount)}` : ""}` : "For any one purchase"}. Expires in <span class="num" data-exp="${c.expires}">10:00</span>.</div></div>`));
    E.pending().forEach((a) => items.push(`<div class="ts-notif hi">${hdr(a.due && a.due > E.today() ? "for " + E.fmt(a.due, { day: "numeric", month: "short" }) : "now")}<div class="fw-semibold">${esc(a.merchant)} wants ${E.money(a.amount)}</div>
      <div class="small">${esc(E.KIND[a.kind] || "")}. Approving pays this one charge only.${a.attempts ? ` <strong style="color:var(--ts-bad)">Declined ${a.attempts === 1 ? "once" : a.attempts + " times"} so far.</strong>` : ""}</div>
      <div class="d-flex flex-wrap gap-2 mt-2"><button class="btn btn-sm btn-primary" data-act="appr" data-id="${a.id}" data-yes="1">Approve</button><button class="btn btn-sm btn-light" data-act="appr" data-id="${a.id}" data-yes="0">Decline</button><button class="btn btn-sm btn-link text-danger p-0 ms-auto" data-act="appr" data-id="${a.id}" data-yes="0" data-stop="1">Stop ${esc(short(a.merchant))}</button></div></div>`));
    E.s.txns.filter((t) => E.isProt(tokenOf(t.tokenRef))).slice(0, 3).forEach((t) => items.push(`<div class="ts-notif muted">${hdr(day(t.at, { day: "numeric", month: "short" }))}<div class="small"><strong>${t.status === "approved" ? "Paid" : "Declined"} ${E.money(t.amount)}</strong> <span class="mono">${esc(t.descriptor)}</span>${t.status === "declined" ? `: ${esc(t.reason)}.` : "."}</div></div>`));
    return `<div class="ts-lockscreen"><div class="time num">${E.fmtMs(E.s.now, { hour: "numeric", minute: "2-digit", hour12: false })}</div><div class="date">${day(E.s.now, { weekday: "long", day: "numeric", month: "long" })}</div>
      <div class="notifs">${items.join("") || `<div class="ts-notif muted small">No notifications. Pay at the checkout, or run the merchant test bench below.</div>`}</div>
      <a class="btn btn-sm btn-light w-100" href="#protected">Open the banking app</a></div>`;
  }

  function trapBench() {
    const R = ui.traps;
    const lost = (w) => E.TRAPS.reduce((a, t) => a + (R[t.k] && R[t.k][w].status === "approved" ? t.amount || 0 : 0), 0);
    const cell = (r, t) => !r ? '<span class="text-muted small">Not run</span>'
      : r.status === "approved" ? `${chip("bad", t.amount ? "Takes " + E.money(t.amount) : "Shared", "x-circle")}<div class="small text-muted mt-1">${esc(r.reason || "Nothing asks you")}</div>`
      : `${chip("good", r.reason.startsWith("Waiting") ? "Asks you first" : "Stopped", "shield-check")}<div class="small text-muted mt-1">${esc(r.reason)}</div>`;
    return `<div class="ts-card"><div class="ts-card-head align-items-start"><div><h2>Merchant test bench: every way a subscription can take money</h2><div class="small text-muted mt-1" style="max-width:80ch">Each row is something a merchant can do after you sign up. It runs on the Everyday card as cards work today, and on the Protected card. Nothing here relies on you remembering to cancel.</div></div>
        <button class="btn btn-primary btn-sm text-nowrap" data-act="trapall"><i class="bi bi-play-fill"></i> Run all</button></div>
      <div class="table-responsive"><table class="ts-table ts-trap"><thead><tr><th>What the merchant does</th><th style="width:26%">Everyday card today</th><th style="width:26%">Protected card</th><th></th></tr></thead><tbody>
        ${E.TRAPS.map((t) => `<tr><td><div class="fw-semibold">${esc(t.title)}</div><div class="small text-muted">${esc(t.desc)}</div></td><td>${cell(R[t.k] && R[t.k].main, t)}</td><td>${cell(R[t.k] && R[t.k].prot, t)}</td><td class="text-end"><button class="btn btn-sm btn-light" data-act="trap" data-k="${t.k}">Run</button></td></tr>`).join("")}
      </tbody><tfoot><tr><td class="fw-semibold">Money taken</td><td class="num fw-bold" style="color:var(--ts-bad)">${E.money(lost("main"))}</td><td class="num fw-bold" style="color:var(--ts-good)">${E.money(lost("prot"))}</td><td></td></tr></tfoot></table></div>
      <div class="ts-card-body small text-muted pt-2">On the Everyday card, Subscription management can still cancel afterwards, but only once you notice. The Protected card's requests appear on the lock screen above: approve one to watch the merchant's automatic retry go through, once.</div></div>`;
  }

  function shop() {
    document.title = "Checkout demo · Trial Shield";
    const x = ui.ext, f = ui.form, d = x.scan ? x.scan.data : null;
    const fine = FINE().split("\n\n").slice(1).join(" ");
    app.innerHTML = `
      <div class="ts-shopwrap">
        <div>
          <a class="ts-back" href="#cards"><i class="bi bi-chevron-left"></i> Back to the banking app</a>
          <div class="d-flex flex-wrap align-items-end justify-content-between gap-3 mt-1">
            <div><h1 class="h3 fw-bold mb-1">At a checkout: pick your card</h1><div class="text-muted" style="max-width:74ch">Alex is buying a $1 skincare kit on a website. The Trial Shield extension reads the fine print, suggests a card and fills it. On the right is Alex's phone lock screen.</div></div>
            <div class="d-flex gap-2 flex-wrap align-items-center"><span class="ts-pill"><i class="bi bi-clock"></i><span class="num">${day(E.s.now, { weekday: "short", day: "numeric", month: "short" })}</span></span><span class="ts-pill" id="aiPill"><span class="dot"></span><span>Connecting AI</span></span>
              <button class="btn btn-sm btn-light" data-act="skip" data-days="1">+1 day</button><button class="btn btn-sm btn-light text-danger" data-act="reset"><i class="bi bi-arrow-counterclockwise"></i> Reset</button></div>
          </div>
        </div>
        <div class="ts-shop">
          <section class="ts-browser" aria-label="Merchant website, made up for this demo">
            <div class="ts-bar"><span class="dots" aria-hidden="true"><i></i><i></i><i></i></span><div class="url"><i class="bi bi-lock-fill"></i> ${SHOP.url}</div>
              <button type="button" class="ts-extbtn ${x.open ? "on" : ""}" data-act="ext" aria-label="${x.open ? "Close" : "Open"} the Trial Shield extension" aria-pressed="${x.open}"><i class="bi bi-shield-check"></i>${d && d.trap_risk !== "low" ? '<span class="badge-dot">!</span>' : ""}</button></div>
            <div class="ts-site">
              <div class="site-head"><span class="logo">LUMIÈRE DERMA</span><span class="tiny">A made-up shop for this demo</span></div>
              <div class="site-grid">
                <div class="prod"><div class="bottle" aria-hidden="true"></div><div class="pname">Retinol Glow Kit</div><div class="price">Just $1 shipping today</div><div class="tiny">Limited time intro offer. Your kit ships today.*</div></div>
                <form class="pay" onsubmit="return false" aria-label="Payment">
                  <label>Email<input class="form-control form-control-sm" value="alex@example.com" readonly></label>
                  <label>Card number<input id="fPan" class="form-control form-control-sm mono" value="${esc(f.pan)}" placeholder="1234 5678 9012 3456" autocomplete="off" inputmode="numeric"></label>
                  <div class="d-flex gap-2"><label class="flex-fill">Expiry<input id="fExp" class="form-control form-control-sm mono" value="${esc(f.exp)}" placeholder="MM/YY" autocomplete="off"></label>
                    <label style="width:92px">CVV<input id="fCvv" class="form-control form-control-sm mono" value="${esc(f.cvv)}" placeholder="•••" maxlength="3" inputmode="numeric" autocomplete="off"></label></div>
                  <button type="button" class="btn btn-dark w-100" data-act="sitepay">Pay ${E.money(SHOP.amount)}</button>
                  <div class="or">or</div>
                  <button type="button" class="btn ts-walletbtn w-100" data-act="wallet"><i class="bi bi-wallet2"></i> Pay with wallet</button>
                  ${f.result ? `<div class="site-result ${f.ok ? "ok" : "bad"}" role="status"><i class="bi bi-${f.ok ? "check-circle" : "x-circle"}"></i> ${esc(f.result)}</div>` : ""}
                  <p class="fine">${esc(fine)}</p>
                </form>
              </div>
            </div>
            ${x.open ? extPanel(d) : ""}
          </section>
          <aside class="ts-lock" aria-label="Alex's phone lock screen">${lockScreen()}</aside>
        </div>
        ${trapBench()}
        <div class="row g-3">
          <div class="col-lg-6"><div class="ts-note today h-100"><div class="kicker"><i class="bi bi-check2-square"></i> In the Westpac App and Westpac payments today</div><ul>${SHOP_NOTES.today.map(item).join("")}</ul></div></div>
          <div class="col-lg-6"><div class="ts-note added h-100"><div class="kicker"><i class="bi bi-shield-plus"></i> Added by Trial Shield</div><ul>${SHOP_NOTES.added.map(item).join("")}</ul></div></div>
        </div>
      </div>`;
    ["fPan", "fExp", "fCvv"].forEach((k) => { const el = $("#" + k); el.addEventListener("input", () => { ui.form[{ fPan: "pan", fExp: "exp", fCvv: "cvv" }[k]] = el.value; }); });
    aiPill(); tick();
    if (x.open && !x.scan) runExtScan();
  }

  function walletNote(k) { return k === "prot" ? "Your bank asks you before each of these charges. After today Apple Pay won't ask again, so your bank does." : "After today these charges use the merchant's token with no Face ID, and your bank doesn't ask."; }
  function openWallet() {
    const d = shopTerms(), k = ui.wallet;
    $("#sheetBody").innerHTML = `
      <div class="modal-header border-0 pb-0"><div><h2 class="modal-title h5 mb-0" id="sheetTitle"><i class="bi bi-wallet2"></i> Wallet</h2><div class="small text-muted">Simulated Apple Pay sheet</div></div><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button></div>
      <div class="modal-body d-grid gap-2">
        <div class="small text-muted fw-semibold text-uppercase" style="letter-spacing:.05em">Card</div>
        ${[["prot", "Protected card •••• 7731"], ["main", "Everyday Debit •••• 4821"]].map(([v, l]) => `<label class="ts-choice"><input type="radio" name="wcard" value="${v}" data-act="wcard" ${k === v ? "checked" : ""}><span><strong>${l}</strong></span></label>`).join("")}
        <dl class="ts-kv num small mb-0 mt-1"><dt>Pay</dt><dd>${esc(SHOP.merchant)}</dd><dt>Today</dt><dd>${E.money(SHOP.amount)}</dd></dl>
        <div class="ts-card ts-card-body small"><div class="fw-semibold mb-1">Recurring payments this merchant is setting up</div>${d.costs.map((c) => `<div>${esc(c.what)}: <strong>${E.money(c.amount)} a ${esc(c.cycle)}</strong>, ${esc(c.starts)}</div>`).join("")}</div>
        <div id="wNote" class="small fw-semibold" style="color:${k === "prot" ? "var(--ts-good)" : "var(--ts-bad)"}">${walletNote(k)}</div>
      </div>
      <div class="modal-footer border-0 pt-0"><button class="btn btn-dark w-100" data-act="walletpay"><i class="bi bi-person-bounding-box"></i> Confirm with Face ID</button></div>`;
    modal.show();
  }

  function paid(tokenRef, via) {
    if (ui.form.signed) return;
    const d = shopTerms();
    const tr = E.recordSignup({ scan: d, text: FINE(), mode: ui.ext.scan ? ui.ext.scan.mode : "offline", tokenRef, via });
    ui.form.signed = tr.id; ui.ext.step = "paid"; ui.ext.open = true;
  }
  // =====================================================================
  // Bank staff console
  // =====================================================================
  function staffShell(page, title, html) {
    const nav = [["ops", "terminal", "Operations console"], ["impact", "bar-chart-line", "Impact analytics"], ["watchlist", "binoculars", "Trap merchant watchlist"], ["disputes", "inboxes", "Disputes queue"], ["powerbi", "filetype-csv", "Power BI feeds"]];
    const openDisputes = E.s.disputes.filter((d) => d.status === "open").length;
    app.innerHTML = `
      <div class="ts-shell">
        <aside class="ts-side" aria-label="Staff navigation">
          <a class="ts-brand" href="#ops"><span class="mark"><i class="bi bi-shield-check"></i></span>Trial Shield <span class="chip chip-neutral ms-1">Staff</span></a>
          <nav class="ts-nav"><div class="ts-nav-label">Bank side</div>${nav.map(([k, i, l]) => `<a href="#${k}" class="${k === page ? "active" : ""}"><i class="bi bi-${i}"></i>${l}${k === "disputes" && openDisputes ? ` <span class="chip chip-bad ms-auto">${openDisputes}</span>` : ""}</a>`).join("")}</nav>
          <div class="ts-side-foot">Signed in as <strong>Payments and fraud operations</strong><br><button class="btn btn-sm btn-light mt-2" data-act="role" data-role="customer"><i class="bi bi-phone"></i> Switch to customer</button></div>
        </aside>
        <div class="ts-main">
          <header class="ts-top"><button class="btn btn-light ts-mobile-bar" type="button" data-act="role" data-role="customer" aria-label="Switch to customer view"><i class="bi bi-phone"></i></button><h1>${esc(title)}</h1>
            <span class="ts-pill"><i class="bi bi-clock"></i><span class="num">${day(E.s.now, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</span></span>
            <span class="ts-pill" id="aiPill"><span class="dot"></span><span>Connecting AI</span></span></header>
          <main class="ts-content">${html}</main>
        </div>
      </div>`;
    document.title = `${title} · Trial Shield staff`; aiPill(); window.scrollTo(0, 0);
  }

  function ops() {
    const s = ui.consoleSource;
    const events = E.s.events.filter((e) => !s || e.source === s).sort((a, b) => b.real - a.real || b.id - a.id).slice(0, 150);
    staffShell("ops", "Operations console", `
      <p class="text-muted" style="max-width:72ch">Every AI decision, one-time CVV, approval request and authorisation decision, across customers. Token actions mirror the issuer calls in the Visa Token Service and Mastercard MDES; in this prototype they are simulated.</p>
      <div class="ts-card mb-4"><div class="ts-card-head"><h2>Event log</h2><div class="d-flex gap-2 align-items-center"><label for="srcFilter" class="small text-muted">Source</label><select id="srcFilter" class="form-select form-select-sm" style="width:auto">${["", "AI", "TOKEN", "NETWORK", "SUBMGR", "APP"].map((x) => `<option value="${x}" ${x === s ? "selected" : ""}>${x || "All"}</option>`).join("")}</select></div></div>
        <div class="table-responsive" style="max-height:520px;overflow-y:auto"><table class="ts-log w-100"><tbody>${events.map((e) => `<tr><td class="text-muted text-nowrap">${day(e.at, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false })}</td><td><span class="src src-${e.source}">${e.source}</span></td><td class="text-muted text-nowrap">${esc(e.action)}</td><td>${esc(e.detail)}</td><td class="text-end text-nowrap num" style="color:var(--ts-good)">${e.amount ? E.money(e.amount) : ""}</td></tr>`).join("")}</tbody></table></div></div>
      <div class="ts-card"><div class="ts-card-head"><h2>AI audit trail</h2></div><div class="table-responsive"><table class="ts-table"><thead><tr><th>Time</th><th>Task</th><th>Mode</th><th class="text-end">Latency</th><th>Grounded in</th></tr></thead><tbody>
        ${E.s.ai.slice(0, 25).map((a) => `<tr><td class="small text-muted text-nowrap">${new Date(a.at).toLocaleTimeString("en-AU")}</td><td>${esc({ scan: "Fine print read", decode: "Charge explained", draft: "Cancellation draft" }[a.kind] || a.kind)}</td><td>${a.mode === "live" ? chip("good", "Live") : chip("neutral", "Offline rules")}</td><td class="text-end num">${a.ms} ms</td><td class="small">${esc(a.sources.join("; ")) || '<span class="text-muted">none</span>'}</td></tr>`).join("") || `<tr><td colspan="5" class="text-muted">No AI calls yet. Switch to the customer view and read an offer's fine print.</td></tr>`}
      </tbody></table></div></div>`);
    $("#srcFilter").addEventListener("change", (e) => { ui.consoleSource = e.target.value; ops(); });
  }

  let charts = [];
  function impact() {
    const rows = E.population();
    const sum = (k) => rows.reduce((a, r) => a + r[k], 0);
    const weeks = {}, segs = {};
    rows.forEach((r) => { const wd = new Date(E.atLocal(r.date, 12)).getUTCDay(); const mon = E.addDays(r.date, -((wd + 6) % 7)); weeks[mon] = (weeks[mon] || 0) + r.amount; segs[r.segment] = (segs[r.segment] || 0) + r.amount; });
    const segOrder = Object.entries(segs).sort((a, b) => b[1] - a[1]);
    staffShell("impact", "Impact analytics", `
      <div class="alert border d-flex gap-2 align-items-start" style="background:var(--ts-warn-soft);border-color:var(--ts-warn)!important"><i class="bi bi-info-circle mt-1" style="color:var(--ts-warn)"></i><div class="small"><strong>Modelled data.</strong> Synthetic figures showing what a product team would monitor in a pilot launched 1 Sep 2026. Not Westpac figures.</div></div>
      <div class="row g-3 mb-4">
        <div class="col-sm-6 col-xl-3"><div class="ts-card ts-card-body ts-stat h-100"><div class="label">Charges stopped</div><div class="value num" style="color:var(--ts-good)">${E.moneyK(sum("amount"))}</div><div class="foot">${sum("declined").toLocaleString("en-AU")} declined because the customer did not approve</div></div></div>
        <div class="col-sm-6 col-xl-3"><div class="ts-card ts-card-body ts-stat h-100"><div class="label">Protected card sign-ups</div><div class="value num">${sum("trials").toLocaleString("en-AU")}</div><div class="foot">${Math.round(100 * sum("kept") / sum("trials"))}% approved by the customer</div></div></div>
        <div class="col-sm-6 col-xl-3"><div class="ts-card ts-card-body ts-stat h-100"><div class="label">Trap offers flagged</div><div class="value num">${sum("traps").toLocaleString("en-AU")}</div><div class="foot">Before the customer paid</div></div></div>
        <div class="col-sm-6 col-xl-3"><div class="ts-card ts-card-body ts-stat h-100"><div class="label">Disputes avoided</div><div class="value num">${sum("disputes").toLocaleString("en-AU")}</div><div class="foot">Charges that never needed a chargeback</div></div></div>
      </div>
      <div class="row g-4"><div class="col-xl-8"><div class="ts-card h-100"><div class="ts-card-head"><h2>Weekly charges stopped after pilot launch</h2></div><div class="ts-card-body"><canvas id="weekly" height="120" aria-label="Weekly charges stopped"></canvas></div></div></div>
        <div class="col-xl-4"><div class="ts-card h-100"><div class="ts-card-head"><h2>By customer segment</h2></div><div class="ts-card-body"><canvas id="segments" height="220" aria-label="Charges stopped by segment"></canvas></div></div></div></div>`);
    charts.forEach((c) => c.destroy()); charts = [];
    const brand = getComputedStyle(document.documentElement).getPropertyValue("--ts-brand").trim();
    Chart.defaults.font.family = getComputedStyle(document.body).fontFamily; Chart.defaults.color = "#646b75";
    const k = (v) => "$" + (v / 1000) + "k";
    charts.push(new Chart($("#weekly"), { type: "bar", data: { labels: Object.keys(weeks).map((d) => E.fmt(d, { day: "2-digit", month: "short" })), datasets: [{ data: Object.values(weeks), backgroundColor: brand, borderRadius: 4, maxBarThickness: 28 }] }, options: { plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => " " + E.moneyK(c.raw) } } }, scales: { x: { grid: { display: false } }, y: { grid: { color: "#eceef1" }, ticks: { callback: k } } } } }));
    charts.push(new Chart($("#segments"), { type: "bar", data: { labels: segOrder.map((x) => x[0]), datasets: [{ data: segOrder.map((x) => x[1]), backgroundColor: brand, borderRadius: 4 }] }, options: { indexAxis: "y", plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => " " + E.moneyK(c.raw) } } }, scales: { x: { grid: { color: "#eceef1" }, ticks: { callback: k } }, y: { grid: { display: false } } } } }));
  }

  const MODELLED_WATCH = [
    ["Lumière Derma", "LDBEAUTY*CLUB", 214, 96, "A $1 offer enrols customers in an $89.95 monthly club"],
    ["SlimKeto", "SK-NUTRA*LLC", 131, 92, "Free bottle with paid shipping, then $79.95 every 30 days"],
    ["GlowLab Skincare", "SP * GLOWLAB SKINCARE", 58, 81, "$1 charge followed 10 days later by $89.95"],
    ["PixelForge", "PIXELFORGE", 77, 12, "Monthly price hides a 12 month contract"],
    ["FreshFork", "FRESHFORK PTY LTD", 49, 4, "Intro discount, then weekly deliveries"],
  ];
  function watchlist() {
    const live = {};
    E.s.scans.forEach((x) => { const k = x.merchant; live[k] = live[k] || { n: 0, high: 0, billing: x.billing, flag: x.flag }; live[k].n++; if (x.risk === "high") live[k].high++; });
    const rows = MODELLED_WATCH.map(([m, b, n, pct, flag]) => ({ m, b, n: n + (live[m] ? live[m].n : 0), pct, flag, live: !!live[m] }));
    Object.entries(live).forEach(([m, v]) => { if (!rows.some((r) => r.m === m)) rows.push({ m, b: v.billing || m.toUpperCase(), n: v.n, pct: Math.round(100 * v.high / v.n), flag: v.flag, live: true }); });
    rows.sort((a, b) => b.pct - a.pct || b.n - a.n);
    staffShell("watchlist", "Trap merchant watchlist", `
      <p class="text-muted" style="max-width:72ch">Merchants whose offers customers scanned this week, ranked by how often the fine print reader rated them a likely trap. Blocking recurring payments to a merchant is the approach Westpac NZ has used since April 2024. Counts include modelled data; rows marked live include scans from this demo.</p>
      <div class="ts-card"><div class="table-responsive"><table class="ts-table"><thead><tr><th>Merchant</th><th>Statement name</th><th class="text-end">Scans</th><th class="text-end">Rated trap</th><th>Most common catch</th><th></th></tr></thead><tbody>
        ${rows.map((r) => { const blocked = E.s.blocked.includes(r.m); return `<tr><td class="fw-semibold">${esc(r.m)} ${r.live ? chip("brand", "live") : ""}</td><td class="mono">${esc(r.b)}</td><td class="text-end num">${r.n}</td><td class="text-end num">${r.pct >= 75 ? chip("bad", r.pct + "%") : r.pct >= 25 ? chip("warn", r.pct + "%") : chip("good", r.pct + "%")}</td><td class="small">${esc(r.flag || "")}</td><td class="text-end">${blocked ? chip("neutral", "Blocked") : r.pct >= 75 ? `<button class="btn btn-sm btn-danger text-nowrap" data-act="block" data-m="${esc(r.m)}">Block recurring</button>` : `<button class="btn btn-sm btn-light" disabled>Watch</button>`}</td></tr>`; }).join("")}
      </tbody></table></div></div>`);
  }

  function disputes() {
    const list = [...E.s.disputes].sort((a, b) => (a.status === "open" ? 0 : 1) - (b.status === "open" ? 0 : 1) || b.opened - a.opened);
    staffShell("disputes", "Disputes queue", `
      <p class="text-muted" style="max-width:72ch">Charges customers asked a banker about. The AI's explanation and the charge history are attached; a person makes the decision.</p>
      <div class="ts-card"><div class="ts-list">${list.map((d) => `<div class="ts-row align-items-start"><div class="grow"><div class="title mono">${esc(d.descriptor)} · ${E.money(d.amount)}</div><div class="sub">Opened ${day(d.opened)} by Alex Nguyen · history ${esc(d.history)}</div>${d.ai ? `<div class="small mt-1"><span class="src src-AI">AI</span> ${esc(d.ai)}</div>` : ""}</div>
        ${d.status === "open" ? `<div class="d-flex gap-2"><button class="btn btn-sm btn-primary" data-act="decide" data-id="${d.id}" data-o="refunded">Approve refund</button><button class="btn btn-sm btn-light" data-act="decide" data-id="${d.id}" data-o="declined">Decline</button></div>` : chip(d.status === "refunded" ? "good" : "neutral", d.status === "refunded" ? "Refunded" : "Declined")}</div>`).join("") || `<div class="ts-row text-muted">No disputes yet. In the customer view, open a transaction and choose Ask a banker about a refund.</div>`}</div></div>`);
  }

  function powerbi() {
    staffShell("powerbi", "Power BI feeds", `
      <p class="text-muted" style="max-width:72ch">Flat tables for Power BI. In the Django version these are live CSV feeds (Get data, then Web); here you can copy each table and paste it into Excel or Power BI. population_daily is the fact table, keyed by date and segment.</p>
      <div class="ts-card"><div class="ts-list">
        ${[["population_daily", "Daily KPIs by customer segment (modelled)"], ["events", "Audit trail of AI decisions and card controls"], ["transactions", "Approved and declined charges, with the card and charge type"], ["approvals", "Every approval request and the customer's answer"], ["signups", "Sign-ups and the charges they expect"]].map(([k, d]) => `<div class="ts-row"><i class="bi bi-filetype-csv fs-4 text-muted"></i><div class="grow"><div class="title mono">${k}.csv</div><div class="sub">${d}</div></div><button class="btn btn-sm btn-light" data-act="csv" data-k="${k}"><i class="bi bi-clipboard"></i> Copy CSV</button></div>`).join("")}
      </div></div>`);
  }
  function csv(k) {
    const q = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
    if (k === "population_daily") return "date,segment,trials_protected,charges_declined,amount_protected_aud,trap_offers_flagged,disputes_avoided,approved_by_customer\n" + E.population().map((r) => [r.date, r.segment, r.trials, r.declined, r.amount, r.traps, r.disputes, r.kept].join(",")).join("\n");
    if (k === "events") return "occurred_at,source,action,detail,amount_protected_aud\n" + E.s.events.map((e) => [new Date(e.at).toISOString(), e.source, e.action, q(e.detail), e.amount || ""].join(",")).join("\n");
    if (k === "transactions") return "posted_at,descriptor,amount_aud,status,decline_reason,merchant_initiated,charge_type,card\n" + E.s.txns.map((t) => [new Date(t.at).toISOString(), q(t.descriptor), t.amount, t.status, q(t.reason), t.mit, t.kind || "", E.isProt(E.s.tokens[t.tokenRef]) ? "protected" : "everyday"].join(",")).join("\n");
    if (k === "approvals") return "requested_at,merchant,descriptor,amount_aud,charge_type,due,status,declined_attempts\n" + E.s.approvals.map((a) => [new Date(a.created).toISOString(), q(a.merchant), q(a.descriptor), a.amount, a.kind, a.due || "", a.status, a.attempts].join(",")).join("\n");
    return "merchant,card,via,first_charge,monthly_after_aud,trap_risk,status\n" + E.s.trials.map((t) => [q(t.merchant), t.card, q(t.via), t.end, t.charges.reduce((a, c) => a + E.monthly(c), 0).toFixed(2), t.risk, t.status].join(",")).join("\n");
  }

  // =====================================================================
  // Router
  // =====================================================================
  const CUSTOMER = ["home", "cards", "protected", "fineprint", "shop", "activity", "subscriptions"];
  const STAFF = ["ops", "impact", "watchlist", "disputes", "powerbi"];
  function render() {
    const h = (location.hash || "").slice(1);
    let m;
    if (!E.s.role || h === "start") return picker();
    if (E.s.role === "staff") {
      if (!STAFF.includes(h)) { if (location.hash !== "#ops") { location.hash = "#ops"; return; } }
      return ({ ops, impact, watchlist, disputes, powerbi }[h] || ops)();
    }
    if ((m = h.match(/^txn-(\d+)$/))) return txn(Number(m[1]));
    if (h === "new-trial") { location.hash = "#fineprint"; return; }
    if (/^trial-\d+$/.test(h)) { location.hash = "#protected"; return; }
    if (!CUSTOMER.includes(h)) { if (location.hash !== "#home") { location.hash = "#home"; return; } }
    return ({ home, cards, protected: protectedCard, fineprint, shop, activity, subscriptions }[h] || home)();
  }
  window.addEventListener("hashchange", render);

  // =====================================================================
  // Actions
  // =====================================================================
  const pan = (v) => String(v || "").replace(/\D/g, "");
  document.addEventListener("click", async (ev) => {
    const b = ev.target.closest("[data-act]");
    if (!b || b.tagName === "INPUT") return;
    const act = b.dataset.act, id = Number(b.dataset.id);
    if (act === "role") { E.s.role = b.dataset.role; E.save(); location.hash = b.dataset.role === "staff" ? "#ops" : "#home"; render(); return; }
    if (act === "appr") {
      const a = E.s.approvals.find((x) => x.id === id), yes = b.dataset.yes === "1", stop = !!b.dataset.stop;
      const retry = E.answerApproval(a, yes, stop);
      toast(yes ? (retry ? (retry.status === "approved" ? `${a.merchant} retried and ${E.money(a.amount)} went through, once. Next time it asks again.` : `Retry declined: ${retry.reason}.`)
        : a.due && a.due > E.today() ? `Approved ${E.money(a.amount)} to ${a.merchant} on ${dShort(a.due)}, for that one charge.` : `Approved ${E.money(a.amount)} to ${a.merchant}, for one charge.`)
        : stop ? `${a.merchant} is stopped. It can't charge this card or ask again.` : `Declined. ${a.merchant} doesn't get the ${E.money(a.amount)}.`);
      render();
    }
    else if (act === "newcvv") { const c = E.newCvv({ via: "app" }); toast(`One-time CVV ${c.code}. Valid for one purchase in the next 10 minutes.`); if (b.dataset.go && location.hash !== b.dataset.go) location.hash = b.dataset.go; else render(); }
    else if (act === "digital") { ui.showDigital = !ui.showDigital; cards(); }
    else if (act === "sample") { ui.sample = b.dataset.key; ui.scanText = window.TS_SAMPLES[ui.sample].text; ui.scan = null; fineprint(); }
    else if (act === "scan") {
      const text = ($("#offerText").value || "").trim();
      if (text.length < 20) { toast("Paste the offer's terms or confirmation email first."); return; }
      ui.scanText = text; ui.scan = null; ui.busy.scan = true; fineprint();
      E.log("APP", "scan.request", `Customer pasted ${text.length} characters of offer terms. Only this text is sent to the AI.`);
      const res = await A.scan(text);
      ui.scan = res; ui.busy.scan = false;
      E.s.scans.push({ merchant: res.data.merchant, risk: res.data.trap_risk, billing: res.data.billing_name, flag: res.data.red_flags[0] ? res.data.red_flags[0].text : "" });
      E.log("AI", "scan", `Read offer terms for ${res.data.merchant}: ${res.data.catch} Trap risk ${res.data.trap_risk} (${res.mode === "live" ? "Claude" : "offline rules"}, ${res.ms} ms).`);
      E.save();
      if (location.hash === "#fineprint") { fineprint(); const r = $("#scanResult"); if (r) r.scrollIntoView({ behavior: "smooth", block: "start" }); }
    }
    // ----- checkout demo -----
    else if (act === "ext") { ui.ext.open = !ui.ext.open; shop(); }
    else if (act === "extfill") {
      if ((ui.ext.card || "prot") === "prot") {
        ui.ext.step = "waiting"; ui.cvvReq = { merchant: SHOP.merchant, amount: SHOP.amount };
        E.log("APP", "cvv.request", `Browser extension asked the banking app for a one-time CVV for ${SHOP.merchant}, ${E.money(SHOP.amount)}. Push sent to the customer's phone.`);
      } else { Object.assign(ui.form, { pan: E.MAIN.pan, exp: E.MAIN.expiry, cvv: E.MAIN.cvc, result: null }); ui.ext.step = "filled-main"; }
      shop();
    }
    else if (act === "cvvreq") {
      const r = ui.cvvReq; ui.cvvReq = null;
      if (b.dataset.yes === "1" && r) {
        const c = E.newCvv({ merchant: r.merchant, amount: r.amount, via: "browser extension" });
        Object.assign(ui.form, { pan: E.prot().pan, exp: E.prot().expiry, cvv: c.code, result: null });
        ui.ext.step = "filled"; ui.ext.cvvId = c.id;
      } else { ui.ext.step = "choose"; E.log("APP", "cvv.declined", "Customer declined the one-time CVV request on their phone. Nothing was filled."); }
      shop();
    }
    else if (act === "sitepay") {
      const p = pan(ui.form.pan), cvv = (ui.form.cvv || "").trim();
      const ref = p === pan(E.prot().pan) ? "prot" : p === pan(E.MAIN.pan) ? null : undefined;
      if (ref === undefined) { Object.assign(ui.form, { ok: false, result: "Card number not recognised. Use the extension, or the Protected card number in the app." }); shop(); return; }
      if (!/^\d{3}$/.test(cvv)) { Object.assign(ui.form, { ok: false, result: "Enter the 3 digit CVV." }); shop(); return; }
      const t = E.authorise({ tokenRef: ref, descriptor: SHOP.descriptor, merchant: SHOP.merchant, amount: SHOP.amount, mit: false, cvv });
      if (t.status === "approved") {
        const first = !ui.form.signed;
        paid(ref, ui.ext.step === "filled" || ui.ext.step === "filled-main" ? "browser extension" : "typed in");
        Object.assign(ui.form, { ok: true, result: first ? "Order confirmed. Your Retinol Glow Kit ships today." : "Second order confirmed." });
      } else Object.assign(ui.form, { ok: false, result: `Your bank declined this payment: ${t.reason}.` });
      E.save(); shop();
    }
    else if (act === "wallet") openWallet();
    else if (act === "walletpay") {
      const tok = E.walletToken(SHOP.merchant, ui.wallet === "prot" ? "prot" : null);
      const t = E.authorise({ tokenRef: tok.ref, descriptor: SHOP.descriptor, merchant: SHOP.merchant, amount: SHOP.amount, mit: false, channel: "wallet" });
      modal.hide();
      if (t.status === "approved") { paid(tok.ref, "Apple Pay"); Object.assign(ui.form, { ok: true, result: "Order confirmed with Apple Pay. Your Retinol Glow Kit ships today." }); }
      else Object.assign(ui.form, { ok: false, result: `Your bank declined this payment: ${t.reason}.` });
      E.save(); shop();
    }
    else if (act === "extreset") { ui.form = freshForm(); ui.ext.step = "choose"; ui.ext.cvvId = null; shop(); }
    else if (act === "trap") { ui.traps[b.dataset.k] = E.runTrap(b.dataset.k); shop(); }
    else if (act === "trapall") {
      E.TRAPS.forEach((t) => { ui.traps[t.k] = E.runTrap(t.k); });
      const lost = (w) => E.TRAPS.reduce((a, t) => a + (ui.traps[t.k][w].status === "approved" ? t.amount || 0 : 0), 0);
      toast(`Everyday card: ${E.money(lost("main"))} taken. Protected card: ${E.money(lost("prot"))}. Its requests are on the lock screen.`);
      shop();
    }
    // ----- clock, reset -----
    else if (act === "jump") { const notes = E.jumpTo(b.dataset.date); toast(`Moved to ${day(E.s.now)}. ${notes.join("; ") || "Nothing fell due."}`); render(); }
    else if (act === "skip") { const notes = E.advance(Number(b.dataset.days)); toast(`Moved to ${day(E.s.now)}. ${notes.join("; ") || "Nothing fell due."}`); render(); }
    else if (act === "reset") {
      const role = E.s.role; E.seed(); E.s.role = role; E.save();
      Object.assign(ui, { scan: null, scanText: null, sample: "skincare", ext: freshExt(), form: freshForm(), cvvReq: null, wallet: "prot", traps: {} });
      toast("Demo reset to Tue 17 Nov."); if (location.hash !== "#shop") location.hash = "#home"; render();
    }
    // ----- the rest of the app -----
    else if (act === "explain") {
      const t = E.s.txns.find((x) => x.id === id);
      ui.busy["t" + id] = true; txn(id);
      const res = await A.decode(t);
      t.explanation = Object.assign({}, res.data, { mode: res.mode, sources: res.sources.map((s) => ({ title: s.title, url: s.url })) });
      ui.busy["t" + id] = false;
      E.log("AI", "decode", `"${t.descriptor}" ${E.money(t.amount)} explained as ${t.explanation.likely_service} (${t.explanation.confidence}% sure, ${t.explanation.risk}).`);
      E.save(); if (location.hash === `#txn-${id}`) txn(id);
    }
    else if (act === "dispute") { E.dispute(E.s.txns.find((x) => x.id === id)); toast("Sent to a banker. You'll hear back in the app."); render(); }
    else if (act === "cancel") openCancel(id);
    else if (act === "confirmcancel") { const s = E.s.subs.find((x) => x.id === id); E.cancelSub(s); modal.hide(); toast(`${s.name}: ${E.RAILS[s.rail][0].toLowerCase()} done.`); render(); }
    else if (act === "copydraft") { try { await navigator.clipboard.writeText($("#draftText").innerText); b.innerHTML = '<i class="bi bi-check2"></i> Copied'; } catch (e) { b.textContent = "Select the text to copy"; } }
    else if (act === "block") { E.blockMerchant(b.dataset.m); toast(`${b.dataset.m}: recurring payments blocked on Everyday cards.`); watchlist(); }
    else if (act === "decide") { const d = E.s.disputes.find((x) => x.id === id); E.decideDispute(d, b.dataset.o); toast(`Dispute ${b.dataset.o}.`); disputes(); }
    else if (act === "csv") { try { await navigator.clipboard.writeText(csv(b.dataset.k)); b.innerHTML = '<i class="bi bi-check2"></i> Copied'; } catch (e) { b.textContent = "Copy blocked by the browser"; } }
  });
  document.addEventListener("change", (ev) => {
    const r = ev.target.closest("[data-act]");
    if (!r) return;
    if (r.dataset.act === "extcard") { ui.ext.card = r.value; if (ui.ext.step !== "paid") ui.ext.step = "choose"; shop(); }
    else if (r.dataset.act === "wcard") { ui.wallet = r.value; const n = $("#wNote"); if (n) { n.textContent = walletNote(r.value); n.style.color = r.value === "prot" ? "var(--ts-good)" : "var(--ts-bad)"; } }
    else if (r.dataset.act === "mainask") {
      E.s.mainAsk = r.checked;
      E.log("APP", "setting.main_ask", `Customer turned ${r.checked ? "on" : "off"} "ask before charges from new subscriptions" for the Everyday card.`);
      E.save(); toast(r.checked ? "Everyday card: new subscriptions now ask you first." : "Everyday card: back to normal."); cards();
    }
  });
  document.addEventListener("click", (e) => { const box = $("#suggest"); if (box && !e.target.closest(".ts-phone-top")) box.classList.add("d-none"); });

  render();
})();
