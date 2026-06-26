#!/usr/bin/env python3
"""Static file server for ChickenProxy dashboard + proxy start endpoint."""
import http.server
import json
import os
import shutil
import signal
import subprocess

# Auto-reap child processes so dead mitmproxy doesn't become a zombie
signal.signal(signal.SIGCHLD, signal.SIG_IGN)

PORT = 4444
PID_FILE = "/tmp/chickenproxy.pid"
PROXY_PID_FILE = "/tmp/chickenproxy-proxy.pid"
LOG_FILE = "/tmp/chickenproxy.log"

_DIR = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(_DIR, "web", "out")
ADDON = os.path.join(_DIR, "addon", "mitm_dashboard.py")


def _find_mitmdump() -> str:
    env = os.environ.get("MITMDUMP_BIN", "")
    if env and os.path.isfile(env):
        return env
    local = os.path.join(_DIR, "venv", "bin", "mitmdump")
    if os.path.isfile(local):
        return local
    return shutil.which("mitmdump") or ""


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=OUT_DIR, **kwargs)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_POST(self):
        if self.path == "/api/proxy/start":
            mitm = _find_mitmdump()
            if mitm:
                log = open(LOG_FILE, "a")
                proc = subprocess.Popen(
                    [mitm, "-s", ADDON, "-p", "8888"],
                    stdout=log,
                    stderr=log,
                )
                with open(PID_FILE, "a") as f:
                    f.write(f"{proc.pid}\n")
                with open(PROXY_PID_FILE, "w") as f:
                    f.write(f"{proc.pid}\n")
            self._json({"ok": bool(mitm)})
        else:
            self.send_error(404)

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _json(self, data):
        body = json.dumps(data).encode()
        self.send_response(200)
        self._cors()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    with http.server.HTTPServer(("127.0.0.1", PORT), Handler) as server:
        server.serve_forever()
