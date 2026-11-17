"""Runs the proof locally. Python 3.9+, no packages needed.

    python3 server.py          everything on this computer
    python3 server.py --lan    also lets your phone open the banking app on the same Wi-Fi

  :8790  the bank: issuer API, and the banking app page (/app) where the cardholder approves
  :8801  Lumière Derma, a made-up skincare shop: plain checkout form with standard autocomplete attributes
  :8802  StreamMax, a made-up streaming service: card fields inside a cross-origin iframe, like Stripe or Shopify
  :8803  the hosted card fields that StreamMax embeds
Each shop also has a back office (/office) that sends the later charges, in the same labelled format Westpac's
payment gateway uses, so you can watch the bank decide.
"""
import json
import socket
import sys
import threading
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

from issuer import Card, Issuer

BANK, LUMIERE, STREAM, FIELDS = 8790, 8801, 8802, 8803
LOCK = threading.Lock()
PROT = {"pan": "4564738002127731", "expiry": "11/29"}
MAIN = {"pan": "4564738005904821", "expiry": "08/29", "cvv": "731"}


def new_bank():
    iss = Issuer()
    iss.add_card(Card("protected", PROT["pan"], PROT["expiry"], True))
    iss.add_card(Card("everyday", MAIN["pan"], MAIN["expiry"], False, static_cvv=MAIN["cvv"]))
    return iss


ISSUER = new_bank()
MERCHANTS = {
    LUMIERE: {"name": "Lumière Derma", "today": 1.00, "renewal": 89.95, "addon": ("Glow Rewards", 24.95), "extra": 34.95},
    STREAM: {"name": "StreamMax", "today": 0.00, "renewal": 24.99, "addon": ("StreamMax Sports pack", 9.99), "extra": 6.99},
}
STORED = {LUMIERE: None, STREAM: None}   # card on file per shop: number and expiry only. PCI DSS forbids keeping the CVV.


def mask(pan):
    return "•••• " + pan[-4:]


def bank_state():
    with LOCK:
        return {
            "cvvRequests": [{k: v for k, v in r.items() if k not in ("pan",)} for r in ISSUER.cvv_requests[-8:]][::-1],
            "approvals": ISSUER.approvals[-12:][::-1],
            "log": ISSUER.log[-40:][::-1],
            "stopped": sorted(m for c in ISSUER.cards.values() for m in c.stopped),
            "locked": any(c.otc and c.otc.locked for c in ISSUER.cards.values()),
        }


