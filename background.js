// Trial Shield service worker: talks to the bank, and relays between the panel (top frame) and the frames that
// hold the card fields, which may belong to a payment provider on another origin.
const DEFAULT_BANK = "http://127.0.0.1:8790";
const bankUrl = async () => (await chrome.storage.local.get("bank")).bank || DEFAULT_BANK;
async function api(path, body) {
  const res = await fetch((await bankUrl()) + path, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {});
  if (!res.ok) throw new Error(`Bank replied ${res.status}`);
  return res.json();
}
const fillAllFrames = (tabId, card) => chrome.tabs.sendMessage(tabId, { type: "ts-do-fill", card });   // no frameId: every frame

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  const tabId = sender.tab && sender.tab.id;
  if (msg.type === "ts-fields") { chrome.tabs.sendMessage(tabId, { type: "ts-show", kinds: msg.kinds }, { frameId: 0 }); return; }
  if (msg.type === "ts-filled") { chrome.tabs.sendMessage(tabId, { type: "ts-filled-report", fields: msg.fields, origin: msg.origin }, { frameId: 0 }); return; }
  (async () => {
    try {
      if (msg.type === "ts-start" && msg.card === "everyday") {
        const c = await api("/v1/cards/everyday");
        await fillAllFrames(tabId, { pan: c.pan, expiry: c.expiry, cvv: c.cvv });
        return reply({ ok: true });
      }
      if (msg.type === "ts-start") {
        const r = await api("/v1/cvv-requests", { card: "protected", merchant: msg.merchant, amount: msg.amount });
        return reply({ id: r.id, appUrl: (await bankUrl()) + "/app" });
      }
      if (msg.type === "ts-poll") {
        const r = await api(`/v1/cvv-requests/${msg.id}`);
        if (r.status === "approved") await fillAllFrames(tabId, { pan: r.pan, expiry: r.expiry, cvv: r.cvv });
        return reply({ status: r.status, cvv: r.cvv });
      }
    } catch (e) {
      reply({ error: `Can't reach the bank at ${await bankUrl()}. Is server.py running? (${e.message})` });
    }
  })();
  return true;
});
