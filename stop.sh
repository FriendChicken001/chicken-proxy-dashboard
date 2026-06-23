#!/bin/bash
PID_FILE="/tmp/chickenproxy.pid"

if [ -f "$PID_FILE" ]; then
  kill $(cat "$PID_FILE") 2>/dev/null || true
  rm -f "$PID_FILE"
else
  pkill -f "mitm_dashboard.py" 2>/dev/null || true
  pkill -f "next dev" 2>/dev/null || true
fi
echo "ChickenProxy stopped."
