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
import signal
import socket
import ssl
import time
import urllib.error
import urllib.request
from collections import deque
from typing import Any, Deque, Dict, List, Optional, Set

import tornado.ioloop
import tornado.web
import tornado.websocket

from mitmproxy import ctx, http
from mitmproxy.addonmanager import Loader

log = logging.getLogger("mitm_dashboard")

MOCK_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "mocks.json")
BREAKPOINT_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "breakpoints.json")


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
    group_id = data.get("group_id")
    return {
        "id": mid,
        "enabled": bool(data.get("enabled", True)),
        "name": str(data.get("name") or "Mock"),
        "method": str(data.get("method") or "").upper(),
        "url_contains": str(data.get("url_contains") or ""),
        "status_code": int(data.get("status_code") or 200),
        "headers": headers,
        "body": str(data.get("body") or ""),
        "delay_ms": max(0, int(data.get("delay_ms") or 0)),
        "func": str(data.get("func") or ""),
        "hits": int(existing_hits),
        "group_id": str(group_id) if group_id else None,
        "order": int(data.get("order") or 0),
    }


def _normalize_breakpoint(data: Dict[str, Any]) -> Dict[str, Any]:
    bid = str(data.get("id") or f"b{int(time.time() * 1000)}")
    return {
        "id": bid,
        "enabled": bool(data.get("enabled", True)),
        "name": str(data.get("name") or "Breakpoint"),
        "method": str(data.get("method") or "").upper(),
        "url_contains": str(data.get("url_contains") or ""),
        "phase": "response" if data.get("phase") == "response" else "request",
        "func": str(data.get("func") or ""),
        "hits": int(data.get("hits") or 0),
        "timeout_s": int(data.get("timeout_s") or 0),
        "max_hits": int(data.get("max_hits") or 0),
    }


def _breakpoint_matches(bp: Dict[str, Any], flow: http.HTTPFlow) -> bool:
    if not bp.get("enabled"):
        return False
    method = bp.get("method", "")
    needle = bp.get("url_contains", "")
    if not method and not needle:
        return False
    if method and method != flow.request.method.upper():
        return False
    if needle and needle not in flow.request.pretty_url:
        return False
    func_code = (bp.get("func") or "").strip()
    if func_code:
        try:
            ns: Dict[str, Any] = {}
            exec(compile(func_code, "<bp_func>", "exec"), ns)  # noqa: S102
            if "should_break" in ns:
                return bool(ns["should_break"](flow))
        except Exception as exc:
            log.warning(f"[dashboard] breakpoint func error: {exc}")
            return False
    return True