def call_bank(req):
    data = json.dumps(req).encode()
    r = urllib.request.Request(f"http://127.0.0.1:{BANK}/v1/authorise", data=data, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(r, timeout=10) as resp:
        return json.loads(resp.read())


def auth_request(port, amount, card, contract=None, model=None, merchant=None):
    return {"merchant": merchant or MERCHANTS[port]["name"], "amount": round(amount, 2), "currency": "AUD", "card": card,
            "shopperInteraction": "ECOMMERCE", "storedCredentialContract": contract, "storedCredentialProcessingModel": model}


class Handler(BaseHTTPRequestHandler):
    server_version = "TrialShieldProof/1.0"

    def log_message(self, *a):
        pass

    def _send(self, code, body, ctype="application/json"):
        raw = (json.dumps(body) if ctype == "application/json" else body).encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype + ("; charset=utf-8" if "text" in ctype or "json" in ctype else ""))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def _json(self):
        n = int(self.headers.get("Content-Length") or 0)
        return json.loads(self.rfile.read(n) or b"{}")

    def do_OPTIONS(self):
        self._send(204, "", "text/plain")

    @property
    def port(self):
        return self.server.server_address[1]

    def do_GET(self):
        path = urlparse(self.path).path
        p = self.port
        if p == BANK:
            if path in ("/", "/app"):
                return self._send(200, BANK_APP, "text/html")
            if path == "/v1/state":
                return self._send(200, bank_state())
            if path == "/v1/cards/everyday":   # the Digital Card details the app already shows today
                return self._send(200, MAIN)
            if path.startswith("/v1/cvv-requests/"):
                rid = int(path.rsplit("/", 1)[1])
                with LOCK:
                    r = next((x for x in ISSUER.cvv_requests if x["id"] == rid), None)
                return self._send(200 if r else 404, r or {"error": "not found"})
        elif p in (LUMIERE, STREAM):
            if path == "/":
                return self._send(200, LUMIERE_PAGE if p == LUMIERE else STREAM_PAGE, "text/html")
            if path == "/office":
                return self._send(200, office_page(p), "text/html")
            if path == "/api/stored":
                s = STORED[p]
                return self._send(200, {"stored": bool(s), "card": mask(s["number"]) if s else None, "expiry": s["expiry"] if s else None})
        elif p == FIELDS and path == "/fields":
            return self._send(200, FIELDS_PAGE, "text/html")
        self._send(404, {"error": "not found"})

    def do_POST(self):
        path = urlparse(self.path).path
        p = self.port
        body = self._json()
        if p == BANK:
            with LOCK:
                if path == "/v1/authorise":
                    return self._send(200, ISSUER.authorise(body))
                if path == "/v1/cvv-requests":
                    return self._send(200, ISSUER.request_cvv("protected", body.get("merchant", "a website"), float(body.get("amount") or 0)))
                if path.startswith("/v1/cvv-requests/") and path.endswith("/answer"):
                    return self._send(200, ISSUER.answer_cvv_request(int(path.split("/")[3]), bool(body.get("approve"))))
                if path.startswith("/v1/approvals/") and path.endswith("/answer"):
                    return self._send(200, ISSUER.answer_approval(int(path.split("/")[3]), bool(body.get("approve")), bool(body.get("stop"))))
                if path == "/v1/reset":
                    globals()["ISSUER"] = new_bank()
                    STORED.update({LUMIERE: None, STREAM: None})
                    return self._send(200, {"ok": True})
        elif p in (LUMIERE, STREAM):
            m = MERCHANTS[p]
            if path == "/api/pay":   # checkout: customer present, CVV typed, subscription sign-up
                card = {"number": str(body.get("number", "")).replace(" ", ""), "expiry": body.get("expiry", "").replace(" ", ""), "cvv": body.get("cvv", "")}
                req = auth_request(p, m["today"], card, None, "RECURRING")
                resp = call_bank(req)
                if resp["decision"] == "APPROVED":
                    STORED[p] = {"number": card["number"], "expiry": card["expiry"]}   # the CVV is dropped here
                return self._send(200, {"request": masked(req), "response": resp})
            if path == "/api/charge":   # back office: everything a merchant can do later
                kind = body.get("kind")
                s = STORED[p]
                if kind == "replay":
                    skim = body.get("skimmed") or {}
                    req = auth_request(p, 249.00, {"number": skim.get("number", ""), "expiry": skim.get("expiry", ""), "cvv": skim.get("cvv", "")}, merchant="QuickBuy Online")
                elif not s:
                    return self._send(400, {"error": "No card on file yet. Pay at the checkout first."})
                else:
                    card = {"number": s["number"], "expiry": s["expiry"]}
                    req = {
                        "renewal": lambda: auth_request(p, m["renewal"], card, "MERCHANT_INITIATED", "RECURRING"),
                        "addon": lambda: auth_request(p, m["addon"][1], card, "MERCHANT_INITIATED", "RECURRING"),
                        "rise": lambda: auth_request(p, m["renewal"] + 10, card, "MERCHANT_INITIATED", "RECURRING"),
                        "oneclick": lambda: auth_request(p, m["extra"], card, "ONE_CLICK", "CREDENTIAL_ON_FILE"),
                        "mislabel": lambda: auth_request(p, m["renewal"], card),
                    }[kind]()
                return self._send(200, {"request": masked(req), "response": call_bank(req)})
        self._send(404, {"error": "not found"})


def masked(req):
    r = json.loads(json.dumps(req))
    c = r["card"]
    c["number"] = mask(c.get("number") or "0000")
    if c.get("cvv"):
        c["cvv"] = "•••"
    else:
        c.pop("cvv", None)
    return r


