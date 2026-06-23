#!/bin/bash
export PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin

DIR="$(cd "$(dirname "$0")" && pwd)"
PID_FILE="/tmp/chickenproxy.pid"
LOG_FILE="/tmp/chickenproxy.log"

if [ -f "$PID_FILE" ]; then
  kill $(cat "$PID_FILE") 2>/dev/null || true
  rm -f "$PID_FILE"
  sleep 1
fi

kill -9 $(lsof -ti :4444) 2>/dev/null || true

echo "" > "$LOG_FILE"

mitmdump -s "$DIR/addon/mitm_dashboard.py" -p 8888 >> "$LOG_FILE" 2>&1 &
echo $! >> "$PID_FILE"

cd "$DIR/web" && npm run dev >> "$LOG_FILE" 2>&1 &
echo $! >> "$PID_FILE"

sleep 4
open "http://localhost:4444"
