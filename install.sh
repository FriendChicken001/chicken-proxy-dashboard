#!/bin/bash
set -e

DIR="$(cd "$(dirname "$0")" && pwd)"

echo ""
echo "🐔 ChickenProxy — Setup"
echo "══════════════════════════════"

# ── Dependency check ──────────────────────────────────────────────────────────

check() {
  local label="$1" bin="$2"
  shift 2
  local hints=("$@")
  local path ver
  path="$(command -v "$bin" 2>/dev/null || true)"
  if [ -n "$path" ]; then
    case "$bin" in
      node)     ver="$("$path" --version 2>/dev/null)" ;;
      npm)      ver="v$("$path" --version 2>/dev/null)" ;;
      mitmdump) ver="v$("$path" --version 2>/dev/null | head -1 | awk '{print $2}')" ;;
      swiftc)   ver="$("$path" --version 2>/dev/null | awk '{print $4}')" ;;
      python3)  ver="$("$path" --version 2>/dev/null | awk '{print $2}')" ;;
      *)        ver="" ;;
    esac
    printf "  ✅  %-10s %s\n" "$label" "$ver" >&2
    echo "$path"
  else
    printf "  ❌  %-10s not found — install with:\n" "$label" >&2
    for hint in "${hints[@]}"; do
      printf "          %s\n" "$hint" >&2
    done
    echo "" >&2
    echo ""
  fi
}

echo ""
echo "Checking dependencies..."
echo ""

NODE_BIN=$(check "node" node \
  "brew install node" \
  "nvm: https://github.com/nvm-sh/nvm" \
  "official installer: https://nodejs.org")

NPM_BIN=$(check "npm" npm \
  "comes with Node.js (install node first)")

MITM_BIN=$(check "mitmdump" mitmdump \
  "brew install mitmproxy" \
  "pip3 install mitmproxy" \
  "official installer: https://mitmproxy.org")

SWIFT_BIN=$(check "swiftc" swiftc \
  "xcode-select --install  (Command Line Tools, ~500 MB)" \
  "App Store: install Xcode")

check "python3" python3 \
  "brew install python3" \
  "official installer: https://python.org" > /dev/null

MISSING=0
[ -z "$NODE_BIN" ] && MISSING=1
[ -z "$NPM_BIN"  ] && MISSING=1
[ -z "$MITM_BIN" ] && MISSING=1
[ -z "$SWIFT_BIN" ] && MISSING=1

if [ "$MISSING" -eq 1 ]; then
  echo ""
  echo "❌ Install the missing dependencies above, then run install.sh again."
  exit 1
fi

echo ""
echo "All dependencies found."
echo ""

# ── npm install ───────────────────────────────────────────────────────────────

if [ ! -d "$DIR/web/node_modules" ]; then
  echo "📦 Installing npm packages..."
  (cd "$DIR/web" && "$NPM_BIN" install --silent)
  echo "   done"
  echo ""
fi

# ── Generate start.sh / stop.sh ───────────────────────────────────────────────

NODE_DIR="$(dirname "$NODE_BIN")"

cat > "$DIR/start.sh" << SCRIPT
#!/bin/bash
NPM_BIN="$NPM_BIN"
MITM_BIN="$MITM_BIN"
export PATH="$NODE_DIR:\$PATH"

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

if [[ "\$*" != *--no-open* ]]; then
  sleep 4
  open "http://localhost:4444"
fi
SCRIPT

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
SCRIPT

chmod +x "$DIR/start.sh" "$DIR/stop.sh"

# ── Build menu bar app ────────────────────────────────────────────────────────

echo "🔨 Building menu bar app..."

SCRATCH=$(mktemp -d)
SWIFT_SRC="$SCRATCH/ChickenProxyBar.swift"
BINARY="$DIR/menubar/ChickenProxyBar"
ICON_BIN="$DIR/menubar/make_icon"
APP_BUNDLE=~/Desktop/"🐔 ChickenProxy Bar.app"

sed "s|__PROJECT_DIR__|$DIR|g" "$DIR/menubar/ChickenProxyBar.swift" > "$SWIFT_SRC"

swiftc "$SWIFT_SRC" -framework Cocoa -framework Foundation -framework WebKit -o "$BINARY" 2>&1
swiftc "$DIR/menubar/make_icon.swift" -framework Cocoa -o "$ICON_BIN" 2>&1

"$ICON_BIN" "🐔" "$SCRATCH/AppIcon.icns"

rm -rf "$APP_BUNDLE"
mkdir -p "$APP_BUNDLE/Contents/MacOS"
mkdir -p "$APP_BUNDLE/Contents/Resources"

cp "$BINARY" "$APP_BUNDLE/Contents/MacOS/ChickenProxyBar"
cp "$SCRATCH/AppIcon.icns" "$APP_BUNDLE/Contents/Resources/AppIcon.icns"

cat > "$APP_BUNDLE/Contents/Info.plist" << PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>        <string>ChickenProxyBar</string>
  <key>CFBundleIdentifier</key>        <string>com.chickenproxy.menubar</string>
  <key>CFBundleName</key>              <string>ChickenProxy Bar</string>
  <key>CFBundleIconFile</key>          <string>AppIcon</string>
  <key>CFBundlePackageType</key>       <string>APPL</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>LSMinimumSystemVersion</key>    <string>13.0</string>
  <key>LSUIElement</key>               <true/>
</dict>
</plist>
PLIST

rm -rf "$SCRATCH"

echo ""
echo "══════════════════════════════"
echo "✅ Done!"
echo ""
echo "   Open 🐔 ChickenProxy Bar.app on your Desktop"
echo "   to control the proxy from the menu bar."
echo ""