# ---------------------------------------------------------------- pages
BANK_APP = r"""<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Banking app (proof)</title><style>
body{margin:0;font:15px system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f3f4f6;color:#1b1d21}
.wrap{max-width:420px;margin:0 auto;padding:16px}
h1{font-size:18px;margin:4px 0 2px}.sub{color:#646b75;font-size:13px;margin-bottom:12px}
.card{background:#fff;border:1px solid #e2e4e8;border-radius:14px;padding:14px;margin-bottom:10px}
.hi{border:2px solid #a6192e}.k{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#a6192e;margin-bottom:4px}
.amt{color:#c0262d;font-weight:700}.btns{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}
button{font:inherit;border-radius:10px;border:1px solid #d6d9de;background:#fff;padding:8px 12px;cursor:pointer}
button.p{background:#a6192e;color:#fff;border-color:#a6192e}button.l{border:0;background:none;color:#c0262d;text-decoration:underline;margin-left:auto}
.cvv{display:flex;gap:6px;margin-top:8px}.cvv span{width:40px;height:48px;border-radius:9px;background:#1b1d21;color:#fff;display:grid;place-items:center;font:700 24px ui-monospace,Menlo,monospace}
.log{font-size:12.5px}.log div{padding:6px 0;border-top:1px solid #eceef1}.log b{font-size:10.5px;color:#646b75;letter-spacing:.04em}
.muted{color:#646b75;font-size:13px}
</style></head><body><div class="wrap">
<h1>Banking app</h1><div class="sub">Protected card •••• 7731 · proof build. Approvals here stand in for the bank's push notification.</div>
<div id="items"></div><div class="card"><div class="k" style="color:#646b75">What the bank did</div><div class="log" id="log"></div></div>
<button onclick="reset()" style="font-size:13px">Reset the proof</button></div>
<script>
const $=s=>document.querySelector(s), esc=v=>String(v??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const money=n=>"$"+Number(n).toFixed(2);
async function post(u,b){return (await fetch(u,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(b||{})})).json()}
async function cvv(id,yes){await post(`/v1/cvv-requests/${id}/answer`,{approve:yes});load()}
async function appr(id,yes,stop){await post(`/v1/approvals/${id}/answer`,{approve:yes,stop});load()}
async function reset(){await post("/v1/reset");load()}
function left(t){const s=Math.max(0,Math.round(t-Date.now()/1000));return s?`${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`:"expired"}
async function load(){
  const s=await (await fetch("/v1/state")).json(); const out=[];
  s.cvvRequests.filter(r=>r.status==="pending").forEach(r=>out.push(`<div class="card hi"><div class="k">One-time CVV request</div>
    <div><b>${esc(r.merchant)}</b> checkout wants a CVV for up to <span class="amt">${money(r.amount)}</span>.</div>
    <div class="btns"><button class="p" onclick="cvv(${r.id},true)">Approve with Face ID</button><button onclick="cvv(${r.id},false)">Decline</button></div></div>`));
  s.cvvRequests.filter(r=>r.status==="approved"&&r.expires_at>Date.now()/1000).slice(0,1).forEach(r=>out.push(`<div class="card"><div class="k">Your one-time CVV</div>
    <div class="muted">For ${esc(r.merchant)}, up to ${money(r.amount)}, once. Expires in <span data-t="${r.expires_at}">${left(r.expires_at)}</span>.</div>
    <div class="cvv">${r.cvv.split("").map(d=>`<span>${d}</span>`).join("")}</div></div>`));
  s.approvals.filter(a=>a.status==="pending").forEach(a=>out.push(`<div class="card hi"><div class="k">Approve this charge?</div>
    <div><b>${esc(a.merchant)}</b> wants <span class="amt">${money(a.amount)}</span></div><div class="muted">${esc(a.label)}. No CVV was sent. Approving pays this one charge only; the next one asks again.${a.attempts>1?` Declined ${a.attempts} times so far.`:""}</div>
    <div class="btns"><button class="p" onclick="appr(${a.id},true)">Approve</button><button onclick="appr(${a.id},false)">Decline</button><button class="l" onclick="appr(${a.id},false,true)">Stop ${esc(a.merchant)}</button></div></div>`));
  if(!out.length) out.push(`<div class="card muted">Nothing waiting for you.</div>`);
  if(s.locked) out.unshift(`<div class="card hi"><div class="k">Card locked</div><div class="muted">Three wrong CVVs in a row. Online payments on the Protected card are locked.</div></div>`);
  $("#items").innerHTML=out.join("");
  $("#log").innerHTML=s.log.map(l=>`<div><b>${esc(l.kind)}</b><br>${esc(l.text)}</div>`).join("")||'<div class="muted">Nothing yet.</div>';
}
setInterval(()=>{document.querySelectorAll("[data-t]").forEach(e=>e.textContent=left(+e.dataset.t))},1000);
setInterval(load,1500);load();
</script></body></html>"""

