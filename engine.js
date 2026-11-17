// Bank side engine: the browser port of banking/ in the Django project.
// Token service, authorisation rule, scheduler, cancel rails and seed data.
(function () {
  "use strict";
  const DAY = 864e5;
  const OFFSET = 10 * 3600e3; // Brisbane, no daylight saving
  const START = Date.parse("2026-11-17T10:00:00+10:00");
  const STORE = "trialshield-web-v3";

  const E = (window.TS = window.TS || {});

  // ---------- dates ----------
  E.dayStr = (ms) => new Date(ms + OFFSET).toISOString().slice(0, 10);
  E.atLocal = (d, h = 0, m = 0) => Date.parse(`${d}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00+10:00`);
  E.addDays = (d, n) => E.dayStr(E.atLocal(d, 12) + n * DAY);
  E.diffDays = (a, b) => Math.round((E.atLocal(a, 12) - E.atLocal(b, 12)) / DAY);
  E.addMonths = (d, n) => {
    const [y, m, day] = d.split("-").map(Number);
    const total = m - 1 + n;
    const ny = y + Math.floor(total / 12), nm = (total % 12) + 1;
    const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
    return `${ny}-${String(nm).padStart(2, "0")}-${String(Math.min(day, last)).padStart(2, "0")}`;
  };
  E.fmt = (d, opts) => new Date(E.atLocal(d, 12)).toLocaleDateString("en-AU", Object.assign({ timeZone: "Australia/Brisbane" }, opts));
  E.fmtMs = (ms, opts) => new Date(ms).toLocaleString("en-AU", Object.assign({ timeZone: "Australia/Brisbane" }, opts));
  E.money = (n) => "$" + Number(n || 0).toFixed(2);
  E.moneyK = (n) => "$" + Math.round(Number(n || 0)).toLocaleString("en-AU");
  E.today = () => E.dayStr(E.s.now);

  // ---------- state ----------
  E.save = () => { try { localStorage.setItem(STORE, JSON.stringify(E.s)); } catch (e) { /* storage unavailable */ } };
  E.load = () => {
    try { const raw = localStorage.getItem(STORE); if (raw) { E.s = JSON.parse(raw); return true; } } catch (e) { /* ignore */ }
    return false;
  };

  function hash(str) { let h = 7; for (const c of str) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; }
  E.monthly = (sub) => sub.amount * ({ week: 52 / 12, fortnight: 26 / 12, month: 1, year: 1 / 12 }[sub.cycle] || 1);
  E.nextDue = (sub) => sub.cycle === "week" ? E.addDays(sub.last, 7) : sub.cycle === "fortnight" ? E.addDays(sub.last, 14)
    : sub.cycle === "year" ? E.addMonths(sub.last, 12) : E.addMonths(sub.last, 1);

  E.log = (source, action, detail, amount = null) => {
    E.s.events.unshift({ id: ++E.s.seq, at: E.s.now, real: Date.now(), source, action, detail, amount });
  };

  // ---------- cards ----------
  // The customer has two cards on the same account: the Everyday card they already have, and the Protected card.
  // The Protected card has no static CVV. Every purchase needs a fresh one-time CVV from the app, and every charge
  // made without one (renewals, saved card, Apple Pay merchant tokens, App Store, PayPal) waits for the customer's
  // approval of that one charge. No fresh CVV and no approval means no payment.
  const PROT = "prot";
  E.MAIN = { label: "Everyday Debit", last4: "4821", pan: "4564 7380 1290 4821", expiry: "08/29", cvc: "731" };
  E.prot = () => E.s.tokens[PROT];
  E.isProt = (t) => !!t && (t.ref === PROT || t.parent === PROT);
  E.norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  E.same = (a, b) => E.norm(a) === E.norm(b);
  E.plain = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "");
  E.cardName = (t) => E.isProt(t) ? `Protected card •••• ${E.prot().last4}${t.kind === "wallet" ? " in Apple Pay" : ""}`
    : t && t.kind === "wallet" ? "Everyday Debit •••• 4821 in Apple Pay" : t && t.kind === "card_on_file" ? "Everyday Debit, card on file token" : "Everyday Debit •••• 4821";

  E.KIND = {
    recurring: "A recurring charge the merchant starts itself, sent with no CVV",
    stored: "Your saved card details used again, with no new CVV",
    wallet: "An Apple Pay charge through the merchant's token, with no Face ID",
    appstore: "An App Store subscription billed by Apple",
    paypal: "A PayPal automatic payment",
  };

  // ---------- token service (simulated VTS / MDES issuer actions) ----------
  E.createToken = (label, kind, merchant = null, cap = null) => {
    const seed = `${label}:${E.s.now}:${E.s.seq}`;
    const ref = "tkn_" + hash(seed).toString(16).slice(0, 8);
    const t = { ref, label, kind, merchant, status: "active", last4: String(hash("pan" + seed) % 9000 + 1000), cap };
    E.s.tokens[ref] = t;
    E.log("TOKEN", "token.create", `Merchant bound credential ${ref} (•••• ${t.last4}) issued for ${label}.`);
    return t;
  };
  E.walletToken = (merchant, parent) => {
    let t = Object.values(E.s.tokens).find((x) => x.kind === "wallet" && (x.parent || null) === (parent || null) && E.same(x.merchant, merchant) && x.status === "active");
    if (t) return t;
    const seed = `${merchant}:${E.s.now}:${E.s.seq}:${Date.now()}`;
    t = { ref: "tkn_" + hash(seed).toString(16).slice(0, 8), label: merchant, merchant, kind: "wallet", parent: parent || null, status: "active", last4: String(hash("dpan" + seed) % 9000 + 1000), cap: null };
    E.s.tokens[t.ref] = t;
    E.log("TOKEN", "token.create", `Apple Pay merchant token ${t.ref} created for ${merchant} on the ${parent === PROT ? "Protected card" : "Everyday card"}. Later charges can use it with no Face ID${parent === PROT ? ", so each one needs the customer's approval" : ""}.`);
    return t;
  };
  E.suspend = (t, reason) => { t.status = "suspended"; E.log("TOKEN", "token.suspend", `${t.ref} suspended: ${reason}.`); };

  // ---------- one-time CVV, made fresh for each purchase like a security code ----------
  E.CVV_MS = 10 * 60e3;
  function rand3() { try { const a = new Uint16Array(1); crypto.getRandomValues(a); return String(100 + (a[0] % 900)); } catch (e) { return String(100 + Math.floor(Math.random() * 900)); } }
  E.newCvv = ({ merchant = null, amount = null, via = "app" } = {}) => {
    const p = E.prot(); p.cvvs = p.cvvs || [];
    let code; do { code = rand3(); } while (p.cvvs.some((c) => c.code === code));
    const real = Date.now();
    const c = { id: ++E.s.seq, code, real, expires: real + E.CVV_MS, at: E.s.now, merchant, amount, via, used: false };
    p.cvvs.unshift(c); p.cvvs = p.cvvs.slice(0, 40);
    E.log("TOKEN", "cvv.issue", `One-time CVV made for the Protected card •••• ${p.last4}${merchant ? ` for ${merchant} only` : " for any one purchase"}${amount != null ? `, up to ${E.money(amount)}` : ""}. Valid 10 minutes, requested from the ${via}.`);
    E.save();
    return c;
  };
  E.openCvv = (via) => (E.prot().cvvs || []).find((c) => !c.used && c.expires > Date.now() && (!via || c.via === via)) || null;

  // ---------- approvals: one charge at a time ----------
  function findReq(merchant, amount, kind, statuses) {
    return E.s.approvals.find((a) => statuses.includes(a.status) && E.same(a.merchant, merchant) && a.kind === kind && Math.abs(a.amount - amount) < 0.005);
  }
  E.pending = () => E.s.approvals.filter((a) => a.status === "pending");
  E.requestApproval = ({ merchant, descriptor, amount, kind, due = null, what = "", cycle = null, tokenRef = null }) => {
    let a = findReq(merchant, amount, kind, ["pending"]);
    if (a) return a;
    const last = E.s.txns.find((t) => t.status === "approved" && t.amount > 0 && t.mit && (E.same(t.merchant, merchant) || t.descriptor === descriptor) && (t.kind || "recurring") === kind);
    a = { id: ++E.s.seq, merchant, descriptor, amount, kind, due, what, cycle, tokenRef, status: "pending", created: E.s.now, attempts: 0, declinedTxn: null, prev: last ? last.amount : null };
    E.s.approvals.unshift(a);
    E.log("APP", "approval.request", `Push notification: ${merchant} wants ${E.money(amount)}${due && due > E.today() ? " on " + E.fmt(due, { weekday: "short", day: "numeric", month: "short" }) : ""}. ${E.KIND[kind]}. Nothing is paid unless the customer approves this one charge.`);
    return a;
  };
  E.answerApproval = (a, yes, stop = false) => {
    if (!a || a.status !== "pending") return null;
    a.status = yes ? "approved" : "declined"; a.answered = E.s.now;
    E.log("APP", yes ? "approval.yes" : "approval.no", yes ? `Customer approved ${E.money(a.amount)} to ${a.merchant} with Face ID, for this one charge only. The next charge will ask again.` : `Customer declined ${E.money(a.amount)} to ${a.merchant}.`);
    if (stop) E.stopMerchant(a.merchant);
    let retry = null;
    if (yes && a.declinedTxn) {
      const prev = E.s.txns.find((t) => t.id === a.declinedTxn);
      if (prev) {
        E.log("NETWORK", "auth.retry", `${a.merchant} retried the declined ${E.money(prev.amount)} charge (merchants retry failed renewals automatically).`);
        retry = E.authorise({ tokenRef: prev.tokenRef, descriptor: prev.descriptor, amount: prev.amount, mit: prev.mit, merchant: prev.merchant, kind: prev.kind, subId: prev.subId, trialId: prev.trialId, chargeIdx: prev.chargeIdx });
      }
    }
    E.save();
    return retry;
  };
  E.stopMerchant = (merchant) => {
    const p = E.prot(); p.stopped = p.stopped || [];
    if (!p.stopped.some((m) => E.same(m, merchant))) p.stopped.push(merchant);
    E.s.approvals.forEach((a) => { if (a.status === "pending" && E.same(a.merchant, merchant)) { a.status = "declined"; a.answered = E.s.now; } });
    Object.values(E.s.tokens).forEach((t) => { if (t.parent === PROT && E.same(t.merchant, merchant) && t.status === "active") E.suspend(t, `customer stopped all charges from ${merchant}`); });
    E.s.subs.forEach((s) => { if (s.rail === "protected" && E.same(s.merchant, merchant) && s.status !== "cancelled") s.status = "cancelled"; });
    E.log("APP", "merchant.stop", `Customer stopped all charges from ${merchant} on the Protected card. The merchant cannot even ask again.`);
  };

  // Does this card ask before charges from this merchant? Always for the Protected card; for the Everyday card only
  // when the customer has turned on "ask before new subscriptions" and the merchant is not one of their existing ones.
  E.asks = (t, merchant) => E.isProt(t) || (!!E.s.mainAsk && !(t && t.kind === "card_on_file") && !E.s.subs.some((s) => s.seeded && E.same(s.merchant, merchant)));

  function approvalRule(merchant, amount, k) {
    const appr = findReq(merchant, amount, k, ["approved"]);
    if (appr) return { ok: true, useAppr: appr, note: "Paid under the customer's approval of this one charge. The next one will ask again." };
    const refused = findReq(merchant, amount, k, ["declined"]);
    if (refused && E.s.now - refused.answered < 7 * DAY) return { ok: false, reason: "You declined this charge in the app" };
    return { ok: false, ask: true, reason: "Waiting for your approval in the app" };
  }

  // ---------- issuer authorisation ----------
  E.authorise = (o) => {
    const { tokenRef = null, descriptor, amount, mit = false, subId = null, cvv = null, channel = null, trialId = null, chargeIdx = null, dry = false } = o;
    const merchant = o.merchant || descriptor;
    const t = tokenRef ? E.s.tokens[tokenRef] : null;
    const prot = E.isProt(t);
    const wallet = !mit && channel === "wallet";
    const kind = o.kind || (t && t.kind === "wallet" && mit ? "wallet" : mit ? "recurring" : !cvv && !wallet ? "stored" : null);
    let r = { ok: true, reason: "", note: "" };
    if (prot) {
      const p = E.prot();
      if ((p.stopped || []).some((m) => E.same(m, merchant))) r = { ok: false, reason: `You stopped all charges from ${merchant}` };
      else if (t.status !== "active") r = { ok: false, reason: "This merchant token was removed by the cardholder" };
      else if (wallet) r.note = "Customer present: Face ID and a one-time wallet cryptogram.";
      else if (!mit && cvv) {
        const c = (p.cvvs || []).find((x) => x.code === cvv);
        if (!c) r = { ok: false, reason: "CVV not recognised. Protected card CVVs are made fresh in the app for each purchase" };
        else if (c.used) r = { ok: false, reason: "One-time CVV already used" };
        else if (Date.now() > c.expires) r = { ok: false, reason: "One-time CVV expired after 10 minutes" };
        else if (c.merchant && !E.same(c.merchant, merchant)) r = { ok: false, reason: `This CVV was made for ${c.merchant} only` };
        else if (c.amount != null && amount > c.amount + 0.005) r = { ok: false, reason: `Above the ${E.money(c.amount)} this CVV was made for` };
        else r = { ok: true, useCvv: c, note: "One-time CVV matched and is now retired." };
      } else r = approvalRule(merchant, amount, kind || "stored");
    } else {
      if (mit && (E.s.blocked || []).some((m) => E.same(m, merchant))) r = { ok: false, reason: "The bank blocked recurring charges from this merchant" };
      else if (t && t.status !== "active") r = { ok: false, reason: "Token suspended by cardholder" };
      else if (t && t.cap != null && amount > t.cap + 1e-9) r = { ok: false, reason: `Above cardholder cap of ${E.money(t.cap)}` };
      else if (mit && E.asks(t, merchant)) r = approvalRule(merchant, amount, kind);
    }
    if (dry) return { status: r.ok ? "approved" : "declined", reason: r.reason, ask: !!r.ask };
    if (r.useCvv) { r.useCvv.used = true; r.useCvv.usedAt = E.s.now; r.useCvv.usedFor = merchant; }
    const txn = { id: ++E.s.seq, at: E.s.now, descriptor, merchant, amount, status: r.ok ? "approved" : "declined", reason: r.reason || "", mit, kind, channel, tokenRef, subId, trialId, chargeIdx, explanation: null };
    E.s.txns.unshift(txn);
    if (r.useAppr) { r.useAppr.status = "used"; r.useAppr.txn = txn.id; }
    const how = mit ? "merchant initiated, no CVV sent" : wallet ? "Apple Pay, customer present" : cvv ? "customer initiated, CVV entered" : "saved card details, no CVV";
    E.log("NETWORK", r.ok ? "auth.approved" : "auth.declined", `${descriptor} requested ${E.money(amount)} on the ${E.cardName(t)} (${how}). Issuer response: ${r.ok ? "APPROVED" : "DECLINED, " + r.reason}.${r.note ? " " + r.note : ""}`, r.ok ? null : amount);
    if (r.ask) {
      const tr = trialId != null ? E.s.trials.find((x) => x.id === trialId) : null, ch = tr ? tr.charges[chargeIdx] : null;
      const sub = subId != null ? E.s.subs.find((s) => s.id === subId) : null;
      const a = E.requestApproval({ merchant, descriptor, amount, kind: kind || "stored", tokenRef, due: E.today(), what: ch ? ch.what : sub ? sub.name : "", cycle: ch ? ch.cycle : sub ? sub.cycle : null });
      a.attempts++; a.declinedTxn = txn.id; a.lastAttempt = E.s.now;
    }
    if (r.ok) settle(txn);
    return txn;
  };

  // A paid charge that belongs to a sign-up becomes a subscription; a paid retry revives an unpaid one.
  function settle(txn) {
    if (txn.trialId != null) {
      const tr = E.s.trials.find((x) => x.id === txn.trialId), c = tr && tr.charges[txn.chargeIdx];
      if (!c || c.sub) return;
      const sub = { id: ++E.s.seq, name: `${tr.merchant} ${c.what}`.trim(), merchant: tr.merchant, descriptor: c.descriptor, category: "New subscription",
        rail: E.asks(E.s.tokens[tr.token], tr.merchant) ? "protected" : "token", amount: c.amount, prev: c.amount, cycle: c.cycle, status: "active", last: E.today(),
        token: tr.token, requested: null, kind: c.kind };
      E.s.subs.push(sub); c.sub = sub.id; txn.subId = sub.id;
      refreshTrial(tr);
    } else if (txn.subId != null && txn.mit) {
      const sub = E.s.subs.find((s) => s.id === txn.subId);
      if (sub && sub.status === "unpaid") { sub.status = "active"; sub.last = sub.dueFailed || E.today(); }
    }
  }
  function refreshTrial(tr) {
    if (tr.charges.some((c) => !c.attempted)) { tr.status = "active"; return; }
    const paid = tr.charges.filter((c) => c.sub).length;
    tr.status = paid === tr.charges.length ? "kept" : paid ? "partly" : "declined";
  }

  // ---------- sign-ups ----------
  // Recorded when the customer pays at a checkout. The fine print reading tells the bank what to expect and when.
  E.recordSignup = ({ scan, text = "", mode = "offline", tokenRef = null, via = "checkout" }) => {
    const d = scan, today = E.today();
    const tok = tokenRef ? E.s.tokens[tokenRef] : null;
    const baseDays = d.trial_days || 7;
    const merchant = d.merchant || "Merchant";
    const first = d.billing_name || E.plain(merchant).toUpperCase();
    const prefix = first.split("*")[0].trim();
    const costs = d.costs && d.costs.length ? d.costs : d.price_after_trial ? [{ what: d.service || "Subscription", amount: d.price_after_trial, cycle: d.billing_cycle || "month", starts: "" }] : [];
    const charges = costs.map((c, i) => {
      const m = String(c.starts || "").match(/(\d+)\s*days?/);
      return { what: c.what, amount: c.amount, cycle: ["week", "fortnight", "month", "year"].includes(c.cycle) ? c.cycle : "month", date: E.addDays(today, m ? Number(m[1]) : baseDays),
        descriptor: i === 0 ? first : `${prefix}*${E.plain(c.what).toUpperCase().replace(/ MEMBERSHIP$/, "")}`,
        kind: tok && tok.kind === "wallet" ? "wallet" : "recurring", asked: false, attempted: false, sub: null };
    });
    const tr = { id: ++E.s.seq, merchant, token: tokenRef, card: E.isProt(tok) ? "prot" : "main", via, created: E.s.now, upfront: Number(d.upfront_price) || 0,
      catch: d.catch || "", costs: d.costs || [], risk: d.trap_risk || "medium", cancel: d.how_to_cancel || "", charges, status: "active", mode, text: String(text).slice(0, 4000),
      end: charges.length ? charges.map((c) => c.date).sort()[0] : E.addDays(today, baseDays) };
    E.s.trials.push(tr);
    const asks = E.asks(tok, merchant);
    E.log("APP", "signup.record", `${merchant} sign-up on the ${tr.card === "prot" ? "Protected card" : "Everyday card"} via ${via}. Expected: ${charges.map((c) => `${E.money(c.amount)} a ${c.cycle} from ${E.fmt(c.date, { day: "numeric", month: "short" })}`).join(", ") || "no later charges"}.${charges.length ? asks ? " Each one will need the customer's approval." : " These will go through without asking." : ""}`);
    E.save();
    return tr;
  };

  // ---------- scheduler ----------
  E.runScheduler = () => {
    const now = E.s.now, today = E.today(), notes = [];
    // 1. Ask ahead: two days before an expected charge on a card that asks, the approval request goes out.
    for (const tr of E.s.trials) {
      tr.charges.forEach((c) => {
        if (c.attempted || c.asked || !E.asks(E.s.tokens[tr.token], tr.merchant) || E.diffDays(c.date, today) > 2) return;
        c.asked = true;
        E.requestApproval({ merchant: tr.merchant, descriptor: c.descriptor, amount: c.amount, kind: c.kind, due: c.date, what: c.what, cycle: c.cycle, tokenRef: tr.token });
        notes.push(`${tr.merchant} asked for ${E.money(c.amount)}`);
      });
    }
    for (const sub of E.s.subs) {
      if (sub.status !== "active" || sub.rail !== "protected") continue;
      const due = E.nextDue(sub);
      if (E.diffDays(due, today) > 2 || sub.askedFor === due) continue;
      sub.askedFor = due;
      E.requestApproval({ merchant: sub.merchant, descriptor: sub.descriptor, amount: sub.amount, kind: sub.kind || "recurring", due, what: sub.name, cycle: sub.cycle, tokenRef: sub.token });
    }
    // 2. First charges after a trial.
    for (const tr of E.s.trials) {
      tr.charges.forEach((c, i) => {
        if (c.attempted || c.date > today) return;
        c.attempted = true;
        const txn = E.authorise({ tokenRef: tr.token, descriptor: c.descriptor, amount: c.amount, mit: true, merchant: tr.merchant, kind: c.kind, trialId: tr.id, chargeIdx: i });
        if (txn.status !== "approved") notes.push(`Declined ${c.descriptor} ${E.money(c.amount)}`);
      });
      refreshTrial(tr);
    }
    // 3. Cancellations sent over the subscription rail confirm after two days.
    for (const sub of E.s.subs) {
      if (sub.status === "cancel_requested" && sub.requested && now - sub.requested >= 2 * DAY) {
        sub.status = "cancelled";
        E.log("SUBMGR", "cancel.confirmed", `${sub.merchant} confirmed the cancellation of ${sub.name}.`);
      }
    }
    // 4. Renewals.
    for (const sub of E.s.subs) {
      let due = E.nextDue(sub), guard = 0;
      while (due <= today && guard++ < 24) {
        if (sub.status === "cancelled" && ["subman", "directdebit", "apple", "protected"].includes(sub.rail)) break;
        if (sub.status === "unpaid") break;
        const txn = E.authorise({ tokenRef: sub.token, descriptor: sub.descriptor, amount: sub.amount, mit: true, subId: sub.id, merchant: sub.merchant, kind: sub.kind });
        if (txn.status !== "approved" && sub.rail === "protected") { sub.status = "unpaid"; sub.dueFailed = due; notes.push(`Declined ${sub.descriptor} ${E.money(sub.amount)}`); break; }
        sub.last = due;
        if (txn.status !== "approved") break;
        due = E.nextDue(sub);
      }
    }
    // 5. Unanswered requests lapse after a week. The charge they were for has already declined.
    E.s.approvals.forEach((a) => { if (a.status === "pending" && now - Math.max(a.created, a.lastAttempt || 0) > 7 * DAY) { a.status = "expired"; a.answered = now; } });
    return notes;
  };
  E.advance = (days) => {
    E.s.now += days * DAY;
    E.log("APP", "clock.advance", `Demo clock moved forward ${days} day${days === 1 ? "" : "s"} to ${E.fmtMs(E.s.now, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}.`);
    const notes = E.runScheduler();
    E.save();
    return notes;
  };
  E.jumpTo = (d) => { const n = E.diffDays(d, E.today()); return n > 0 ? E.advance(n) : []; };

  // ---------- merchant test bench: every way a subscription can take money ----------
  E.TRAPS = [
    { k: "convert", title: "The trial converts", desc: "Ten days later the club charges $89.95", descriptor: "LDBEAUTY*CLUB", merchant: "Lumière Derma", amount: 89.95, mit: true, kind: "recurring" },
    { k: "addon", title: "A hidden add-on", desc: "A membership you never noticed: Glow Rewards, $24.95", descriptor: "LDBEAUTY*GLOW REWARDS", merchant: "Lumière Derma", amount: 24.95, mit: true, kind: "recurring" },
    { k: "again", title: "You approved once, then forgot", desc: "The same $89.95 comes back the next month", descriptor: "LDBEAUTY*CLUB", merchant: "Lumière Derma", amount: 89.95, mit: true, kind: "recurring" },
    { k: "price", title: "The price goes up", desc: "The club quietly becomes $99.95", descriptor: "LDBEAUTY*CLUB", merchant: "Lumière Derma", amount: 99.95, mit: true, kind: "recurring" },
    { k: "oneclick", title: "The saved card is used again", desc: "A $34.95 order on the card the site kept, no CVV", descriptor: "LDBEAUTY*SHOP", merchant: "Lumière Derma", amount: 34.95, mit: false, kind: "stored" },
    { k: "reuse", title: "Copied card details", desc: "The card number and CVV from checkout used at another shop", descriptor: "QUICKBUY ONLINE", merchant: "QuickBuy Online", amount: 249, mit: false, reuse: true },
    { k: "wallet", title: "Apple Pay renewal", desc: "$89.95 through the Apple Pay merchant token, no Face ID", descriptor: "LDBEAUTY*CLUB", merchant: "Lumière Derma", amount: 89.95, mit: true, kind: "wallet", wallet: true },
    { k: "appstore", title: "App Store renewal", desc: "APPLE.COM/BILL $14.99, where Apple never names the app", descriptor: "APPLE.COM/BILL CORK IRL", merchant: "Apple", amount: 14.99, mit: true, kind: "appstore" },
    { k: "paypal", title: "PayPal automatic payment", desc: "$89.95 through a PayPal billing agreement", descriptor: "PAYPAL *LUMIEREDERM", merchant: "PayPal: Lumière Derma", amount: 89.95, mit: true, kind: "paypal" },
    { k: "annual", title: "A yearly renewal", desc: "PixelForge renews at $149.00, a year after you forgot", descriptor: "PIXELFORGE", merchant: "PixelForge", amount: 149, mit: true, kind: "recurring" },
    { k: "updater", title: "Your replacement card number", desc: "The merchant asks the card network for your new card details", special: true },
  ];
  E.runTrap = (k) => {
    const x = E.TRAPS.find((t) => t.k === k);
    if (x.special) {
      E.log("NETWORK", "updater.refused", `Card network updater asked for replacement details of the Protected card •••• ${E.prot().last4} for Lumière Derma. Refused: Protected card details are never passed on.`);
      E.save();
      return { main: { status: "approved", reason: "New card details passed to the merchant automatically" }, prot: { status: "declined", reason: "Not passed on: the merchant gets nothing" }, amount: 0 };
    }
    const base = { descriptor: x.descriptor, amount: x.amount, mit: x.mit, merchant: x.merchant, kind: x.kind };
    const main = E.authorise(Object.assign({}, base, { tokenRef: null, dry: true, cvv: x.reuse ? E.MAIN.cvc : null }));
    const ref = x.wallet ? E.walletToken("Lumière Derma", PROT).ref : PROT;
    let cvv = null;
    if (x.reuse) { const used = (E.prot().cvvs || []).find((c) => c.used); cvv = used ? used.code : "318"; }
    const prot = E.authorise(Object.assign({}, base, { tokenRef: ref, cvv }));
    E.save();
    return { main: { status: main.status, reason: main.reason }, prot: { status: prot.status, reason: prot.reason }, amount: x.amount };
  };

  // ---------- cancel and dispute ----------
  E.RAILS = {
    subman: ["In app cancel", "The request goes to the merchant over the card network subscription rail the bank already uses. Confirmation usually takes 1 to 5 business days."],
    token: ["Pause the merchant's card token", "Stops the money straight away: future charges from this merchant decline. Send the drafted message too, so the contract itself ends."],
    directdebit: ["Stop the direct debit", "Australian banks must stop a direct debit when you ask, without sending you to the merchant first."],
    protected: ["Stop all charges from this merchant", "Your Protected card already asks before every charge. Stopping blocks this merchant completely, so it cannot even ask. Send the drafted message too, so the contract itself ends."],
    apple: ["Cancel inside Apple", "Apple bills every App Store subscription under one name, so no bank can see which app it is. Open Settings, tap your name, then Subscriptions, and cancel it there."],
  };
  E.cancelSub = (sub) => {
    if (sub.status !== "active") return;
    const monthly = E.monthly(sub);
    if (sub.rail === "subman") {
      sub.status = "cancel_requested"; sub.requested = E.s.now;
      E.log("SUBMGR", "cancel.request", `Cancellation of ${sub.name} sent to ${sub.merchant} over the subscription rail.`, monthly);
    } else if (sub.rail === "token") {
      if (!sub.token) sub.token = E.createToken(sub.merchant, "card_on_file").ref;
      E.suspend(E.s.tokens[sub.token], `customer cancelled ${sub.name}`);
      sub.status = "cancelled";
      E.log("APP", "cancel.token", `${sub.name}: card on file token paused; further charges will decline.`, monthly);
    } else if (sub.rail === "protected") {
      E.stopMerchant(sub.merchant);
      sub.status = "cancelled";
      E.log("APP", "cancel.protected", `${sub.name}: merchant stopped on the Protected card.`, monthly);
    } else if (sub.rail === "directdebit") {
      sub.status = "cancelled";
      E.log("APP", "cancel.direct_debit", `Direct debit stop placed on ${sub.descriptor}, as required on request.`, monthly);
    } else {
      sub.status = "cancelled";
      E.log("APP", "cancel.apple", `${sub.name} is billed through Apple. Customer confirmed they cancelled it there; the bank will flag any further charge.`, monthly);
    }
    E.save();
  };
  E.dispute = (txn) => {
    E.s.disputes = E.s.disputes || [];
    if (E.s.disputes.some((d) => d.txn === txn.id)) return;
    const hist = E.s.txns.filter((t) => t.descriptor === txn.descriptor).sort((a, b) => a.at - b.at).map((t) => E.money(t.amount)).join(", ");
    E.s.disputes.push({ id: ++E.s.seq, txn: txn.id, descriptor: txn.descriptor, amount: txn.amount, opened: E.s.now, status: "open", history: hist,
      ai: txn.explanation ? `${txn.explanation.likely_service}: ${txn.explanation.explanation}` : "" });
    E.log("APP", "dispute.open", `Dispute review opened for ${txn.descriptor} ${E.money(txn.amount)} with charge history attached. A banker decides, not the AI.`);
    E.save();
  };
  E.decideDispute = (d, outcome) => {
    d.status = outcome;
    E.log("APP", "dispute." + outcome, `Bank staff ${outcome === "refunded" ? "approved a refund of" : "declined"} ${E.money(d.amount)} for ${d.descriptor}.`, outcome === "refunded" ? d.amount : null);
    E.save();
  };
  E.blockMerchant = (name) => {
    E.s.blocked = E.s.blocked || [];
    if (!E.s.blocked.includes(name)) E.s.blocked.push(name);
    E.log("APP", "merchant.block", `Bank staff added ${name} to the recurring payment block list (the Westpac NZ subscription trap approach).`);
    E.save();
  };

  // ---------- seed ----------
  const MERCHANTS = {
    netflix: ["Netflix", "NETFLIX.COM MELBOURNE AU", "Streaming", "subman"],
    stan: ["Stan", "STAN.COM.AU SYDNEY", "Streaming", "subman"],
    disney: ["Disney+", "DISNEY PLUS SYDNEY", "Streaming", "token"],
    spotify: ["Spotify", "SPOTIFY P3B2A1C9 STOCKHOLM", "Music", "subman"],
    apple: ["Apple", "APPLE.COM/BILL CORK IRL", "Apple billed", "apple"],
    glowlab: ["GlowLab Skincare", "SP * GLOWLAB SKINCARE", "Online shop", "token"],
    gym: ["Anytime Fitness", "DD *ANYTIME FITNESS", "Fitness", "directdebit"],
  };
  const SUBS = [
    ["netflix", "Netflix Standard", 20.99, 20.99, "month", "2025-03-03"],
    ["stan", "Stan Standard", 17.0, 17.0, "month", "2026-02-09"],
    ["disney", "Disney+ Standard", 15.99, 15.99, "month", "2026-06-28"],
    ["spotify", "Spotify Premium Individual", 15.99, 13.99, "month", "2024-01-06"],
    ["apple", "Unknown App Store subscription", 14.99, 14.99, "month", "2026-08-12"],
    ["apple", "iCloud+ 200GB", 4.49, 4.49, "month", "2024-05-02"],
    ["glowlab", "GlowLab VIP Skin Club", 89.95, 1.0, "month", "2026-11-04"],
    ["gym", "Anytime Fitness membership", 33.4, 33.4, "fortnight", "2026-02-03"],
  ];
  const ONE_OFFS = [["WOOLWORTHS 4120 TOOWONG", 64.2, "2026-11-15"], ["SQ *BEANLAB ST LUCIA", 5.5, "2026-11-16"], ["TRANSLINK GO CARD TOPUP", 30, "2026-11-10"],
    ["UBER *EATS HELP.UBER.COM", 27.85, "2026-11-13"], ["COLES 0752 INDOOROOPILLY", 48.1, "2026-11-08"], ["SQ *BEANLAB ST LUCIA", 5.5, "2026-11-12"],
    ["BP CONNECT TOOWONG", 71.34, "2026-11-05"], ["JB HI FI BRISBANE", 39, "2026-10-30"]];

  E.seed = () => {
    E.s = { now: START, seq: 0, tokens: {}, subs: [], txns: [], trials: [], events: [], ai: [], disputes: [], blocked: [], role: null, scans: [], approvals: [], mainAsk: false };
    const until = "2026-11-17";
    for (const [mk, name, amount, prev, cycle, started] of SUBS) {
      const [mname, desc, cat, rail] = MERCHANTS[mk];
      let token = null;
      if (rail === "token") {
        token = "tkn_cof_" + mk;
        E.s.tokens[token] = { ref: token, label: mname, kind: "card_on_file", merchant: mname, status: "active", last4: "4821", cap: null };
      }
      const sub = { id: ++E.s.seq, name, merchant: mname, descriptor: desc, category: cat, rail, amount, prev, cycle, status: "active", last: started, token, requested: null, seeded: true };
      const hist = [];
      if (mk === "glowlab") hist.push(["2026-11-04", 1.0], ["2026-11-14", 89.95]);
      else {
        let d = started, i = 0;
        while (d < "2026-07-20") { i++; d = cycle === "fortnight" ? E.addDays(started, 14 * i) : E.addMonths(started, i); }
        while (d <= until) {
          hist.push([d, mk === "spotify" && d < "2026-11-01" ? prev : amount]);
          i++; d = cycle === "fortnight" ? E.addDays(started, 14 * i) : E.addMonths(started, i);
        }
      }
      for (const [d, a] of hist) E.s.txns.push({ id: ++E.s.seq, at: E.atLocal(d, 7, 12), descriptor: desc, merchant: mname, amount: a, status: "approved", reason: "", mit: d !== started, kind: d !== started ? "recurring" : null, tokenRef: token, subId: sub.id, explanation: null });
      sub.last = hist[hist.length - 1][0];
      E.s.subs.push(sub);
    }
    for (const [desc, a, d] of ONE_OFFS) E.s.txns.push({ id: ++E.s.seq, at: E.atLocal(d, 12, 12), descriptor: desc, amount: a, status: "approved", reason: "", mit: false, tokenRef: null, subId: null, explanation: null });
    // The Protected card, opened last week, and the Kayo trial Alex started with it.
    const kayoAt = Date.parse("2026-11-12T20:04:00+10:00");
    E.s.tokens[PROT] = { ref: PROT, label: "Protected card", kind: "protected", status: "active", last4: "7731", pan: "4564 7380 5512 7731", expiry: "11/29", cap: null, stopped: [],
      cvvs: [{ id: ++E.s.seq, code: "318", real: 0, expires: 0, at: kayoAt - 60e3, merchant: "Kayo Sports", amount: 0, via: "browser extension", used: true, usedAt: kayoAt, usedFor: "Kayo Sports" }] };
    E.s.txns.push({ id: ++E.s.seq, at: kayoAt, descriptor: "KAYO SPORTS MELBOURNE", merchant: "Kayo Sports", amount: 0, status: "approved", reason: "", mit: false, kind: null, tokenRef: PROT, subId: null, explanation: null });
    E.s.txns.sort((a, b) => b.at - a.at);
    const kayo = { id: ++E.s.seq, merchant: "Kayo Sports", token: PROT, card: "prot", via: "browser extension", created: kayoAt, upfront: 0, catch: "Free for 7 days, then $25.00 a month unless you cancel.",
      costs: [{ what: "Kayo One", amount: 25, cycle: "month", starts: "after 7 days" }], risk: "low", cancel: "Online in My Account", status: "active", mode: "seed", text: "", end: "2026-11-19",
      charges: [{ what: "Kayo One", amount: 25, cycle: "month", date: "2026-11-19", descriptor: "KAYO SPORTS MELBOURNE", kind: "recurring", asked: true, attempted: false, sub: null }] };
    E.s.trials.push(kayo);
    E.s.approvals.push({ id: ++E.s.seq, merchant: "Kayo Sports", descriptor: "KAYO SPORTS MELBOURNE", amount: 25, kind: "recurring", due: "2026-11-19", what: "Kayo One", cycle: "month", tokenRef: PROT,
      status: "pending", created: Date.parse("2026-11-17T09:00:00+10:00"), attempts: 0, declinedTxn: null, prev: null });
    const ev = (at, source, action, detail) => E.s.events.push({ id: ++E.s.seq, at, real: Date.now() - E.s.seq, source, action, detail, amount: null });
    ev(Date.parse("2026-11-10T18:30:00+10:00"), "TOKEN", "card.create", "Protected card •••• 7731 opened on the Everyday account. No static CVV: a fresh one is made for each purchase.");
    ev(kayoAt - 60e3, "TOKEN", "cvv.issue", "One-time CVV made for the Protected card •••• 7731 for Kayo Sports only. Valid 10 minutes, requested from the browser extension.");
    ev(kayoAt, "NETWORK", "auth.approved", "KAYO SPORTS MELBOURNE requested $0.00 on the Protected card •••• 7731 (customer initiated, CVV entered). Issuer response: APPROVED. One-time CVV matched and is now retired.");
    ev(Date.parse("2026-11-17T09:00:00+10:00"), "APP", "approval.request", "Push notification: Kayo Sports wants $25.00 on Thu 19 Nov. A recurring charge the merchant starts itself, sent with no CVV. Nothing is paid unless the customer approves this one charge.");
    ev(START, "APP", "session.start", "Demo reset. Alex has 8 recurring charges on the Everyday card and 1 trial on the Protected card.");
    E.save();
  };

  // ---------- modelled population for analytics (same generator idea as the Django seed) ----------
  E.population = () => {
    let x = 42;
    const rnd = (a, b) => { x = (x * 1103515245 + 12345) % 2147483648; return a + (x / 2147483648) * (b - a); };
    const segs = { Students: 0.9, "Young professionals": 1.4, Families: 1.1, Retirees: 0.5 };
    const rows = [];
    for (let d = "2026-07-20"; d <= "2026-11-15"; d = E.addDays(d, 1)) {
      const pilot = d >= "2026-09-01";
      const ramp = pilot ? 1 + Math.min(E.diffDays(d, "2026-09-01"), 60) / 60 * 2.2 : 1;
      const wd = new Date(E.atLocal(d, 12)).getUTCDay();
      const weekend = wd === 0 || wd === 6 ? 1.15 : 1;
      for (const [seg, w] of Object.entries(segs)) {
        const base = 140 * w * ramp * weekend;
        const trials = Math.floor(pilot ? base * rnd(0.85, 1.15) : base * 0.08 * rnd(0.7, 1.3));
        const declined = Math.floor(trials * rnd(0.26, 0.34));
        const amount = Math.round(declined * rnd(14, 24) * (seg === "Families" ? 1.6 : 1) * 100) / 100;
        rows.push({ date: d, segment: seg, trials, declined, amount, traps: Math.floor(trials * rnd(0.04, 0.09)),
          disputes: Math.floor(declined * rnd(0.35, 0.5)), kept: Math.floor(trials * rnd(0.38, 0.5)) });
      }
    }
    return rows;
  };
})();
