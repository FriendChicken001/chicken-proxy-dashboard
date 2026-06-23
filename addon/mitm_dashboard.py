"""
mitm_dashboard — a mitmproxy addon that exposes intercepted traffic to a
live web dashboard.

It captures every flow, keeps a capped in-memory buffer, supports response
mocking, and serves the data over a small Tornado server:

    GET    /api/flows          -> summary list (newest first)
    GET    /api/flows/<id>     -> full detail incl. headers + body
    GET    /api/stats          -> aggregated statistics
    GET    /api/clear          -> drop the buffer
    GET    /api/connection     -> host LAN IP / proxy port / emulator hosts
    GET    /api/mocks          -> list mock rules
    POST   /api/mocks          -> create/update a mock rule
    DELETE /api/mocks/<id>     -> delete a mock rule
    WS     /ws                 -> live push of flows + stats + mocks

Mock rules intercept matching requests and return a canned response
(status/headers/body) instead of hitting the upstream server. They are
persisted to mocks.json next to this addon, so they survive restarts.

Run it with:

    mitmdump -s addon/mitm_dashboard.py
    # or to also open the interactive UI:
    mitmproxy -s addon/mitm_dashboard.py

Configure with mitmproxy options:

    --set dashboard_port=8081      (default 8081)
    --set dashboard_max_flows=5000 (ring-buffer size)
    --set dashboard_body_limit=65536

Only Python stdlib + libraries bundled with mitmproxy (tornado) are used,
so it runs inside the mitmproxy binary with no extra installs.
"""

from __future__ import annotations

import json
import logging
import os
import socket
import time
from collections import deque
from typing import Any, Deque, Dict, List, Optional, Set

import tornado.web
import tornado.websocket

from mitmproxy import ctx, http
from mitmproxy.addonmanager import Loader

log = logging.getLogger("mitm_dashboard")

MOCK_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "mocks.json")


# ---------------------------------------------------------------------------
# Mock rules — intercept matching requests and return a canned response
# ---------------------------------------------------------------------------

def _normalize_mock(data: Dict[str, Any], existing_hits: int = 0) -> Dict[str, Any]:
    """Coerce a user-supplied mock rule into a clean, stored shape."""
    mid = str(data.get("id") or f"m{int(time.time() * 1000)}")
    headers: List[List[str]] = []
    for pair in data.get("headers") or []:
        try:
            k, v = pair
            if str(k).strip():
                headers.append([str(k), str(v)])
        except (ValueError, TypeError):
            continue
    return {
        "id": mid,
        "enabled": bool(data.get("enabled", True)),
        "name": str(data.get("name") or "Mock"),
        "method": str(data.get("method") or "").upper(),
        "url_contains": str(data.get("url_contains") or ""),
        "status_code": int(data.get("status_code") or 200),
        "headers": headers,
        "body": str(data.get("body") or ""),
        "hits": int(existing_hits),
    }


def _mock_matches(rule: Dict[str, Any], flow: http.HTTPFlow) -> bool:
    if not rule.get("enabled"):
        return False
    method = rule.get("method", "")
    needle = rule.get("url_contains", "")
    if not method and not needle:
        return False  # an empty rule must not swallow all traffic
    if method and method != flow.request.method.upper():
        return False
    if needle and needle not in flow.request.pretty_url:
        return False
    return True


def _apply_mock(rule: Dict[str, Any], flow: http.HTTPFlow) -> None:
    headers = {str(k): str(v) for k, v in rule.get("headers", [])}
    body = (rule.get("body") or "").encode("utf-8")
    flow.response = http.Response.make(
        int(rule.get("status_code", 200)), body, headers
    )


# ---------------------------------------------------------------------------
# Connection info (how mobile emulators/devices reach this proxy)
# ---------------------------------------------------------------------------

def _proxy_port() -> int:
    """The TCP port mitmproxy is intercepting on.

    Set either via -p/--listen-port (-> ctx.options.listen_port) or embedded in
    a mode string such as 'regular@8082'. Falls back to mitmproxy's 8080 default.
    """
    lp = getattr(ctx.options, "listen_port", 0)
    if lp:
        return int(lp)
    try:
        for mode in ctx.options.mode:
            if "@" in mode:
                return int(mode.rsplit("@", 1)[1])
    except Exception:
        pass
    return 8080


