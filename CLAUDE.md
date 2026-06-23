# ChickenProxy Dashboard — Claude Context

## What this is
A mitmproxy-based HTTP inspector dashboard for dev use.
- **Python addon** (`addon/mitm_dashboard.py`) — runs inside mitmproxy, exposes REST API + WebSocket on `:8081`
- **Next.js frontend** (`web/`) — connects to the addon, shows live traffic, mock rules, stats

## How to run
```bash
# Dev (with terminal)
./dev.sh

# No terminal (after install.sh)
# Double-click 🐔 Start ChickenProxy.app on Desktop
# Double-click 🛑 Stop ChickenProxy.app to stop
```

First time setup for a new machine:
```bash
cd web && npm install
bash install.sh   # generates Start/Stop .app on Desktop
```

## Ports
| Service | Port |
|---------|------|
| Proxy (mitmproxy) | 8888 |
| Addon REST/WS API | 8081 |
| Next.js dashboard | 4444 |

Dashboard URL: `http://localhost:4444`

## Project structure
```
addon/
  mitm_dashboard.py   # mitmproxy addon — REST API + WebSocket
  mocks.json          # persisted mock rules

web/
  app/
    page.tsx          # main page, all top-level state
    globals.css       # ALL styling — no Tailwind, pure CSS custom props
    layout.tsx
  components/
    FlowTable.tsx     # live flow list, pin support
    FlowDetail.tsx    # request/response drawer, resend, mock button
    Charts.tsx        # requests/sec + top hosts (click to filter)
    MockModal.tsx     # mock rules list (search, toggle switch) + editor
    ConnectModal.tsx  # iOS/Android/Physical/Flutter setup guide
    DiffModal.tsx     # LCS line diff between two responses
    ContextMenu.tsx   # right-click menu on flow rows
    StatsBar.tsx      # top stats bar
  lib/
    types.ts          # FlowSummary, FlowDetail, MockRule, Connection, Stats
    api.ts            # fetch helpers → addon REST API
    useDashboard.ts   # WebSocket hook, flow state, mock state
    format.ts         # statusClass, formatSize, etc.
    mockDraft.ts      # draftFromDetail, draftFromSummary, toCurl

dev.sh              # start both services (terminal)
start.sh            # start both services (background, no terminal)
stop.sh             # stop background services
install.sh          # generate Start/Stop .app for current machine
```

## Tech stack
- Next.js 14, React 19, TypeScript — `"use client"` throughout
- No Tailwind — pure CSS in `globals.css` with CSS custom properties
- Dark theme variables: `--bg --bg-2 --panel --panel-2 --border --text --muted --faint --accent --green --amber --red --purple --mono`
- `color-mix(in srgb, ...)` for tinted backgrounds
- WebSocket on `ws://localhost:8081/ws` for live flow streaming

## Key patterns
- All state lives in `page.tsx` — lifted up
- Filter type: `"all" | "2xx" | "errors" | "mocked" | "http"`
- Pinned flows: `Set<string>` sorted to top of FlowTable
- Body search: lazy fetch per flow, cached in `bodyCache: Record<string,string>`
- Diff: pure LCS implementation in DiffModal (no external lib)
- Mock draft prefill: right-click flow → `draftFromDetail()` or `draftFromSummary()`

## Design conventions
- No comments unless the WHY is non-obvious
- No Tailwind, no external UI libs
- Always run `npx tsc --noEmit` before finishing — must be clean
- CSS class naming: component prefix (`.mk-` mock, `.cm-` connect, `.diff-` diff)
- Buttons: `.btn`, `.btn.primary`, `.mini`, `.mini.edit`, `.mini.delete`, `.icon-btn`, `.ctrl-btn`

## API endpoints (addon)
```
GET  /api/flows          # list FlowSummary[]
GET  /api/flows/:id      # FlowDetail
POST /api/flows/clear    # clear all flows
GET  /api/connection     # Connection info (IP, ports, cert URL)
GET  /api/mocks          # list MockRule[]
POST /api/mocks          # create/update MockRule
DEL  /api/mocks/:id      # delete MockRule
POST /api/resend/:id     # resend request
WS   /ws                 # live flow events
```

## PID / log files (background mode)
- PID file: `/tmp/chickenproxy.pid`
- Log file: `/tmp/chickenproxy.log`  →  `tail -f /tmp/chickenproxy.log`