SHOP_CSS = """body{margin:0;font:15px Georgia,'Times New Roman',serif;background:#fbf7f2;color:#3b2f2a}
header{display:flex;justify-content:space-between;align-items:baseline;padding:18px 28px;border-bottom:1px solid #eadfd3}
.logo{letter-spacing:.28em;font-size:19px}.tiny{font:12px system-ui,sans-serif;color:#8a7a6f}
main{display:grid;grid-template-columns:220px minmax(0,380px);gap:32px;padding:28px;max-width:760px}
.ph{height:190px;border-radius:14px;background:radial-gradient(circle at 50% 30%,#f6e3cf,#e3c2a2 60%,#caa07e)}
form{display:flex;flex-direction:column;gap:10px;font:14px system-ui,sans-serif}label{display:flex;flex-direction:column;gap:3px;color:#5c4d44}
input,select{font:14px ui-monospace,Menlo,monospace;padding:9px 10px;border:1px solid #d8cbbf;border-radius:8px;background:#fff}
.row{display:flex;gap:10px}.row label{flex:1}button{font:600 15px system-ui,sans-serif;padding:11px;border-radius:999px;border:0;background:#2a211d;color:#fff;cursor:pointer}
.fine{font:11px/1.45 system-ui,sans-serif;color:#9b8b80}.res{font:13px system-ui,sans-serif;border-radius:8px;padding:10px;white-space:pre-wrap}
.ok{background:#e6f4ee;color:#0d5c42}.bad{background:#fcebea;color:#9b1c22}a{color:#7a3b2e}"""

LUMIERE_PAGE = """<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><title>Lumière Derma · Checkout</title><style>""" + SHOP_CSS + """</style></head><body>
<header><span class="logo">LUMIÈRE DERMA</span><span class="tiny">A made-up shop for the Trial Shield proof · <a href="/office">back office</a></span></header>
<main><div><div class="ph"></div><h2 style="font-weight:400;margin:14px 0 4px">Retinol Glow Kit</h2><div style="color:#7a3b2e">Just $1 shipping today</div></div>
<form id="f" autocomplete="on" onsubmit="return pay(event)">
<label>Email<input type="email" autocomplete="email" value="alex@example.com"></label>
<label>Card number<input id="cc" name="cardnumber" autocomplete="cc-number" inputmode="numeric" placeholder="1234 5678 9012 3456"></label>
<div class="row"><label>Expiry<input id="exp" name="exp-date" autocomplete="cc-exp" placeholder="MM/YY"></label><label>CVV<input id="cvc" name="cvc" autocomplete="cc-csc" inputmode="numeric" maxlength="4" placeholder="123"></label></div>
<button>Pay $1.00</button><div id="r"></div>
<p class="fine">*By completing this order you are enrolled in the Lumière VIP Beauty Club. If you do not cancel within 10 days of your order date, you will be charged $89.95 and receive a full-size kit every 30 days thereafter. You will also receive a complimentary 14 day trial of our Glow Rewards membership which renews at $24.95 per month. To cancel, call our customer care line Monday to Friday 9am to 3pm EST. Charges will appear as LDBEAUTY*CLUB.</p>
</form></main>
<script>
async function pay(e){e.preventDefault();
  const d={number:cc.value,expiry:exp.value,cvv:cvc.value};
  localStorage.setItem("skimmed",JSON.stringify(d)); // simulates a card skimmer on a compromised checkout, for the attack test
  const res=await (await fetch("/api/pay",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(d)})).json();
  const ok=res.response.decision==="APPROVED"; r.className="res "+(ok?"ok":"bad");
  r.textContent=ok?"Order confirmed. Your kit ships today.":"Payment declined by your bank: "+res.response.reason+" ("+res.response.responseCode+")";
  return false}
</script></body></html>"""

