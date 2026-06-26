# ProxyChicken

A live web dashboard for [mitmproxy](https://mitmproxy.org). A mitmproxy **addon**
captures every intercepted flow and serves it over HTTP + WebSocket. A
**Next.js** static app renders it as a real-time dashboard with a request/response log,
traffic charts, full request inspection, response mocking, and breakpoint interception.

```
 client ──► mitmproxy ──► internet
               │
        mitm_dashboard.py  (Tornado server on :8081, REST + WebSocket)
               │
        serve.py  (static file server on :4444)
               │
   ┌───────────────────────────┐
   │     ProxyChicken.app      │  ← native macOS app (Swift)
   │   menu bar icon + controls│
   │   WKWebView window        │  ← wraps the dashboard (no browser needed)
   └───────────────────────────┘
```

## Features

- **Live log** – every request/response streamed over WebSocket as it happens.
- **Inspect** – click any flow for full headers, query params, and body with JSON syntax highlighting.
- **Resend** – replay any captured request, or use **Edit & Resend** to modify it first.
- **Breakpoints** – pause matching requests mid-flight to inspect, edit, resume, or abort them live.
- **Stats & charts** – requests/sec, top hosts with one-click traffic filter.
- **Mock** – right-click any flow → return a canned response; rules are ordered and reorderable.
- **Groups** – organise mock rules into named groups.
- **Diff** – compare two response bodies side-by-side; JSON is auto-formatted before diffing. Set a flow as diff base (auto-pins it), then compare any other flow against it.
- **Pin** – pin flows to the top of the log.
- **Body search** – search across all captured request/response bodies.
- **Connect guide** – step-by-step proxy setup for iOS, Android, physical devices, Flutter, and web browsers.

---

## Prerequisites

| Tool | Purpose | Install |
|------|---------|---------|
| python3 | run serve.py + auto-install mitmproxy | Xcode CLT: `xcode-select --install` |
| mitmproxy | proxy engine | auto-installed into local venv by `install.sh` |
| Xcode CLT | compile menu bar app | `xcode-select --install` |
| Node.js + npm | rebuild dashboard after code changes (optional) | `brew install node` |

> `install.sh` auto-installs mitmproxy into a local `venv/` if not found — no `brew install` needed.
> Node.js is only required if you change frontend code and need to rebuild `web/out/`.

---

## Installation

```bash
git clone https://github.com/your-org/proxychicken.git
cd proxychicken
bash install.sh
```

`install.sh` will:
- Check dependencies (python3, swiftc) and show what's missing
- Auto-install mitmproxy into `venv/` if not found on PATH
- Rebuild the Next.js static export (if npm is available)
- Generate `start.sh`, `stop.sh`, `serve-start.sh`, `serve-stop.sh`, `quit.sh`
- Compile and place **ProxyChicken.app** on your Desktop

---

## How to run

### Menu bar app (recommended)

After `install.sh`, **ProxyChicken.app** is on your Desktop. Double-click it — a menu bar icon appears.

| Action | Result |
|--------|--------|
| **Start ProxyChicken** | starts mitmproxy proxy |
| **Stop ProxyChicken** | stops proxy, dashboard stays accessible |
| **Open Dashboard** | opens native WKWebView window (port 4444 starts automatically) |
| **Copy Proxy Address** | copies `127.0.0.1:8888` to clipboard |
| **Quit** | stops everything and removes the menu bar icon |

Closing the dashboard window (red ✕) stops the static server and hides the window.
Reopening via the menu bar starts it again.

Logs: `tail -f /tmp/chickenproxy.log`

### Terminal (dev mode)

```bash
./dev.sh
```

Starts mitmproxy + Next.js dev server together. Press **Ctrl-C** to stop both.

### Manual

```bash
# Terminal 1 — proxy + addon
mitmdump -s addon/mitm_dashboard.py -p 8888

# Terminal 2 — static file server
python3 serve.py
```

---

## Ports

| Service | Port |
|---------|------|
| Proxy (mitmproxy) | 8888 |
| Addon REST/WS API | 8081 |
| Dashboard (serve.py) | 4444 |

Open the dashboard at **http://localhost:4444**.

---

## Connecting clients

Click **Connect devices** in the dashboard header for step-by-step instructions. Quick reference:

| Target | Proxy address | Notes |
|--------|--------------|-------|
| **iOS Simulator** | `127.0.0.1:8888` | Set the macOS system proxy; simulator shares it. |
| **Android Emulator** | `10.0.2.2:8888` | `10.0.2.2` is the emulator alias for the host. |
| **Physical device** | `<Mac-LAN-IP>:8888` | Same Wi-Fi; set manual proxy on the device. |
| **Flutter** | see Connect guide | Override `HttpClient` in `main.dart`. |
| **Browser** | `127.0.0.1:8888` | System proxy or launch Chrome with `--proxy-server`. |

Install and trust the mitmproxy CA from <http://mitm.it> on each target to decrypt HTTPS.

---

## Mocking responses

- Click the **⋮** button on any flow row (or right-click) → **Mock this response** — prefills a rule from that flow.
- Open **Mocks** in the header to add, edit, enable/disable, reorder, or delete rules.
- A rule matches on **method + URL contains** substring. First enabled match wins.
- Rules persist to `addon/mocks.json` across restarts.

---

## Breakpoints

- Open **Breakpoints** in the header to define intercept rules by method and URL pattern.
- Matching in-flight requests appear marked with a baby chick icon in the flow list.
- From the detail drawer: **Resume**, **Edit & Resume**, or **Abort**.
- Add a breakpoint for any flow via the **⋮** button or the detail drawer.

---

## REST API (addon on :8081)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/flows` | GET | Flow summaries, newest first |
| `/api/flows/:id` | GET | Full flow detail — headers + body |
| `/api/clear` | POST | Drop the in-memory buffer |
| `/api/stats` | GET | Request rate and top hosts |
| `/api/connection` | GET | Host LAN IP, proxy port, emulator hosts |
| `/api/mocks` | GET | All mock rules |
| `/api/mocks` | POST | Create or update a mock rule |
| `/api/mocks/reorder` | POST | Reorder mock rules |
| `/api/mocks/:id` | DELETE | Delete a mock rule |
| `/api/groups` | GET | All mock groups |
| `/api/groups` | POST | Create or update a group |
| `/api/groups/:id` | DELETE | Delete a group |
| `/api/breakpoints` | GET | All breakpoint rules |
| `/api/breakpoints` | POST | Create or update a breakpoint rule |
| `/api/breakpoints/:id` | DELETE | Delete a breakpoint rule |
| `/api/flows/:id/resend` | POST | Replay a captured request |
| `/api/flows/:id/resume` | POST | Resume an intercepted flow |
| `/api/flows/:id/abort` | POST | Abort an intercepted flow |
| `/api/flows/:id/edit-resume` | POST | Modify and resume an intercepted flow |
| `/api/proxy/stop` | POST | Stop the mitmproxy process |
| `/cert` | GET | Download the mitmproxy CA certificate |
| `/ws` | WebSocket | Live push of flows + stats |

---

## Notes

- Flows are kept **in memory only** (ring buffer, default 5000). Restarting mitmproxy clears them.
- The addon binds to `127.0.0.1:8081` — do not expose it externally as bodies can contain secrets.
- Node.js is **not required at runtime** — `web/out/` is a pre-built static export served by `serve.py`.
