const DEFAULT_BANK = "http://127.0.0.1:8790";
(async () => {
  const input = document.getElementById("bank"), st = document.getElementById("st"), app = document.getElementById("app");
  const bank = (await chrome.storage.local.get("bank")).bank || DEFAULT_BANK;
  input.value = bank; app.href = bank + "/app";
  const check = async (url) => {
    try { await (await fetch(url + "/v1/state")).json(); st.textContent = "connected"; st.style.color = "#0d7a55"; }
    catch (e) { st.textContent = "not running: start server.py"; st.style.color = "#c0262d"; }
  };
  check(bank);
  input.addEventListener("change", async () => { const v = input.value.replace(/\/$/, ""); await chrome.storage.local.set({ bank: v }); app.href = v + "/app"; check(v); });
})();
