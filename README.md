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

# 3. (Optional) Generate Start/Stop .app shortcuts on your Desktop
bash install.sh
```

No Python packages to install — the addon only uses libraries bundled with mitmproxy.

---

## How to run

### Option A — terminal (recommended for dev)

```bash
./dev.sh
```

Starts both mitmproxy and the Next.js dashboard together. Press **Ctrl-C** to stop both.

### Option B — background (no terminal)

After running `install.sh`, two app shortcuts appear on your Desktop:

- **🐔 Start ChickenProxy.app** — starts both services in the background
- **🛑 Stop ChickenProxy.app** — stops them

Logs are written to `/tmp/chickenproxy.log`:

```bash
tail -f /tmp/chickenproxy.log
```

### Option C — run each part separately

**Terminal 1:**
```bash
mitmdump -s addon/mitm_dashboard.py -p 8888
```

**Terminal 2:**
```bash
cd web && npm run dev
```

---

## Ports

| Service | Port |
|---------|------|
| Proxy (mitmproxy) | 8888 |
| Addon REST/WS API | 8081 |
| Next.js dashboard | 4444 |

Open the dashboard at **http://localhost:4444**. The connection indicator turns green when live data is flowing.

---

## Connecting clients

Click **📱 Connect** in the dashboard header for platform-specific setup instructions. Quick reference:

| Target | Proxy address | Notes |
|--------|--------------|-------|
| **iOS Simulator** | `127.0.0.1:8888` | Set the macOS system proxy; the simulator shares it. |
| **Android Emulator** | `10.0.2.2:8888` | `10.0.2.2` is the emulator alias for the host loopback. |
| **Physical device** | `<Mac-LAN-IP>:8888` | Same Wi-Fi; set a manual Wi-Fi proxy. |
| **Flutter app** | see below | Override `HttpClient` in `main.dart`. |

Install and trust the mitmproxy CA from <http://mitm.it> on each target to decrypt HTTPS traffic.

### Flutter

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

---

## Mocking responses

- **Right-click** any captured request → **🎭 Mock this response** — creates a rule pre-filled from that flow.
- Open **🎭 Mocks** in the header to add, edit, enable/disable, or delete rules.
- A rule matches on **method** (or ANY) **+ a "URL contains" substring**. The first enabled match wins.
- Matched flows are tagged 🎭 and hit counts update live.
- Rules are saved to `addon/mocks.json` and survive proxy restarts.

---

## REST API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/flows` | GET | Flow summaries, newest first |
| `/api/flows/:id` | GET | Full flow detail — headers + body |
| `/api/flows/clear` | POST | Drop the in-memory buffer |
| `/api/connection` | GET | Host LAN IP, proxy port, emulator hosts |
| `/api/mocks` | GET | All mock rules |
| `/api/mocks` | POST | Create or update a mock rule |
| `/api/mocks/:id` | DELETE | Delete a mock rule |
| `/api/resend/:id` | POST | Replay a captured request |
| `/ws` | WebSocket | Live push of new/updated flows + stats |

---

## Notes

- Flows are kept **in memory only** (ring buffer, default 5000 flows). Restarting mitmproxy clears them.
- The data server binds to `127.0.0.1` — don't expose port 8081 externally as traffic bodies can contain secrets.