STREAM_PAGE = """<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><title>StreamMax · Start your free trial</title><style>""" + SHOP_CSS + """
body{background:#0f1220;color:#e8eaf6;font-family:system-ui,sans-serif}header{border-color:#2a2f4a}.logo{letter-spacing:.05em;font-weight:800}.tiny{color:#9aa0c3}a{color:#9fb4ff}
iframe{width:100%;height:150px;border:0;border-radius:10px;background:#fff}button{background:#5b7cfa}.fine{color:#7f86ad}</style></head><body>
<header><span class="logo">StreamMax</span><span class="tiny">A made-up service for the Trial Shield proof · <a href="/office">back office</a></span></header>
<main style="grid-template-columns:minmax(0,420px)"><div>
<h2 style="margin:0 0 6px">7 days free, then $24.99/month</h2><div class="tiny" style="margin-bottom:14px">$0.00 today. Card fields below are hosted by our payment provider in a separate frame.</div>
<iframe id="hf" src="http://localhost:8803/fields" title="Secure card fields"></iframe>
<button style="width:100%;margin-top:12px" onclick="start()">Start free trial</button><div id="r" style="margin-top:10px"></div>
<p class="fine">Your free trial converts to StreamMax Premium at $24.99 per month after 7 days unless you cancel. Includes a 14 day free trial of the StreamMax Sports pack, which renews at $9.99/month. Cancel anytime in Account settings.</p></div></main>
<script>
function start(){document.getElementById("hf").contentWindow.postMessage({type:"collect"},"http://localhost:8803")}
window.addEventListener("message",async e=>{if(e.origin!=="http://localhost:8803"||e.data.type!=="card")return;
  const res=await (await fetch("/api/pay",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(e.data.card)})).json();
  const ok=res.response.decision==="APPROVED"; r.className="res "+(ok?"ok":"bad");
  r.textContent=ok?"Your free trial has started.":"Declined by your bank: "+res.response.reason+" ("+res.response.responseCode+")"});
</script></body></html>"""

FIELDS_PAGE = """<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;padding:12px;font:14px system-ui,sans-serif;color:#222}input{width:100%;box-sizing:border-box;font:14px ui-monospace,Menlo,monospace;padding:9px;border:1px solid #ccd;border-radius:7px;margin-bottom:8px}
.row{display:flex;gap:8px}.row input{flex:1}</style></head><body>
<input name="number" placeholder="Card number" inputmode="numeric" aria-label="Card number">
<div class="row"><input name="expiry" placeholder="MM / YY" aria-label="Expiration date"><input name="verification_value" placeholder="Security code" aria-label="Security code"></div>
<script>
window.addEventListener("message",e=>{if(e.data.type!=="collect")return;const v=n=>document.querySelector(`[name=${n}]`).value;
  e.source.postMessage({type:"card",card:{number:v("number"),expiry:v("expiry"),cvv:v("verification_value")}},e.origin)});
</script></body></html>"""


