// Trial Shield content script. Runs in every frame of every page, including payment iframes from another origin
// (Stripe, Shopify and Braintree style hosted fields), the same way password managers fill cards today.
(() => {
  "use strict";
  if (window.__trialShield) return;
  window.__trialShield = true;
  const TOP = window === window.top;

  // ---------- 1. find card fields ----------
  const KINDS = {
    number: [/^cc-number$/, /card.?(number|no\b)|cardnumber|cc.?num|credit.?card.?\[?number|kartennummer/i],
    exp: [/^cc-exp$/, /expir|exp.?date|mm\s*\/\s*yy|valid.?(thru|until)|\bexp\b/i],
    month: [/^cc-exp-month$/, /exp\w*.?month|\bmonth\b/i],
    year: [/^cc-exp-year$/, /exp\w*.?year|\byear\b/i],
    cvc: [/^cc-csc$/, /\bcvc|cvv|\bcsc\b|security.?code|verification.?(value|code)|card.?code|\bcid\b/i],
  };
  function labelOf(el) {
    const parts = [];
    if (el.id) { const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`); if (l) parts.push(l.textContent); }
    const wrap = el.closest("label"); if (wrap) parts.push(wrap.textContent);
    return parts.join(" ");
  }
  function describe(el) {
    return [el.name, el.id, el.placeholder, el.getAttribute("aria-label"), el.getAttribute("data-elements-stable-field-name"), labelOf(el)].filter(Boolean).join(" ");
  }
  function visible(el) { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden"; }
  function findFields() {
    const found = {};
    const els = [...document.querySelectorAll("input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=submit]), select")].filter(visible);
    for (const pass of [0, 1]) {   // pass 0: standard autocomplete attributes; pass 1: names, labels and placeholders
      for (const el of els) {
        if (Object.values(found).includes(el)) continue;
        const ac = (el.getAttribute("autocomplete") || "").toLowerCase().replace(/^.*\s/, "");
        const text = describe(el);
        for (const [kind, [acRe, textRe]] of Object.entries(KINDS)) {
          if (found[kind]) continue;
          if (pass === 0 ? acRe.test(ac) : (!ac.startsWith("cc-") && textRe.test(text) && !/email|phone|mobile|postcode|zip/i.test(text))) { found[kind] = el; break; }
        }
      }
    }
    if (!found.number) return {};   // only act where there really is a card form
    return found;
  }

  // ---------- 2. fill like a person typing, so React, Vue and payment SDKs register it ----------
  function setValue(el, value) {
    const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
    el.focus();
    if (el instanceof HTMLSelectElement) {
      const opt = [...el.options].find((o) => o.value === value || o.text.trim() === value || o.value.endsWith(value) || o.text.trim().endsWith(value));
      if (opt) setter.call(el, opt.value);
    } else setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.blur();
  }
  function fill(card) {
    const f = findFields();
    if (!f.number) return 0;
    const [mm, yy] = card.expiry.split("/");
    setValue(f.number, card.pan.replace(/(\d{4})(?=\d)/g, "$1 "));
    if (f.exp) {
      const ph = (f.exp.placeholder || "") + (f.exp.getAttribute("maxlength") || "");
      setValue(f.exp, /yyyy/i.test(ph) ? `${mm}/20${yy}` : /\s\/\s/.test(ph) || Number(f.exp.getAttribute("maxlength")) >= 7 ? `${mm} / ${yy}` : `${mm}/${yy}`);
    }
    if (f.month) setValue(f.month, mm);
    if (f.year) setValue(f.year, f.year.tagName === "SELECT" ? `20${yy}` : (Number(f.year.getAttribute("maxlength")) === 2 ? yy : `20${yy}`));
    if (f.cvc && card.cvv) setValue(f.cvc, card.cvv);
    return Object.keys(f).length;
  }

  let reported = false;
  function check() {
    const f = findFields();
    if (f.number && !reported) {
      reported = true;
      chrome.runtime.sendMessage({ type: "ts-fields", kinds: Object.keys(f) });
    }
  }
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "ts-do-fill") {
      const n = fill(msg.card);
      if (n) chrome.runtime.sendMessage({ type: "ts-filled", fields: n, origin: location.origin });
    }
    if (TOP && msg.type === "ts-show") panel.open(msg);
    if (TOP && msg.type === "ts-filled-report") panel.filled(msg);
  });
  new MutationObserver(() => { clearTimeout(window.__tsT); window.__tsT = setTimeout(check, 400); }).observe(document.documentElement, { childList: true, subtree: true });
  setTimeout(check, 300);
  if (!TOP) return;

  // ---------- 3. the panel, top frame only ----------
  const panel = (() => {
    let host, root, state = { card: null, step: "choose", terms: null, amount: null, shown: false };
    const esc = (v) => String(v == null ? "" : v).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    const bold = (s) => esc(s).replace(/(\$\d[\d,]*(?:\.\d{2})?(?: a (?:week|fortnight|month|year))?|\b\d+ days\b|from day \d+)/g, "<b>$1</b>");
    function pageAmount() {
      const t = document.body.innerText.replace(/\s+/g, " ");
      const m = t.match(/(?:pay|total|due today|order total|place order|today)\D{0,16}\$\s?(\d{1,4}(?:\.\d{2})?)/i) || t.match(/\$\s?(\d{1,4}(?:\.\d{2})?)\s*(?:today|now)/i);
      if (m) return Number(m[1]);
      return state.terms && state.terms.upfront != null ? state.terms.upfront : null;
    }
    function render() {
      const t = state.terms, risky = t && t.risk !== "none";
      const card = state.card || (risky ? "protected" : "everyday");
      state.card = card;
      root.innerHTML = `<style>${PANEL_CSS}</style><div class="p" role="dialog" aria-label="Trial Shield">
        <div class="h"><span class="mk">✓</span><div class="g"><b>Trial Shield</b><div class="s">Concept extension for your bank cards</div></div><button class="x" data-a="close" aria-label="Close">×</button></div>
        <div class="b">
          ${risky ? `<div class="c ${t.risk}"><div class="l">${t.risk === "high" ? "Warning: likely subscription trap" : "This checkout starts a subscription"}</div><div>${bold(t.catch)}</div>${t.flags.length ? `<ul>${t.flags.slice(0, 4).map((f) => `<li>${esc(f)}</li>`).join("")}</ul>` : ""}</div>` : ""}
          <div class="k">Pay with</div>
          <label class="o"><input type="radio" name="tsc" value="protected" ${card === "protected" ? "checked" : ""}><span><b>Protected card •••• 7731</b>${risky ? ' <i class="sg">Suggested</i>' : ""}<br><small>A new one-time CVV for this payment. Every later charge asks you first.</small></span></label>
          <label class="o"><input type="radio" name="tsc" value="everyday" ${card === "everyday" ? "checked" : ""}><span><b>Everyday Debit •••• 4821</b><br><small>Your Digital Card and today's CVC. Later charges go through without asking.</small></span></label>
          ${card === "everyday" && risky ? `<div class="w">On this card the ${bold(TS_TERMS.money(t.monthly))} a month goes through unless you remember to cancel.</div>` : ""}
          <label class="am">Amount today <input id="tsAmt" inputmode="decimal" value="${state.amount != null ? state.amount.toFixed(2) : ""}" placeholder="0.00"></label>
          <div id="st">${status()}</div>
          <button class="go" data-a="fill" ${state.step === "waiting" ? "disabled" : ""}>${state.step === "filled" ? "Fill again" : "Fill card details"}</button>
        </div></div>`;
    }
    function status() {
      if (state.step === "waiting") return `<div class="wt">Approve in your banking app. <a href="${esc(state.appUrl)}" target="_blank" rel="noopener">Open it</a></div>`;
      if (state.step === "filled") return `<div class="ok">Filled ${state.card === "protected" ? `the Protected card with one-time CVV <b>${esc(state.cvv)}</b>: works once, up to ${TS_TERMS.money(state.amount || 0)}, for 10 minutes` : "your Everyday card"}${state.frames ? ` (${state.frames} field${state.frames > 1 ? "s" : ""}${state.cross ? " in the payment frame" : ""})` : ""}.</div>`;
      if (state.step === "declined") return `<div class="w">You declined in the app. Nothing was filled.</div>`;
      if (state.step === "error") return `<div class="w">${esc(state.error)}</div>`;
      return "";
    }
    async function onFill() {
      const amt = Number((root.getElementById("tsAmt").value || "0").replace(/[^\d.]/g, "")) || 0;
      state.amount = amt;
      const r = await chrome.runtime.sendMessage({ type: "ts-start", card: state.card, merchant: location.hostname, amount: amt });
      if (r.error) { state.step = "error"; state.error = r.error; return render(); }
      if (state.card === "everyday") { state.step = "filled"; return render(); }
      state.step = "waiting"; state.appUrl = r.appUrl; render();
      const deadline = Date.now() + 180000;
      while (Date.now() < deadline) {
        await new Promise((res) => setTimeout(res, 1200));
        const s = await chrome.runtime.sendMessage({ type: "ts-poll", id: r.id });
        if (s.status === "approved") { state.step = "filled"; state.cvv = s.cvv; return render(); }
        if (s.status === "declined") { state.step = "declined"; return render(); }
      }
      state.step = "error"; state.error = "No answer from the banking app, so nothing was filled."; render();
    }
    function open() {
      if (!host) {
        host = document.createElement("trial-shield-panel");
        host.style.cssText = "position:fixed;top:12px;right:12px;z-index:2147483647";
        root = host.attachShadow({ mode: "open" });
        document.documentElement.appendChild(host);
        root.addEventListener("click", (e) => { const a = e.target.closest("[data-a]"); if (!a) return; if (a.dataset.a === "close") host.remove(), (host = null); if (a.dataset.a === "fill") onFill(); });
        root.addEventListener("change", (e) => { if (e.target.name === "tsc") { state.card = e.target.value; state.step = "choose"; render(); } });
      }
      if (!state.terms) state.terms = TS_TERMS.read(document.body.innerText);
      if (state.amount == null) state.amount = pageAmount();
      render();
    }
    function filled(msg) { state.frames = (state.frames || 0) + msg.fields; state.cross = state.cross || msg.origin !== location.origin; if (root) { const st = root.getElementById("st"); if (st) st.innerHTML = status(); } }
    return { open, filled };
  })();

  const PANEL_CSS = `
  .p{width:340px;max-height:calc(100vh - 24px);overflow:auto;background:#fff;color:#1b1d21;border:1px solid #cfd3d9;border-radius:12px;box-shadow:0 16px 40px rgba(0,0,0,.25);font:14px/1.4 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
  .h{display:flex;gap:10px;align-items:center;padding:10px 12px;border-bottom:1px solid #e2e4e8}.mk{width:28px;height:28px;border-radius:8px;background:#a6192e;color:#fff;display:grid;place-items:center;font-weight:700}
  .g{flex:1}.s{font-size:11.5px;color:#646b75}.x{border:0;background:none;font-size:20px;cursor:pointer;color:#646b75}
  .b{padding:12px;display:flex;flex-direction:column;gap:9px}.k{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#646b75}
  .c{background:#c0262d;color:#fff;border-radius:10px;padding:11px;font-size:13.5px}.c.medium{background:#a65b06}.c .l{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;margin-bottom:4px}
  .c b{background:rgba(255,255,255,.2);padding:0 3px;border-radius:4px}.c ul{margin:6px 0 0;padding-left:18px;font-size:12.5px}
  .o{display:flex;gap:9px;padding:9px 11px;border:1px solid #e2e4e8;border-radius:10px;cursor:pointer}.o:has(input:checked){border-color:#a6192e;background:#fbeaec}
  .o small{color:#646b75}.sg{font-style:normal;font-size:11px;color:#a6192e;background:#fff;border:1px solid #f0c2c9;border-radius:99px;padding:0 6px}
  .am{display:flex;justify-content:space-between;align-items:center;font-size:13px;color:#646b75}.am input{width:90px;font:13px ui-monospace,Menlo,monospace;padding:5px 7px;border:1px solid #cfd3d9;border-radius:6px;text-align:right}
  .go{font:600 14px system-ui,sans-serif;padding:10px;border:0;border-radius:9px;background:#a6192e;color:#fff;cursor:pointer}.go:disabled{opacity:.6}
  .ok{background:#e6f4ee;color:#0d5c42;border-radius:8px;padding:8px 10px;font-size:13px}.wt{background:#fdf1e2;color:#7a4304;border-radius:8px;padding:8px 10px;font-size:13px}
  .w{color:#c0262d;font-weight:600;font-size:13px}`;

  // Pages that sell a subscription get the panel even before the card form appears.
  setTimeout(() => {
    const t = TS_TERMS.read(document.body ? document.body.innerText : "");
    if (t.risk === "high") panel.open({});
  }, 700);
})();