def _normalize_group(data: Dict[str, Any]) -> Dict[str, Any]:
    """Coerce a user-supplied group into a clean, stored shape."""
    gid = str(data.get("id") or f"g{int(time.time() * 1000)}")
    return {
        "id": gid,
        "name": str(data.get("name") or "Group"),
        "order": int(data.get("order") or 0),
        "collapsed": bool(data.get("collapsed", False)),
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
    delay_ms = rule.get("delay_ms", 0) or 0
    if delay_ms > 0:
        time.sleep(delay_ms / 1000.0)

    func_code = (rule.get("func") or "").strip()
    if func_code:
        try:
            ns: Dict[str, Any] = {}
            exec(compile(func_code, "<mock_func>", "exec"), ns)  # noqa: S102
            if "mock" in ns:
                result = ns["mock"](flow)
                if isinstance(result, tuple) and len(result) == 3:
                    status, hdrs, body = result
                elif isinstance(result, dict):
                    status = result.get("status", 200)
                    hdrs = result.get("headers", {})
                    body = result.get("body", "")
                else:
                    status, hdrs, body = 200, {}, str(result)
                if isinstance(body, str):
                    body = body.encode("utf-8")
                if isinstance(hdrs, list):
                    hdrs = {str(k): str(v) for k, v in hdrs}
                flow.response = http.Response.make(int(status), body, hdrs)
                return
        except Exception as exc:
            log.warning(f"[dashboard] mock func error: {exc}")

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
        "intercepted": bool(flow.intercepted),
        "breakpoint_name": flow.metadata.get("breakpoint"),
        "breakpoint_phase": flow.metadata.get("breakpoint_phase"),
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
        self.finish(json.dumps({
            "mocks": self.store.list_mocks(),
            "groups": self.store.list_groups(),
        }))

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


class MockReorderHandler(_CorsHandler):
    def post(self) -> None:
        try:
            items = json.loads(self.request.body or b"[]")
        except Exception:
            self.set_status(400)
            self.finish(json.dumps({"error": "invalid JSON"}))
            return
        for item in items:
            mid = str(item.get("id", ""))
            if mid in self.store.mocks:
                gid = item.get("group_id")
                self.store.mocks[mid]["group_id"] = str(gid) if gid else None
                self.store.mocks[mid]["order"] = int(item.get("order", 0))
        self.store._save_mocks()
        self.store._broadcast_mocks()
        self.finish(json.dumps({"ok": True}))


class GroupsHandler(_CorsHandler):
    def get(self) -> None:
        self.finish(json.dumps({"groups": self.store.list_groups()}))

    def post(self) -> None:
        try:
            data = json.loads(self.request.body or b"{}")
        except Exception:
            self.set_status(400)
            self.finish(json.dumps({"error": "invalid JSON"}))
            return
        self.finish(json.dumps(self.store.upsert_group(data)))


class GroupItemHandler(_CorsHandler):
    def delete(self, group_id: str) -> None:
        self.store.delete_group(group_id)
        self.finish(json.dumps({"ok": True}))


class BreakpointsHandler(_CorsHandler):
    def get(self) -> None:
        self.finish(json.dumps({"breakpoints": self.store.list_breakpoints()}))

    def post(self) -> None:
        try:
            data = json.loads(self.request.body or b"{}")
        except Exception:
            self.set_status(400)
            self.finish(json.dumps({"error": "invalid JSON"}))
            return
        self.finish(json.dumps(self.store.upsert_breakpoint(data)))


class BreakpointItemHandler(_CorsHandler):
    def delete(self, bp_id: str) -> None:
        self.store.delete_breakpoint(bp_id)
        self.finish(json.dumps({"ok": True}))


class ResumeFlowHandler(_CorsHandler):
    def post(self, flow_id: str) -> None:
        flow = self.store.intercepted_flows.get(flow_id)
        if flow is None:
            self.set_status(404)
            self.finish(json.dumps({"error": "not found"}))
            return
        flow.resume()
        self.store.intercepted_flows.pop(flow_id, None)
        self.store._broadcast({"type": "flow", "data": _flow_summary(flow)})
        self.finish(json.dumps({"ok": True}))


class AbortFlowHandler(_CorsHandler):
    def post(self, flow_id: str) -> None:
        flow = self.store.intercepted_flows.pop(flow_id, None)
        if flow is None:
            self.set_status(404)
            self.finish(json.dumps({"error": "not found"}))
            return
        flow.kill()
        self.store._broadcast({"type": "flow", "data": _flow_summary(flow)})
        self.finish(json.dumps({"ok": True}))


class EditResumeFlowHandler(_CorsHandler):
    def post(self, flow_id: str) -> None:
        flow = self.store.intercepted_flows.get(flow_id)
        if flow is None:
            self.set_status(404)
            self.finish(json.dumps({"error": "not found or not intercepted"}))
            return
        try:
            data = json.loads(self.request.body or b"{}")
        except Exception:
            self.set_status(400)
            self.finish(json.dumps({"error": "invalid JSON"}))
            return
        phase = flow.metadata.get("breakpoint_phase", "request")
        if phase == "request":
            req_data = data.get("request", {})
            if "method" in req_data:
                flow.request.method = str(req_data["method"]).upper()
            if "path" in req_data:
                flow.request.path = str(req_data["path"])
            if "headers" in req_data:
                flow.request.headers.clear()
                for k, v in req_data["headers"].items():
                    flow.request.headers[k] = str(v)
            if "body" in req_data:
                flow.request.set_text(str(req_data.get("body") or ""))
        elif phase == "response" and flow.response:
            resp_data = data.get("response", {})
            if "status_code" in resp_data:
                flow.response.status_code = int(resp_data["status_code"])
            if "headers" in resp_data:
                flow.response.headers.clear()
                for k, v in resp_data["headers"].items():
                    flow.response.headers[k] = str(v)
            if "body" in resp_data:
                flow.response.set_text(str(resp_data.get("body") or ""))
        self.store.intercepted_flows.pop(flow_id, None)
        flow.resume()
        self.store._broadcast({"type": "flow", "data": _flow_summary(flow)})
        self.finish(json.dumps({"ok": True}))


class ResendFlowHandler(_CorsHandler):
    async def post(self, flow_id: str) -> None:
        flow = None
        for f in self.store.flows:
            if f.id == flow_id:
                flow = f
                break
        if flow is None:
            self.set_status(404)
            self.finish(json.dumps({"error": "not found"}))
            return
        try:
            data = json.loads(self.request.body or b"{}")
        except Exception:
            self.set_status(400)
            self.finish(json.dumps({"error": "invalid JSON"}))
            return

        method = str(data.get("method") or flow.request.method).upper()
        url = str(data.get("url") or flow.request.pretty_url)
        user_headers: Optional[Dict[str, str]] = data.get("headers")
        body_text = str(data.get("body") or "")

        skip = {"host", "content-length", "transfer-encoding", "connection", "proxy-connection"}
        if user_headers is not None:
            headers = {k: v for k, v in user_headers.items() if k.lower() not in skip}
        else:
            headers = {k: v for k, v in flow.request.headers.items() if k.lower() not in skip}

        proxy_port = _proxy_port()

        def do_request() -> int:
            ssl_ctx = ssl.create_default_context()
            ssl_ctx.check_hostname = False
            ssl_ctx.verify_mode = ssl.CERT_NONE
            proxy_url = f"http://127.0.0.1:{proxy_port}"
            opener = urllib.request.build_opener(
                urllib.request.ProxyHandler({"http": proxy_url, "https": proxy_url}),
                urllib.request.HTTPSHandler(context=ssl_ctx),
            )
            req = urllib.request.Request(
                url,
                method=method,
                headers=headers,
                data=body_text.encode("utf-8") if body_text else None,
            )
            try:
                resp = opener.open(req, timeout=30)
                return resp.status  # type: ignore[attr-defined]
            except urllib.error.HTTPError as e:
                return e.code
            except Exception:
                return 0

        status = await tornado.ioloop.IOLoop.current().run_in_executor(None, do_request)
        self.finish(json.dumps({"status": status}))


class StopProxyHandler(_CorsHandler):
    async def post(self) -> None:
        self.finish(json.dumps({"ok": True}))
        tornado.ioloop.IOLoop.current().call_later(0.2, lambda: os.kill(os.getpid(), signal.SIGTERM))


class FlowSocket(tornado.websocket.WebSocketHandler):
    def check_origin(self, origin: str) -> bool:
        return True

    @property
    def store(self) -> "DashboardAddon":
        return self.application.settings["store"]

    def open(self) -> None:
        self.store.clients.add(self)
        self.write_message(json.dumps({"type": "stats", "data": self.store.stats()}))
        self.write_message(json.dumps({"type": "mocks", "data": {
            "rules": self.store.list_mocks(),
            "groups": self.store.list_groups(),
        }}))
        self.write_message(json.dumps({"type": "breakpoints", "data": self.store.list_breakpoints()}))

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
        self.groups: "Dict[str, Dict[str, Any]]" = {}
        self.breakpoints: "Dict[str, Dict[str, Any]]" = {}
        self.intercepted_flows: "Dict[str, http.HTTPFlow]" = {}
        self._app: Optional[tornado.web.Application] = None
        self._server = None
        self.max_flows = 5000
        self.body_limit = 65536
        self._load_mocks()
        self._load_breakpoints()

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
                (r"/api/mocks/reorder", MockReorderHandler),
                (r"/api/mocks/([^/]+)", MockItemHandler),
                (r"/api/groups", GroupsHandler),
                (r"/api/groups/([^/]+)", GroupItemHandler),
                (r"/api/breakpoints", BreakpointsHandler),
                (r"/api/breakpoints/([^/]+)", BreakpointItemHandler),
                (r"/api/flows/([^/]+)/resume", ResumeFlowHandler),
                (r"/api/flows/([^/]+)/abort", AbortFlowHandler),
                (r"/api/flows/([^/]+)/edit-resume", EditResumeFlowHandler),
                (r"/api/flows/([^/]+)/resend", ResendFlowHandler),
                (r"/api/proxy/stop", StopProxyHandler),
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
                self._broadcast_mocks()
                break
        # Apply first matching request-phase breakpoint (only if not mocked).
        if not flow.metadata.get("mock"):
            for bp in list(self.breakpoints.values()):
                if bp.get("phase", "request") == "request" and _breakpoint_matches(bp, flow):
                    flow.intercept()
                    flow.metadata["breakpoint"] = bp.get("name") or bp["id"]
                    flow.metadata["breakpoint_phase"] = "request"
                    bp["hits"] = bp.get("hits", 0) + 1
                    self.intercepted_flows[flow.id] = flow
                    max_hits = bp.get("max_hits", 0)
                    if max_hits > 0 and bp["hits"] >= max_hits:
                        bp["enabled"] = False
                        self._save_breakpoints()
                    timeout_s = bp.get("timeout_s", 0)
                    if timeout_s > 0:
                        fid = flow.id
                        import asyncio
                        asyncio.get_event_loop().call_later(timeout_s, lambda: self._auto_resume(fid))
                    self._broadcast({"type": "breakpoints", "data": self.list_breakpoints()})
                    break
        if flow not in self.flows:
            self.flows.append(flow)
            self._trim()
        self._broadcast({"type": "flow", "data": _flow_summary(flow)})

    def response(self, flow: http.HTTPFlow) -> None:
        # Apply first matching response-phase breakpoint (only if not mocked/already intercepted).
        if not flow.metadata.get("mock") and not flow.metadata.get("breakpoint"):
            for bp in list(self.breakpoints.values()):
                if bp.get("phase") == "response" and _breakpoint_matches(bp, flow):
                    flow.intercept()
                    flow.metadata["breakpoint"] = bp.get("name") or bp["id"]
                    flow.metadata["breakpoint_phase"] = "response"
                    bp["hits"] = bp.get("hits", 0) + 1
                    self.intercepted_flows[flow.id] = flow
                    max_hits = bp.get("max_hits", 0)
                    if max_hits > 0 and bp["hits"] >= max_hits:
                        bp["enabled"] = False
                        self._save_breakpoints()
                    timeout_s = bp.get("timeout_s", 0)
                    if timeout_s > 0:
                        fid = flow.id
                        import asyncio
                        asyncio.get_event_loop().call_later(timeout_s, lambda: self._auto_resume(fid))
                    self._broadcast({"type": "breakpoints", "data": self.list_breakpoints()})
                    break
        self._record(flow)

    def error(self, flow: http.HTTPFlow) -> None:
        self.intercepted_flows.pop(flow.id, None)
        self._record(flow)

    def _auto_resume(self, flow_id: str) -> None:
        flow = self.intercepted_flows.pop(flow_id, None)
        if flow and flow.intercepted:
            flow.resume()
            self._broadcast({"type": "flow", "data": _flow_summary(flow)})

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
        return sorted(self.mocks.values(), key=lambda r: r.get("order", 0))

    def list_groups(self) -> List[Dict[str, Any]]:
        return sorted(self.groups.values(), key=lambda g: g.get("order", 0))

    def upsert_mock(self, data: Dict[str, Any]) -> Dict[str, Any]:
        existing = self.mocks.get(str(data.get("id") or ""), {})
        rule = _normalize_mock(data, existing.get("hits", 0))
        self.mocks[rule["id"]] = rule
        self._save_mocks()
        self._broadcast_mocks()
        return rule

    def delete_mock(self, mock_id: str) -> None:
        self.mocks.pop(mock_id, None)
        self._save_mocks()
        self._broadcast_mocks()

    def upsert_group(self, data: Dict[str, Any]) -> Dict[str, Any]:
        existing = self.groups.get(str(data.get("id") or ""), {})
        group = _normalize_group({**existing, **data})
        self.groups[group["id"]] = group
        self._save_mocks()
        self._broadcast_mocks()
        return group

    def delete_group(self, group_id: str) -> None:
        self.groups.pop(group_id, None)
        for rule in self.mocks.values():
            if rule.get("group_id") == group_id:
                rule["group_id"] = None
        self._save_mocks()
        self._broadcast_mocks()

    def _broadcast_mocks(self) -> None:
        self._broadcast({"type": "mocks", "data": {
            "rules": self.list_mocks(),
            "groups": self.list_groups(),
        }})

    # --- breakpoint rules ---
    def list_breakpoints(self) -> List[Dict[str, Any]]:
        return list(self.breakpoints.values())

    def upsert_breakpoint(self, data: Dict[str, Any]) -> Dict[str, Any]:
        existing = self.breakpoints.get(str(data.get("id") or ""), {})
        bp = _normalize_breakpoint({**existing, **data})
        self.breakpoints[bp["id"]] = bp
        self._save_breakpoints()
        self._broadcast({"type": "breakpoints", "data": self.list_breakpoints()})
        return bp

    def delete_breakpoint(self, bp_id: str) -> None:
        self.breakpoints.pop(bp_id, None)
        self._save_breakpoints()
        self._broadcast({"type": "breakpoints", "data": self.list_breakpoints()})

    def _load_breakpoints(self) -> None:
        try:
            with open(BREAKPOINT_FILE, "r", encoding="utf-8") as fh:
                for bp in json.load(fh):
                    norm = _normalize_breakpoint(bp)
                    self.breakpoints[norm["id"]] = norm
        except FileNotFoundError:
            pass
        except Exception as exc:
            log.warning(f"[dashboard] could not load breakpoints: {exc}")

    def _save_breakpoints(self) -> None:
        try:
            with open(BREAKPOINT_FILE, "w", encoding="utf-8") as fh:
                json.dump(self.list_breakpoints(), fh, indent=2)
        except Exception as exc:
            log.warning(f"[dashboard] could not save breakpoints: {exc}")

    def _load_mocks(self) -> None:
        try:
            with open(MOCK_FILE, "r", encoding="utf-8") as fh:
                raw = json.load(fh)
            # Support both old format (plain array) and new format (object with version key)
            if isinstance(raw, list):
                rules, groups = raw, []
            else:
                rules = raw.get("rules", [])
                groups = raw.get("groups", [])
            for g in groups:
                norm = _normalize_group(g)
                self.groups[norm["id"]] = norm
            for rule in rules:
                norm = _normalize_mock(rule, rule.get("hits", 0))
                self.mocks[norm["id"]] = norm
        except FileNotFoundError:
            pass
        except Exception as exc:
            log.warning(f"[dashboard] could not load mocks: {exc}")

    def _save_mocks(self) -> None:
        try:
            with open(MOCK_FILE, "w", encoding="utf-8") as fh:
                json.dump({
                    "version": 2,
                    "groups": self.list_groups(),
                    "rules": self.list_mocks(),
                }, fh, indent=2)
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
