#!/bin/bash
PYTHON_BIN="/usr/bin/python3"
MITM_BIN="/opt/homebrew/bin/mitmdump"
DIR="/Users/friendchicken/Documents/chicken-proxy-dashboard"
SERVE_PID_FILE="/tmp/chickenproxy-serve.pid"
LOG_FILE="/tmp/chickenproxy.log"

if [ -f "$SERVE_PID_FILE" ]; then
  PID=$(cat "$SERVE_PID_FILE")
  kill -0 "$PID" 2>/dev/null && exit 0
  rm -f "$SERVE_PID_FILE"
fi

lsof -ti :4444 | xargs kill -9 2>/dev/null || true

MITMDUMP_BIN="$MITM_BIN" "$PYTHON_BIN" "$DIR/serve.py" >> "$LOG_FILE" 2>&1 &
echo $! > "$SERVE_PID_FILE"
