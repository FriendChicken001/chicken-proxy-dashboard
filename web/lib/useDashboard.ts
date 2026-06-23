"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchFlows, fetchMocks, fetchStats, WS_URL } from "./api";
import type { FlowSummary, MockRule, Stats } from "./types";

const MAX_ROWS = 5000;

export type ConnState = "connecting" | "live" | "offline";

export function useDashboard() {
  const [flows, setFlows] = useState<FlowSummary[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [mocks, setMocks] = useState<MockRule[]>([]);
  const [conn, setConn] = useState<ConnState>("connecting");
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  const upsert = useCallback((flow: FlowSummary) => {
    if (pausedRef.current) return;
    setFlows((prev) => {
      const idx = prev.findIndex((f) => f.id === flow.id);
      if (idx === -1) return [flow, ...prev].slice(0, MAX_ROWS);
      const next = prev.slice();
      next[idx] = flow;
      return next;
    });
  }, []);

  const reload = useCallback(async () => {
    try {
      const [f, s, m] = await Promise.all([
        fetchFlows(),
        fetchStats(),
        fetchMocks(),
      ]);
      setFlows(f);
      setStats(s);
      setMocks(m);
    } catch {
      /* server may be down; ws lifecycle handles state */
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    const connect = () => {
      setConn("connecting");
      try {
        ws = new WebSocket(WS_URL);
      } catch {
        setConn("offline");
        retry = setTimeout(connect, 2000);
        return;
      }
      ws.onopen = () => {
        setConn("live");
        reload();
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === "flow") upsert(msg.data as FlowSummary);
          else if (msg.type === "stats" && !pausedRef.current)
            setStats(msg.data as Stats);
          else if (msg.type === "mocks") setMocks(msg.data as MockRule[]);
        } catch {
          /* ignore malformed frame */
        }
      };
      ws.onclose = () => {
        if (closed) return;
        setConn("offline");
        retry = setTimeout(connect, 2000);
      };
      ws.onerror = () => ws?.close();
    };

    connect();
    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      ws?.close();
    };
  }, [reload, upsert]);

  const clear = useCallback(() => {
    setFlows([]);
  }, []);

  return { flows, stats, mocks, conn, paused, setPaused, reload, clear };
}
