#!/bin/bash
PROXY_PID_FILE="/tmp/chickenproxy-proxy.pid"
SERVE_PID_FILE="/tmp/chickenproxy-serve.pid"

if [ -f "$PROXY_PID_FILE" ]; then
  kill $(cat "$PROXY_PID_FILE") 2>/dev/null || true
  rm -f "$PROXY_PID_FILE"
fi
if [ -f "$SERVE_PID_FILE" ]; then
  kill $(cat "$SERVE_PID_FILE") 2>/dev/null || true
  rm -f "$SERVE_PID_FILE"
fi
pkill -f "mitm_dashboard.py" 2>/dev/null || true
pkill -f "serve.py" 2>/dev/null || true
