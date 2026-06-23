#!/bin/bash
# สร้าง Start/Stop app บน Desktop สำหรับเครื่องนี้
set -e

DIR="$(cd "$(dirname "$0")" && pwd)"
SCRATCH=$(mktemp -d)

echo "📁 Project: $DIR"

# Resolve tool paths at install time so start.sh works regardless of shell/nvm setup
NPM_BIN="$(command -v npm 2>/dev/null || echo "")"
MITM_BIN="$(command -v mitmdump 2>/dev/null || echo "")"

if [ -z "$NPM_BIN" ]; then
  echo "❌ npm not found. Install Node.js first."; exit 1
fi
if [ -z "$MITM_BIN" ]; then
  echo "❌ mitmdump not found. Install mitmproxy first (brew install mitmproxy)."; exit 1
fi

echo "   npm      → $NPM_BIN"
echo "   mitmdump → $MITM_BIN"

# --- start.sh ---
cat > "$DIR/start.sh" << SCRIPT
#!/bin/bash
NPM_BIN="$NPM_BIN"
MITM_BIN="$MITM_BIN"

DIR="$DIR"
PID_FILE="/tmp/chickenproxy.pid"
LOG_FILE="/tmp/chickenproxy.log"

if [ -f "\$PID_FILE" ]; then
  kill \$(cat "\$PID_FILE") 2>/dev/null || true
  rm -f "\$PID_FILE"
  sleep 1
fi

echo "" > "\$LOG_FILE"

"\$MITM_BIN" -s "\$DIR/addon/mitm_dashboard.py" -p 8888 >> "\$LOG_FILE" 2>&1 &
echo \$! >> "\$PID_FILE"

cd "\$DIR/web" && "\$NPM_BIN" run dev >> "\$LOG_FILE" 2>&1 &
echo \$! >> "\$PID_FILE"

sleep 4
open "http://localhost:4444"
SCRIPT

# --- stop.sh ---
cat > "$DIR/stop.sh" << SCRIPT
#!/bin/bash
PID_FILE="/tmp/chickenproxy.pid"

if [ -f "\$PID_FILE" ]; then
  kill \$(cat "\$PID_FILE") 2>/dev/null || true
  rm -f "\$PID_FILE"
else
  pkill -f "mitm_dashboard.py" 2>/dev/null || true
  pkill -f "next dev" 2>/dev/null || true
fi
echo "ChickenProxy stopped."
SCRIPT

chmod +x "$DIR/start.sh" "$DIR/stop.sh"

# --- AppleScript apps ---
cat > "$SCRATCH/start.applescript" << SCPT
do shell script "bash '$DIR/start.sh' > /dev/null 2>&1 &"
SCPT

cat > "$SCRATCH/stop.applescript" << SCPT
do shell script "bash '$DIR/stop.sh'"
SCPT

osacompile -o ~/Desktop/"🐔 Start ChickenProxy.app" "$SCRATCH/start.applescript"
osacompile -o ~/Desktop/"🛑 Stop ChickenProxy.app"  "$SCRATCH/stop.applescript"

rm -rf "$SCRATCH"

echo ""
echo "✅ Done! 2 apps created on your Desktop:"
echo "   🐔 Start ChickenProxy.app"
echo "   🛑 Stop ChickenProxy.app"
