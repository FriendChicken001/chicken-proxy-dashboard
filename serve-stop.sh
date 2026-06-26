#!/bin/bash
SERVE_PID_FILE="/tmp/chickenproxy-serve.pid"

if [ -f "$SERVE_PID_FILE" ]; then
  kill $(cat "$SERVE_PID_FILE") 2>/dev/null || true
  rm -f "$SERVE_PID_FILE"
fi
lsof -ti :4444 | xargs kill -9 2>/dev/null || true
