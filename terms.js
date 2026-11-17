// Trial Shield fine print reader (rules). Runs on the page, so the page text never leaves the browser.
// Finds what you pay today, every recurring amount and when it starts, and the clauses that make it a trap.
var TS_TERMS = (function () {
  "use strict";
  const money = (n) => "$" + Number(n).toFixed(2);
  const CYCLE = [
    [/(?:\/|per|a|each|every)\s*(?:calendar\s*)?(?:month|mo|mth)\b|monthly|every 30 days|p\/m/i, "month"],
    [/(?:\/|per|a|each|every)\s*(?:week|wk)\b|weekly/i, "week"],
    [/(?:\/|per|a|each|every)\s*fortnight|fortnightly/i, "fortnight"],
    [/(?:\/|per|a|each|every)\s*(?:year|yr|annum)\b|annually|yearly/i, "year"],
  ];
  const RECURRING = /renew|thereafter|recurring|subscription|membership|billed|auto(?:matically)?[- ]?(?:renew|charge|bill)|until you cancel|unless you cancel|converts?/i;

  function read(raw) {
    const text = String(raw || "").replace(/\s+/g, " ").slice(0, 30000);
    const low = text.toLowerCase();
    const amounts = [];
    const re = /\$\s?(\d{1,4}(?:,\d{3})*(?:\.\d{2})?)/g;
    let m;
    while ((m = re.exec(text))) {
      const v = Number(m[1].replace(/,/g, ""));
      const before = text.slice(Math.max(0, m.index - 140), m.index);
      const after = text.slice(m.index, m.index + 70);
      const near = (before.slice(-60) + " " + after);
      const cyc = (CYCLE.find(([r]) => r.test(after.slice(0, 40)) || r.test(after)) || [])[1] || null;
      amounts.push({ v, before, after, near, cycle: cyc, recurring: !!cyc || RECURRING.test(near) });
    }
    const trialM = low.match(/(\d{1,3})[\s-]*days?\s*(?:free|trial|pass)|free for (\d{1,3}) days|within (\d{1,3}) days|(\d{1,3})[\s-]*day (?:free )?trial|after (\d{1,3}) days/);
    const days = trialM ? Number(trialM.slice(1).find(Boolean)) : (/one month free|1 month free|first month free/.test(low) ? 30 : null);
    const upfrontA = amounts.find((a) => !a.recurring && /today|now|just|only|shipping|intro|first|pay \$/i.test(a.before.slice(-40) + a.after.slice(0, 30)));
    const freeToday = /\$0(?:\.00)? today|free today|free trial|days free|free for/i.test(text);
    const upfront = upfrontA ? upfrontA.v : freeToday ? 0 : null;
    const seen = new Set();
    const costs = amounts.filter((a) => a.recurring && a.v > 0 && a !== upfrontA && !seen.has(a.v) && seen.add(a.v)).map((a) => {
      const own = a.before.match(/(\d{1,3})[\s-]*day (?:free )?trial/i);
      const named = (a.before.match(/([A-Z][\w']+(?: [A-Z][\w']+)*) (?:membership|club|plan|rewards|pack|premium)/g) || []).pop();
      const thing = (a.after.match(/full[- ]size kit|kit|box|bottle|delivery/i) || [])[0];
      return { what: named || (thing ? "the " + thing.toLowerCase() : "the subscription"), amount: a.v, cycle: a.cycle || "month",
        starts: own ? Number(own[1]) : days };
    }).slice(0, 4);
    const monthly = costs.reduce((s, c) => s + c.amount * ({ week: 52 / 12, fortnight: 26 / 12, month: 1, year: 1 / 12 }[c.cycle] || 1), 0);
    const flags = [];
    const add = (t) => flags.push(t);
    if (/enrol|enroll|signed up|automatically|unless you cancel|converts?/.test(low) && costs.length) add("It turns into a subscription unless you cancel");
    if (costs.length > 1) add("An extra membership is added on top");
    const phoneOnly = /cancel[^.]{0,80}\b(call|phone)\b|\b(call|phone)\b[^.]{0,80}cancel/.test(low) && !/cancel[^.]{0,40}(online|account settings|in the app)/.test(low);
    if (phoneOnly) add("Cancelling needs a phone call");
    const billing = ((text.match(/(?:appear|show)s? (?:on your statement )?as ([A-Z0-9*.\-]{4,30})/) || [])[1] || "").replace(/[.\-]+$/, "") || null;
    if (billing) add(`Charges show under a different name: ${billing}`);
    if (days && days <= 10 && costs.length) add(`Only ${days} days to cancel`);
    if (/12[\s-]month|annual contract|minimum term/.test(low)) add("Locks you into a contract");
    const tiny = upfront != null && costs.length && costs[0].amount >= Math.max(upfront, 1) * 10;
    const risk = costs.length === 0 ? "none" : (tiny || costs.length > 1 || phoneOnly || billing) && flags.length >= 2 ? "high" : "medium";
    let catchLine = "";
    if (costs.length) {
      const lead = upfront ? `You pay ${money(upfront)} today but are signed up to ${costs.length > 1 ? "a subscription plus an extra membership" : "a subscription"}.`
        : `${days ? `Free for ${days} days, then` : "This becomes"} ${money(costs[0].amount)} a ${costs[0].cycle} unless you cancel.`;
      const parts = costs.map((c, i) => `${i ? "plus " : ""}${money(c.amount)} a ${c.cycle} for ${c.what}${c.starts && (i === 0 || c.starts !== costs[0].starts) ? ` from day ${c.starts}` : ""}`);
      catchLine = lead + ` You'll be charged ${parts.join(", ")}${costs.length > 1 ? `: about ${money(monthly)} a month` : ""}.`;
    }
    return { risk, catch: catchLine, costs, monthly, upfront, days, flags, billing };
  }
  return { read, money };
})();
