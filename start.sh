#!/bin/bash
NPM_BIN="/Users/Puvadon/.nvm/versions/node/v20.20.2/bin/npm"
MITM_BIN="/opt/homebrew/bin/mitmdump"
export PATH="/Users/Puvadon/.nvm/versions/node/v20.20.2/bin:$PATH"

DIR="/Users/Puvadon/Documents/chicken-proxy-dashboard"
PID_FILE="/tmp/chickenproxy.pid"
LOG_FILE="/tmp/chickenproxy.log"

if [ -f "$PID_FILE" ]; then
  kill $(cat "$PID_FILE") 2>/dev/null || true
  rm -f "$PID_FILE"
  sleep 1
fi

echo "" > "$LOG_FILE"

"$MITM_BIN" -s "$DIR/addon/mitm_dashboard.py" -p 8888 >> "$LOG_FILE" 2>&1 &
echo $! >> "$PID_FILE"

cd "$DIR/web" && "$NPM_BIN" run dev >> "$LOG_FILE" 2>&1 &
echo $! >> "$PID_FILE"

sleep 4
open "http://localhost:4444"