def _lan_ip() -> str:
    """Best-effort primary LAN IPv4 of this host (no packets are sent)."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    except Exception:
        return "127.0.0.1"
    finally:
        s.close()


def _cert_path() -> str:
    return os.path.expanduser("~/.mitmproxy/mitmproxy-ca-cert.cer")


def _connection_info(proxy_port: int, dashboard_port: int) -> Dict[str, Any]:
    lan = _lan_ip()
    return {
        "proxy_port": proxy_port,
        "lan_ip": lan,
        "loopback": "127.0.0.1",
        # 10.0.2.2 is the standard Android emulator alias for the host loopback.
        "android_emulator_host": "10.0.2.2",
        # Genymotion uses a different host alias.
        "genymotion_host": "10.0.3.2",
        # Served directly from addon — no need for traffic to go through proxy first.
        "cert_url": f"http://{lan}:{dashboard_port}/cert",
        "cert_url_loopback": f"http://127.0.0.1:{dashboard_port}/cert",
        "cert_url_android": f"http://10.0.2.2:{dashboard_port}/cert",
    }


# ---------------------------------------------------------------------------
# Flow -> JSON serialization
# ---------------------------------------------------------------------------

def _headers_to_list(headers) -> List[List[str]]:
    return [[k, v] for k, v in headers.items(multi=True)]


def _flow_summary(flow: http.HTTPFlow) -> Dict[str, Any]:
    req = flow.request
    resp = flow.response
    duration = None
    if resp and req.timestamp_start and resp.timestamp_end:
        duration = round((resp.timestamp_end - req.timestamp_start) * 1000, 1)
    return {
        "id": flow.id,
        "time_start": req.timestamp_start,
        "method": req.method,
        "scheme": req.scheme,
        "host": req.pretty_host,
        "port": req.port,
        "path": req.path,
        "url": req.pretty_url,
        "status_code": resp.status_code if resp else None,
        "reason": resp.reason if resp else None,
        "content_type": (resp.headers.get("content-type", "").split(";")[0]
                         if resp else None),
        "request_size": len(req.raw_content or b""),
        "response_size": len(resp.raw_content or b"") if resp else 0,
        "duration_ms": duration,
        "error": flow.error.msg if flow.error else None,
        "completed": resp is not None,
        "mocked": bool(flow.metadata.get("mock")),
        "mock_name": flow.metadata.get("mock"),
    }


def _truncate_body(message, limit: int) -> Dict[str, Any]:
    raw = message.raw_content or b""
    size = len(raw)
    text = None
    is_text = False
    try:
        text = message.get_text(strict=False)
        is_text = text is not None
    except Exception:
        text = None
    if text is not None and len(text) > limit:
        text = text[:limit]
        truncated = True
    else:
        truncated = size > limit and not is_text
    return {
        "size": size,
        "is_text": is_text,
        "truncated": truncated,
        "text": text if is_text else None,
    }


def _flow_detail(flow: http.HTTPFlow, body_limit: int) -> Dict[str, Any]:
    detail = _flow_summary(flow)
    req = flow.request
    detail["request_headers"] = _headers_to_list(req.headers)
    detail["query"] = [[k, v] for k, v in req.query.items(multi=True)]
    detail["request_body"] = _truncate_body(req, body_limit)
    detail["http_version"] = req.http_version
    if flow.response:
        detail["response_headers"] = _headers_to_list(flow.response.headers)
        detail["response_body"] = _truncate_body(flow.response, body_limit)
    else:
        detail["response_headers"] = []
        detail["response_body"] = None
    return detail


# ---------------------------------------------------------------------------
# Tornado request handlers
# ---------------------------------------------------------------------------

class _CorsHandler(tornado.web.RequestHandler):
    def set_default_headers(self) -> None:
        self.set_header("Access-Control-Allow-Origin", "*")
        self.set_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.set_header("Access-Control-Allow-Headers", "Content-Type")
        self.set_header("Content-Type", "application/json")

    def options(self, *args) -> None:
        self.set_status(204)
        self.finish()

    @property
    def store(self) -> "DashboardAddon":
        return self.application.settings["store"]


class FlowsHandler(_CorsHandler):
    def get(self) -> None:
        self.finish(json.dumps({"flows": self.store.summaries()}))


class FlowDetailHandler(_CorsHandler):
    def get(self, flow_id: str) -> None:
        detail = self.store.detail(flow_id)
        if detail is None:
            self.set_status(404)
            self.finish(json.dumps({"error": "not found"}))
            return
        self.finish(json.dumps(detail))


class StatsHandler(_CorsHandler):
    def get(self) -> None:
        self.finish(json.dumps(self.store.stats()))


class ClearHandler(_CorsHandler):
    def get(self) -> None:
        self.store.clear()
        self.finish(json.dumps({"ok": True}))


class ConnectionHandler(_CorsHandler):
    def get(self) -> None:
        self.finish(json.dumps(self.store.connection_info()))


class CertHandler(tornado.web.RequestHandler):
    def get(self) -> None:
        path = _cert_path()
        if not os.path.exists(path):
            self.set_status(404)
            self.finish("Certificate not found — run mitmproxy at least once to generate it.")
            return
        self.set_header("Content-Type", "application/x-x509-ca-cert")
        self.set_header("Content-Disposition", 'attachment; filename="mitmproxy-ca-cert.cer"')
        with open(path, "rb") as fh:
            self.finish(fh.read())


class MocksHandler(_CorsHandler):
    def get(self) -> None:
        self.finish(json.dumps({"mocks": self.store.list_mocks()}))

    def post(self) -> None:
        try:
            data = json.loads(self.request.body or b"{}")
        except Exception:
            self.set_status(400)
            self.finish(json.dumps({"error": "invalid JSON"}))
            return
        self.finish(json.dumps(self.store.upsert_mock(data)))


class MockItemHandler(_CorsHandler):
    def delete(self, mock_id: str) -> None:
        self.store.delete_mock(mock_id)
        self.finish(json.dumps({"ok": True}))


class FlowSocket(tornado.websocket.WebSocketHandler):
    def check_origin(self, origin: str) -> bool:
        return True

    @property
    def store(self) -> "DashboardAddon":
        return self.application.settings["store"]

    def open(self) -> None:
        self.store.clients.add(self)
        self.write_message(json.dumps({"type": "stats", "data": self.store.stats()}))

    def on_close(self) -> None:
        self.store.clients.discard(self)


# ---------------------------------------------------------------------------
# The addon
# ---------------------------------------------------------------------------

class DashboardAddon:
    def __init__(self) -> None:
        self.flows: Deque[http.HTTPFlow] = deque()
        self.clients: Set[FlowSocket] = set()
        self.mocks: "Dict[str, Dict[str, Any]]" = {}
        self._app: Optional[tornado.web.Application] = None
        self._server = None
        self.max_flows = 5000
        self.body_limit = 65536
        self._load_mocks()

    # --- options ---
    def load(self, loader: Loader) -> None:
        loader.add_option("dashboard_port", int, 8081,
                          "Port for the dashboard HTTP/WS server.")
        loader.add_option("dashboard_max_flows", int, 5000,
                          "Maximum number of flows kept in memory.")
        loader.add_option("dashboard_body_limit", int, 65536,
                          "Max bytes of body text returned per message.")

    def configure(self, updated) -> None:
        self.max_flows = ctx.options.dashboard_max_flows
        self.body_limit = ctx.options.dashboard_body_limit
        self._trim()

    def running(self) -> None:
        if self._server is not None:
            return
        port = ctx.options.dashboard_port
        self._app = tornado.web.Application(
            [
                (r"/api/flows", FlowsHandler),
                (r"/api/flows/([^/]+)", FlowDetailHandler),
                (r"/api/stats", StatsHandler),
                (r"/api/clear", ClearHandler),
                (r"/api/connection", ConnectionHandler),
                (r"/api/mocks", MocksHandler),
                (r"/api/mocks/([^/]+)", MockItemHandler),
                (r"/cert", CertHandler),
                (r"/ws", FlowSocket),
            ],
            store=self,
        )
        try:
            self._server = self._app.listen(port, address="0.0.0.0")
            proxy_port = _proxy_port()
            lan = _lan_ip()
            log.info(
                f"[dashboard] serving on http://127.0.0.1:{port} "
                f"(api: /api/flows, ws: /ws)"
            )
            log.info(
                f"[dashboard] proxy reachable at  {lan}:{proxy_port}  "
                f"(iOS sim: 127.0.0.1:{proxy_port} · "
                f"Android emu: 10.0.2.2:{proxy_port})"
            )
        except Exception as exc:  # pragma: no cover
            log.error(f"[dashboard] failed to start server: {exc}")

    # --- capture hooks ---
    def request(self, flow: http.HTTPFlow) -> None:
        # Apply the first matching mock rule (short-circuits the upstream call).
        for rule in list(self.mocks.values()):
            if _mock_matches(rule, flow):
                _apply_mock(rule, flow)
                flow.metadata["mock"] = rule.get("name") or rule["id"]
                rule["hits"] = rule.get("hits", 0) + 1
                self._broadcast({"type": "mocks", "data": self.list_mocks()})
                break
        if flow not in self.flows:
            self.flows.append(flow)
            self._trim()

    def response(self, flow: http.HTTPFlow) -> None:
        self._record(flow)

    def error(self, flow: http.HTTPFlow) -> None:
        self._record(flow)

    def _record(self, flow: http.HTTPFlow) -> None:
        if flow not in self.flows:
            self.flows.append(flow)
            self._trim()
        self._broadcast({"type": "flow", "data": _flow_summary(flow)})
        self._broadcast({"type": "stats", "data": self.stats()})

    # --- buffer management ---
    def _trim(self) -> None:
        while len(self.flows) > self.max_flows:
            self.flows.popleft()

    def clear(self) -> None:
        self.flows.clear()
        self._broadcast({"type": "stats", "data": self.stats()})

    # --- connection info ---
    def connection_info(self) -> Dict[str, Any]:
        return _connection_info(_proxy_port(), ctx.options.dashboard_port)

    # --- mock rules ---
    def list_mocks(self) -> List[Dict[str, Any]]:
        return list(self.mocks.values())

    def upsert_mock(self, data: Dict[str, Any]) -> Dict[str, Any]:
        existing = self.mocks.get(str(data.get("id") or ""), {})
        rule = _normalize_mock(data, existing.get("hits", 0))
        self.mocks[rule["id"]] = rule
        self._save_mocks()
        self._broadcast({"type": "mocks", "data": self.list_mocks()})
        return rule

    def delete_mock(self, mock_id: str) -> None:
        self.mocks.pop(mock_id, None)
        self._save_mocks()
        self._broadcast({"type": "mocks", "data": self.list_mocks()})

    def _load_mocks(self) -> None:
        try:
            with open(MOCK_FILE, "r", encoding="utf-8") as fh:
                for rule in json.load(fh):
                    norm = _normalize_mock(rule, rule.get("hits", 0))
                    self.mocks[norm["id"]] = norm
        except FileNotFoundError:
            pass
        except Exception as exc:
            log.warning(f"[dashboard] could not load mocks: {exc}")

    def _save_mocks(self) -> None:
        try:
            with open(MOCK_FILE, "w", encoding="utf-8") as fh:
                json.dump(self.list_mocks(), fh, indent=2)
        except Exception as exc:
            log.warning(f"[dashboard] could not save mocks: {exc}")

    # --- serialization helpers ---
    def summaries(self) -> List[Dict[str, Any]]:
        return [_flow_summary(f) for f in reversed(self.flows)]

    def detail(self, flow_id: str) -> Optional[Dict[str, Any]]:
        for f in self.flows:
            if f.id == flow_id:
                return _flow_detail(f, self.body_limit)
        return None

    def stats(self) -> Dict[str, Any]:
        total = len(self.flows)
        methods: Dict[str, int] = {}
        status_classes = {"2xx": 0, "3xx": 0, "4xx": 0, "5xx": 0, "pending": 0}
        hosts: Dict[str, int] = {}
        bytes_in = 0
        mocked = 0
        durations: List[float] = []
        timeline: Dict[int, int] = {}

        for f in self.flows:
            req = f.request
            methods[req.method] = methods.get(req.method, 0) + 1
            hosts[req.pretty_host] = hosts.get(req.pretty_host, 0) + 1
            if f.metadata.get("mock"):
                mocked += 1
            if f.response:
                code = f.response.status_code
                bucket = f"{code // 100}xx"
                if bucket in status_classes:
                    status_classes[bucket] += 1
                bytes_in += len(f.response.raw_content or b"")
                if req.timestamp_start and f.response.timestamp_end:
                    durations.append(
                        (f.response.timestamp_end - req.timestamp_start) * 1000)
            else:
                status_classes["pending"] += 1
            if req.timestamp_start:
                sec = int(req.timestamp_start)
                timeline[sec] = timeline.get(sec, 0) + 1

        durations.sort()
        avg = round(sum(durations) / len(durations), 1) if durations else 0
        p95 = round(durations[int(len(durations) * 0.95)], 1) if durations else 0

        top_hosts = sorted(hosts.items(), key=lambda kv: kv[1], reverse=True)[:8]
        timeline_pts = sorted(timeline.items())[-60:]

        return {
            "total": total,
            "methods": methods,
            "status_classes": status_classes,
            "top_hosts": [{"host": h, "count": c} for h, c in top_hosts],
            "bytes_in": bytes_in,
            "mocked": mocked,
            "avg_ms": avg,
            "p95_ms": p95,
            "timeline": [{"t": t, "count": c} for t, c in timeline_pts],
        }

    # --- websocket broadcast ---
    def _broadcast(self, message: Dict[str, Any]) -> None:
        if not self.clients:
            return
        payload = json.dumps(message)
        dead = []
        for client in self.clients:
            try:
                client.write_message(payload)
            except Exception:
                dead.append(client)
        for client in dead:
            self.clients.discard(client)


addons = [DashboardAddon()]
