# ChickenProxy Dashboard

A live web dashboard for [mitmproxy](https://mitmproxy.org). A mitmproxy **addon**
captures every intercepted flow and serves it over HTTP + WebSocket. A
**Next.js** app renders it as a real-time dashboard with a request/response log,
traffic charts, full request inspection, and response mocking.

```
 client ──► mitmproxy ──► internet
               │
        mitm_dashboard.py  (Tornado server on :8081, REST + WebSocket)
               │
        Next.js app  (http://localhost:4444)
```

## Features

- **Live log** – every request/response streamed over WebSocket as it happens.
- **Inspect** – click any flow for full request/response headers, query params, and (text) bodies.
- **Resend** – replay any captured request directly from the detail drawer.
- **Stats & charts** – requests/sec, top hosts with one-click traffic filter.
- **Mock** – right-click any flow → return a canned response for matching requests; mocked flows are tagged 🎭 in the log.
- **Diff** – compare two response bodies side-by-side with LCS line diffing.
- **Pin** – pin flows to keep them at the top of the log.
- **Body search** – search across all captured request/response bodies.
- **Connect guide** – step-by-step proxy setup for iOS, Android, physical devices, and Flutter.

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| [mitmproxy](https://mitmproxy.org) | ≥ 10 | `brew install mitmproxy` |
| [Node.js](https://nodejs.org) | ≥ 18 | `brew install node` |
| npm | ≥ 9 | bundled with Node |

---

## Installation

```bash
# 1. Clone the repo
git clone https://github.com/your-org/mitmproxy-dashboard.git
cd mitmproxy-dashboard

# 2. Install dashboard dependencies
cd web && npm install && cd ..
```

No Python packages to install — the addon only uses libraries already bundled
with the mitmproxy binary.

---

## How to use

### Option A — one command (recommended)

`dev.sh` starts both the proxy and the Next.js dashboard together:

```bash
./dev.sh
```

| Service | URL |
|---------|-----|
| Proxy | `http://127.0.0.1:8888` |
| Dashboard | `http://localhost:3000` |

Press **Ctrl-C** once to stop both.

Override the proxy port:

```bash
PROXY_PORT=9000 ./dev.sh
```

---

### Option B — run each part separately

**Terminal 1 — start the proxy addon:**

```bash
./start.sh
# or with mitmweb TUI:
PROXY_BIN=mitmweb ./start.sh
```

**Terminal 2 — start the dashboard:**

```bash
cd web
npm run dev
```

Open <http://localhost:3000>. The connection pill (top-right) turns green when
the dashboard is receiving live data.

If the addon runs on a different host or port, override the API base:

```bash
NEXT_PUBLIC_DASHBOARD_API=http://192.168.1.10:8081 npm run dev
```

---

## Connecting clients

Click **📱 Connect devices** in the dashboard header for auto-filled instructions
per platform. Quick reference:

| Target | Proxy address | Notes |
|--------|--------------|-------|
| **iOS Simulator** | `127.0.0.1:8888` | Set the macOS system proxy; the simulator shares it. |
| **Android Emulator** | `10.0.2.2:8888` | `10.0.2.2` is the emulator alias for the host loopback. |
| **Genymotion** | `10.0.3.2:8888` | Different host alias. |
| **Physical device** | `<Mac-LAN-IP>:8888` | Same Wi-Fi; set a manual Wi-Fi proxy. |
| **Flutter app** | see below | Override `HttpClient` in `main.dart`. |

Install and trust the mitmproxy CA from <http://mitm.it> on each target to
decrypt HTTPS traffic.

### Flutter

Add the override in `main.dart` (debug builds only):

```dart
import 'dart:io';
import 'package:flutter/foundation.dart';

class MitmHttpOverrides extends HttpOverrides {
  @override
  HttpClient createHttpClient(SecurityContext? context) {
    return super.createHttpClient(context)
      ..findProxy = (uri) => 'PROXY 10.0.2.2:8888'   // Android emulator
      ..badCertificateCallback =
          (X509Certificate cert, String host, int port) => true;
  }
}

void main() {
  if (kDebugMode) HttpOverrides.global = MitmHttpOverrides();
  runApp(const MyApp());
}
```

For **Dio** or the **http** package, see the in-app Flutter tab (📱 Connect devices → Flutter).

---

## Mocking responses

Intercept matching requests and return a canned response instead of hitting the
real server — useful for forcing error states, fixed payloads, or offline dev.

- **Right-click** any captured request → **🎭 Mock this response** — creates a
  rule pre-filled from that flow (method, URL, status, content-type, body).
- Open **🎭 Mocks** in the header to add, edit, enable, disable, or delete rules.
- A rule matches on **method** (or ANY) **+ a "URL contains" substring**.
  The first *enabled* match wins. Matched flows are tagged 🎭 and hit counts
  update live.
- **Export** all rules to a `.json` file; **Import** from a file to restore or
  share a set of mocks across machines.
- Rules are saved to `addon/mocks.json` and survive proxy restarts.

---

## Addon options

Pass these with `--set` to `mitmdump`/`mitmweb`:

| Option | Default | Description |
|--------|---------|-------------|
| `dashboard_port` | `8081` | Port the data API listens on |
| `dashboard_max_flows` | `5000` | In-memory ring buffer size |
| `dashboard_body_limit` | `65536` | Max bytes captured per request/response body |

Example:

```bash
mitmdump -s addon/mitm_dashboard.py -p 8888 \
  --set dashboard_port=8081 \
  --set dashboard_max_flows=5000 \
  --set dashboard_body_limit=65536
```

---

## REST API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/flows` | GET | Flow summaries, newest first |
| `/api/flows/:id` | GET | Full flow detail — headers + body |
| `/api/stats` | GET | Aggregated statistics |
| `/api/clear` | GET | Drop the in-memory buffer |
| `/api/connection` | GET | Host LAN IP, proxy port, emulator hosts |
| `/api/mocks` | GET | All mock rules |
| `/api/mocks` | POST | Create or update a mock rule |
| `/api/mocks/:id` | DELETE | Delete a mock rule |
| `/ws` | WebSocket | Live push of new/updated flows + stats |

---

## Notes

- Flows are kept **in memory only** (a ring buffer of `dashboard_max_flows`).
  Restarting mitmproxy clears them.
- The data server binds to `127.0.0.1` — don't expose port 8081 externally as
  traffic bodies can contain secrets.
