#!/usr/bin/env bash
# Start mitmproxy addon + Next.js dashboard in one command.
# Press Ctrl-C once to stop both.
#
#   ./dev.sh                   # proxy :8888, dashboard :3000
#   PROXY_PORT=9000 ./dev.sh   # override proxy port
set -euo pipefail
cd "$(dirname "$0")"

PORT="${PROXY_PORT:-8888}"
BIN="${PROXY_BIN:-mitmdump}"

# Kill any leftover processes on exit
cleanup() {
  kill "$MITM_PID" "$WEB_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "▶ Starting ${BIN} on proxy port ${PORT}…"
"$BIN" -s addon/mitm_dashboard.py -p "$PORT" "$@" &
MITM_PID=$!

echo "▶ Starting Next.js dashboard…"
(cd web && npm run dev) &
WEB_PID=$!

echo ""
echo "  Proxy  → http://127.0.0.1:$PORT"
echo "  Dashboard → http://localhost:3000"
echo ""
echo "Press Ctrl-C to stop both."

wait