def office_page(port):
    m = MERCHANTS[port]
    acts = [("renewal", f"Charge the subscription: ${m['renewal']:.2f}", "MERCHANT_INITIATED · RECURRING, no CVV"),
            ("addon", f"Charge the add-on, {m['addon'][0]}: ${m['addon'][1]:.2f}", "MERCHANT_INITIATED · RECURRING, no CVV"),
            ("rise", f"Raise the price: ${m['renewal'] + 10:.2f}", "MERCHANT_INITIATED · RECURRING, no CVV"),
            ("oneclick", f"One-click order on the saved card: ${m['extra']:.2f}", "ONE_CLICK · CREDENTIAL_ON_FILE, no CVV"),
            ("mislabel", f"Dishonest: send the renewal with no labels: ${m['renewal']:.2f}", "no labels, no CVV"),
            ("replay", "Attacker: reuse the card details copied at checkout, at QuickBuy Online: $249.00", "card number, expiry and the CVV typed at checkout")]
    buttons = "".join(f'<div class="act"><button onclick="go(\'{k}\')">{t}</button><div class="tiny">{d}</div></div>' for k, t, d in acts)
    return f"""<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><title>{m['name']} · back office</title><style>
body{{margin:0;font:14px system-ui,sans-serif;background:#f6f7f9;color:#1b1d21}}.w{{max-width:860px;margin:0 auto;padding:22px}}
h1{{font-size:20px;margin:0 0 4px}}.tiny{{font-size:12px;color:#646b75}}.box{{background:#fff;border:1px solid #e2e4e8;border-radius:12px;padding:14px;margin:12px 0}}
.act{{margin:8px 0}}button{{font:inherit;padding:8px 12px;border-radius:8px;border:1px solid #cfd3d9;background:#fff;cursor:pointer;text-align:left}}
pre{{background:#1b1d21;color:#e6e6e6;border-radius:10px;padding:12px;overflow:auto;font-size:12px;margin:6px 0}}.ok{{color:#0d7a55;font-weight:700}}.bad{{color:#c0262d;font-weight:700}}</style></head>
<body><div class="w"><h1>{m['name']} back office</h1><div class="tiny">What a merchant can do after the sign-up. Each button sends an authorisation request to the bank, labelled the way Westpac's payment gateway labels it.</div>
<div class="box"><b>Card on file</b> <span id="cof" class="tiny">checking</span><div class="tiny">The CVV is not stored: PCI DSS requirement 3.3.1.2 forbids keeping it after authorisation, so every later charge arrives without one.</div></div>
<div class="box">{buttons}</div><div id="out"></div></div>
<script>
fetch("/api/stored").then(r=>r.json()).then(s=>cof.textContent=s.stored?`${{s.card}}, expires ${{s.expiry}}, CVV not kept`:"none yet: pay at the checkout first");
async function go(kind){{const body={{kind}};if(kind==="replay")body.skimmed=JSON.parse(localStorage.getItem("skimmed")||"{{}}");
  const r=await (await fetch("/api/charge",{{method:"POST",headers:{{"Content-Type":"application/json"}},body:JSON.stringify(body)}})).json();
  const el=document.createElement("div");el.className="box";
  el.innerHTML=r.error?`<span class="bad">${{r.error}}</span>`:`<div class="${{r.response.decision==="APPROVED"?"ok":"bad"}}">${{r.response.decision}} ${{r.response.responseCode}}: ${{r.response.reason}}</div><div class="tiny">Sent to the bank:</div><pre>${{JSON.stringify(r.request,null,2)}}</pre><div class="tiny">Bank replied:</div><pre>${{JSON.stringify(r.response,null,2)}}</pre>`;
  out.prepend(el)}}
</script></body></html>"""


def lan_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("10.255.255.255", 1))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except OSError:
        return None


def main():
    lan = "--lan" in sys.argv
    host = "0.0.0.0" if lan else "127.0.0.1"
    servers = []
    for port in (BANK, LUMIERE, STREAM, FIELDS):
        srv = ThreadingHTTPServer((host if port == BANK else "127.0.0.1", port), Handler)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        servers.append(srv)
    print("Trial Shield proof is running.\n")
    print(f"  Banking app (approve here):   http://127.0.0.1:{BANK}/app")
    if lan and lan_ip():
        print(f"  ...or on your phone:          http://{lan_ip()}:{BANK}/app   (same Wi-Fi)")
    print(f"  Shop with a plain checkout:   http://localhost:{LUMIERE}/")
    print(f"  Shop with hosted card fields: http://localhost:{STREAM}/")
    print(f"  Back offices:                 http://localhost:{LUMIERE}/office  and  http://localhost:{STREAM}/office")
    print("\nCtrl+C to stop.")
    try:
        threading.Event().wait()
    except KeyboardInterrupt:
        for s in servers:
            s.shutdown()


if __name__ == "__main__":
    main()
