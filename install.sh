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

MITM_BIN=$(check "mitmdump" mitmdump \
  "(will be installed automatically if missing)")

SWIFT_BIN=$(check "swiftc" swiftc \
  "xcode-select --install  (Command Line Tools, ~500 MB)" \
  "App Store: install Xcode")

PYTHON_BIN=$(check "python3" python3 \
  "comes with Xcode Command Line Tools (xcode-select --install)")

MISSING=0
[ -z "$SWIFT_BIN" ]  && MISSING=1
[ -z "$PYTHON_BIN" ] && MISSING=1

if [ "$MISSING" -eq 1 ]; then
  echo ""
  echo "❌ Install the missing dependencies above, then run install.sh again."
  exit 1
fi

# ── Auto-install mitmproxy if not found ───────────────────────────────────────

if [ -z "$MITM_BIN" ]; then
  if [ -z "$PYTHON_BIN" ]; then
    echo "❌ python3 not found — needed to auto-install mitmproxy."
    echo "   Install python3 or mitmproxy manually, then run install.sh again."
    exit 1
  fi

  VENV_DIR="$DIR/venv"
  VENV_MITM="$VENV_DIR/bin/mitmdump"

  if [ -f "$VENV_MITM" ]; then
    printf "  ✅  %-10s %s\n" "mitmdump" "(local venv)"
    MITM_BIN="$VENV_MITM"
  else
    echo "📦 Installing mitmproxy into local venv (no brew needed)..."
    "$PYTHON_BIN" -m venv "$VENV_DIR"
    "$VENV_DIR/bin/pip" install mitmproxy --quiet
    MITM_BIN="$VENV_MITM"
    echo "   done — mitmproxy installed at $VENV_DIR"
    echo ""
  fi
elif [ -f "$DIR/venv/bin/mitmdump" ]; then
  MITM_BIN="$DIR/venv/bin/mitmdump"
fi

echo ""
echo "All dependencies found."
echo ""

# ── Build Next.js static export (if npm available) ────────────────────────────

NPM_BIN=$(command -v npm 2>/dev/null || true)
if [ -n "$NPM_BIN" ]; then
  echo "🔨 Building dashboard..."
  (cd "$DIR/web" && "$NPM_BIN" run build --silent)
  echo "   done"
  echo ""
fi

# ── Generate scripts ──────────────────────────────────────────────────────────

# serve-start.sh — start serve.py only (idempotent, called on dashboard open)
cat > "$DIR/serve-start.sh" << SCRIPT
#!/bin/bash
PYTHON_BIN="$PYTHON_BIN"
MITM_BIN="$MITM_BIN"
DIR="$DIR"
SERVE_PID_FILE="/tmp/chickenproxy-serve.pid"
LOG_FILE="/tmp/chickenproxy.log"

if [ -f "\$SERVE_PID_FILE" ]; then
  PID=\$(cat "\$SERVE_PID_FILE")
  kill -0 "\$PID" 2>/dev/null && exit 0
  rm -f "\$SERVE_PID_FILE"
fi

lsof -ti :4444 | xargs kill -9 2>/dev/null || true

MITMDUMP_BIN="\$MITM_BIN" "\$PYTHON_BIN" "\$DIR/serve.py" >> "\$LOG_FILE" 2>&1 &
echo \$! > "\$SERVE_PID_FILE"
SCRIPT

# start.sh — start mitmproxy proxy only (serve.py already running)
cat > "$DIR/start.sh" << SCRIPT
#!/bin/bash
MITM_BIN="$MITM_BIN"
DIR="$DIR"
PROXY_PID_FILE="/tmp/chickenproxy-proxy.pid"
LOG_FILE="/tmp/chickenproxy.log"

if [ -f "\$PROXY_PID_FILE" ]; then
  PID=\$(cat "\$PROXY_PID_FILE")
  kill -0 "\$PID" 2>/dev/null && exit 0
  rm -f "\$PROXY_PID_FILE"
fi

lsof -ti :8081 | xargs kill -9 2>/dev/null || true
lsof -ti :8888 | xargs kill -9 2>/dev/null || true

"\$MITM_BIN" -s "\$DIR/addon/mitm_dashboard.py" -p 8888 >> "\$LOG_FILE" 2>&1 &
MITM_PID=\$!
echo \$MITM_PID > "\$PROXY_PID_FILE"
SCRIPT

# stop.sh — stop mitmproxy only (serve.py keeps running)
cat > "$DIR/stop.sh" << SCRIPT
#!/bin/bash
PROXY_PID_FILE="/tmp/chickenproxy-proxy.pid"

