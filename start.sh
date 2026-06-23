#!/bin/bash
export PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin

DIR="/Users/friendchicken/Desktop/mitmproxy-dashboard"
PID_FILE="/tmp/chickenproxy.pid"
LOG_FILE="/tmp/chickenproxy.log"

if [ -f "$PID_FILE" ]; then
  kill $(cat "$PID_FILE") 2>/dev/null || true
  rm -f "$PID_FILE"
  sleep 1
fi

echo "" > "$LOG_FILE"

# kill anything on port 4444
lsof -ti :4444 | xargs kill -9 2>/dev/null || true

mitmdump -s "$DIR/addon/mitm_dashboard.py" -p 8888 >> "$LOG_FILE" 2>&1 &
echo $! >> "$PID_FILE"

cd "$DIR/web" && npm run dev >> "$LOG_FILE" 2>&1 &
echo $! >> "$PID_FILE"

sleep 4
open "http://localhost:4444"