if [ -f "\$PROXY_PID_FILE" ]; then
  kill \$(cat "\$PROXY_PID_FILE") 2>/dev/null || true
  rm -f "\$PROXY_PID_FILE"
else
  pkill -f "mitm_dashboard.py" 2>/dev/null || true
fi
SCRIPT

# serve-stop.sh — stop serve.py only (called when dashboard window closes)
cat > "$DIR/serve-stop.sh" << SCRIPT
#!/bin/bash
SERVE_PID_FILE="/tmp/chickenproxy-serve.pid"

if [ -f "\$SERVE_PID_FILE" ]; then
  kill \$(cat "\$SERVE_PID_FILE") 2>/dev/null || true
  rm -f "\$SERVE_PID_FILE"
fi
lsof -ti :4444 | xargs kill -9 2>/dev/null || true
SCRIPT

# quit.sh — stop everything including serve.py (called on app quit)
cat > "$DIR/quit.sh" << SCRIPT
#!/bin/bash
PROXY_PID_FILE="/tmp/chickenproxy-proxy.pid"
SERVE_PID_FILE="/tmp/chickenproxy-serve.pid"

if [ -f "\$PROXY_PID_FILE" ]; then
  kill \$(cat "\$PROXY_PID_FILE") 2>/dev/null || true
  rm -f "\$PROXY_PID_FILE"
fi
if [ -f "\$SERVE_PID_FILE" ]; then
  kill \$(cat "\$SERVE_PID_FILE") 2>/dev/null || true
  rm -f "\$SERVE_PID_FILE"
fi
pkill -f "mitm_dashboard.py" 2>/dev/null || true
pkill -f "serve.py" 2>/dev/null || true
SCRIPT

chmod +x "$DIR/serve-start.sh" "$DIR/serve-stop.sh" "$DIR/start.sh" "$DIR/stop.sh" "$DIR/quit.sh"

# ── Build menu bar app ────────────────────────────────────────────────────────

echo "🔨 Building menu bar app..."

SCRATCH=$(mktemp -d)
SWIFT_SRC="$SCRATCH/ChickenProxyBar.swift"
BINARY="$DIR/menubar/ChickenProxyBar"
ICON_BIN="$DIR/menubar/make_icon"
APP_BUNDLE=~/Desktop/"ProxyChicken.app"

sed "s|__PROJECT_DIR__|$DIR|g" "$DIR/menubar/ChickenProxyBar.swift" > "$SWIFT_SRC"

swiftc "$SWIFT_SRC" -framework Cocoa -framework Foundation -framework WebKit -o "$BINARY" 2>&1

# App icon: use iconset from img/ if available, else generate from emoji
ICONSET_DIR="$DIR/img/chicken-stealth-icon/AppIcon.iconset"
if [ -d "$ICONSET_DIR" ]; then
  iconutil -c icns "$ICONSET_DIR" -o "$SCRATCH/AppIcon.icns"
else
  swiftc "$DIR/menubar/make_icon.swift" -framework Cocoa -o "$ICON_BIN" 2>&1
  "$ICON_BIN" "🐔" "$SCRATCH/AppIcon.icns"
fi

rm -rf "$APP_BUNDLE"
mkdir -p "$APP_BUNDLE/Contents/MacOS"
mkdir -p "$APP_BUNDLE/Contents/Resources/img"

cp "$BINARY" "$APP_BUNDLE/Contents/MacOS/ChickenProxyBar"
cp "$SCRATCH/AppIcon.icns" "$APP_BUNDLE/Contents/Resources/AppIcon.icns"

# Copy menubar icons into bundle
MENUBAR_ICONS="$DIR/img/chicken-menubar-icons/Template-PNG"
if [ -d "$MENUBAR_ICONS" ]; then
  cp "$MENUBAR_ICONS"/ProxyActiveTemplate*.png  "$APP_BUNDLE/Contents/Resources/img/" 2>/dev/null || true
  cp "$MENUBAR_ICONS"/ProxyPausedTemplate*.png  "$APP_BUNDLE/Contents/Resources/img/" 2>/dev/null || true
fi

cat > "$APP_BUNDLE/Contents/Info.plist" << PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>        <string>ChickenProxyBar</string>
  <key>CFBundleIdentifier</key>        <string>com.chickenproxy.menubar</string>
  <key>CFBundleName</key>              <string>ProxyChicken</string>
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
echo "   Open ProxyChicken.app on your Desktop"
echo "   to control the proxy from the menu bar."
echo ""
