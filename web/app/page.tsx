"use client";

import { useEffect, useMemo, useState } from "react";
import { useDashboard } from "@/lib/useDashboard";
import { clearFlows, fetchConnection } from "@/lib/api";
import type { Connection, FlowSummary } from "@/lib/types";
import StatsBar from "@/components/StatsBar";
import Charts from "@/components/Charts";
import FlowTable from "@/components/FlowTable";
import FlowDetailDrawer from "@/components/FlowDetail";
import ConnectModal from "@/components/ConnectModal";
import MockModal from "@/components/MockModal";
import ContextMenu from "@/components/ContextMenu";
import DiffModal from "@/components/DiffModal";
import type { MockRule } from "@/lib/types";
import { fetchFlowDetail } from "@/lib/api";
import { draftFromDetail, draftFromSummary, toCurl } from "@/lib/mockDraft";

type Filter = "all" | "2xx" | "errors" | "mocked" | "http";

export default function Page() {
  const { flows, stats, mocks, conn, paused, setPaused, reload, clear } =
    useDashboard();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<FlowSummary | null>(null);
  const [showConnect, setShowConnect] = useState(false);
  const [mockOpen, setMockOpen] = useState(false);
  const [mockDraft, setMockDraft] = useState<Partial<MockRule> | null>(null);
  const [connection, setConnection] = useState<Connection | null>(null);
  const [portInput, setPortInput] = useState<string>("");
  const [highlightedHost, setHighlightedHost] = useState<string | null>(null);
  const [diffBase, setDiffBase] = useState<FlowSummary | null>(null);
  const [diffTarget, setDiffTarget] = useState<FlowSummary | null>(null);
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());
  const [bodySearch, setBodySearch] = useState(false);
  const [bodyCache, setBodyCache] = useState<Record<string, string>>({});
  const [bodyFetching, setBodyFetching] = useState(false);

  useEffect(() => {
    fetchConnection()
      .then((c) => { setConnection(c); setPortInput(String(c.proxy_port)); })
      .catch(() => {});
  }, []);

  const proxyPort = parseInt(portInput, 10) || connection?.proxy_port || 8080;
  const portValid = /^\d{1,5}$/.test(portInput) && proxyPort >= 1 && proxyPort <= 65535;
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    flow: FlowSummary;
  } | null>(null);

  const onPin = (id: string) => setPinnedIds(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  useEffect(() => {
    if (!bodySearch) return;
    const missing = flows.filter(f => !(f.id in bodyCache));
    if (missing.length === 0) return;
    setBodyFetching(true);
    Promise.all(missing.map(f => fetchFlowDetail(f.id).then(d => ({
      id: f.id,
      text: (d.request_body?.text ?? '') + ' ' + (d.response_body?.text ?? ''),
    })).catch(() => ({ id: f.id, text: '' }))))
      .then(results => {
        setBodyCache(prev => {
          const next = { ...prev };
          for (const r of results) next[r.id] = r.text;
          return next;
        });
      })
      .finally(() => setBodyFetching(false));
  }, [bodySearch, flows]); // eslint-disable-line react-hooks/exhaustive-deps

  const openMocks = (draft: Partial<MockRule> | null) => {
    setMockDraft(draft);
    setMockOpen(true);
  };

  // Right-click "Mock": fetch full detail so the body prefills, with a
  // summary-only fallback if the flow has already been trimmed.
  const mockFromFlow = async (flow: FlowSummary) => {
    try {
      const detail = await fetchFlowDetail(flow.id);
      openMocks(draftFromDetail(detail));
    } catch {
      openMocks(draftFromSummary(flow));
    }
  };

  const copyCurl = async (flow: FlowSummary) => {
    try {
      const detail = await fetchFlowDetail(flow.id);
      await navigator.clipboard.writeText(toCurl(detail));
    } catch {
      /* clipboard blocked or flow gone */
    }
  };

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return flows.filter((f) => {
      if (highlightedHost && f.host !== highlightedHost) return false;
      if (filter === "mocked" && !f.mocked) return false;
      if (filter === "2xx" && !(f.status_code && f.status_code >= 200 && f.status_code < 300)) return false;
      if (
        filter === "errors" &&
        !(f.error || (f.status_code && f.status_code >= 400))
      )
        return false;
      if (filter === "http" && f.scheme !== "http") return false;
      if (q && !(`${f.host}${f.path}${f.method}`.toLowerCase().includes(q))) {
        if (bodySearch) {
          const cached = bodyCache[f.id];
          if (cached === undefined) return true; // not yet cached, include
          if (!cached.toLowerCase().includes(q)) return false;
        } else {
          return false;
        }
      }
      return true;
    });
  }, [flows, query, filter, highlightedHost, bodySearch, bodyCache]);

  const onClear = async () => {
    await clearFlows();
    clear();
    setSelected(null);
  };

  return (
    <div className="app">
      <header className="topbar">

        <div className={`topbar-status ${conn}`}>
          <span className="led" />
          <span className="topbar-status-label">
            {conn === "live" ? "Live" : conn === "connecting" ? "Connecting…" : "Offline"}
          </span>
          {connection && (
            <>
              <span className="topbar-status-divider" />
              <span className="topbar-status-ip mono">{connection.lan_ip}</span>
              <span className="topbar-status-colon">:</span>
              <input
                className={`topbar-port-input${portValid ? "" : " port-invalid"}`}
                value={portInput}
                onChange={(e) => setPortInput(e.target.value)}
                inputMode="numeric"
                maxLength={5}
                title="Proxy port"
              />
            </>
          )}
        </div>

        <div className="spacer" />
        <button className="btn" onClick={() => openMocks(null)}>
          🐔 Mocks{mocks.length ? ` (${mocks.length})` : ""}
        </button>
        <button className="btn primary" onClick={() => setShowConnect(true)}>
          📱 Connect devices
        </button>
        <button
          className={`icon-btn${paused ? " icon-btn-amber" : ""}`}
          onClick={() => setPaused(!paused)}
          title={paused ? "Resume capture" : "Pause capture"}
        >
          {paused ? "▶" : "⏸"}
        </button>
        <button
          className="icon-btn"
          onClick={() => reload()}
          title="Refresh"
        >
          ↻
        </button>
      </header>

      <StatsBar stats={stats} />
      <Charts
        stats={stats}
        highlightedHost={highlightedHost}
        onHighlight={setHighlightedHost}
      />

      <div className="toolbar">
        <input
          className="search"
          placeholder="Filter by host, path, or method…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          className={`body-btn${bodySearch ? ' on' : ''}`}
          onClick={() => setBodySearch(v => !v)}
          title="Search in request/response bodies"
        >
          {bodyFetching ? <span className="body-btn-spinner">↻</span> : null}
          Body
        </button>

        <div className="toolbar-divider" />

        <div className="filters">
          {(
            [
              ["all", "All"],
              ["2xx", "Success"],
              ["errors", "Error"],
              ["mocked", "Mock"],
              ["http", "ClearText"],
            ] as [Filter, string][]
          ).map(([key, label]) => (
            <span
              key={key}
              className={`chip ${filter === key ? "on" : ""}`}
              onClick={() => setFilter(key)}
            >
              {label}
            </span>
          ))}
        </div>
        <div className="spacer" />
        <span className="count-note">
          {visible.length} / {flows.length} flows
          {paused ? " · paused" : ""}
        </span>
        <button
          className="ctrl-btn danger"
          onClick={onClear}
          title="Clear all flows"
          style={{ borderRadius: 7, border: "1px solid var(--border)", background: "var(--panel)" }}
        >
          🗑 Clear
        </button>
      </div>

      <FlowTable
        flows={visible}
        selectedId={selected?.id ?? null}
        onSelect={setSelected}
        onContext={(e, f) => {
          e.preventDefault();
          setMenu({ x: e.clientX, y: e.clientY, flow: f });
        }}
        pinnedIds={pinnedIds}
        onPin={onPin}
      />

      {selected && (
        <FlowDetailDrawer
          flowId={selected.id}
          onClose={() => setSelected(null)}
          onMock={(draft) => openMocks(draft)}
        />
      )}

      {showConnect && <ConnectModal onClose={() => setShowConnect(false)} port={proxyPort} />}

      {mockOpen && (
        <MockModal
          mocks={mocks}
          initialDraft={mockDraft}
          onClose={() => {
            setMockOpen(false);
            setMockDraft(null);
          }}
        />
      )}

      {diffBase && diffTarget && (
        <DiffModal
          idA={diffBase.id}
          idB={diffTarget.id}
          onClose={() => setDiffTarget(null)}
        />
      )}

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            {
              label: "🐔 Mock this response",
              onClick: () => mockFromFlow(menu.flow),
            },
            { label: "🔍 Open details", onClick: () => setSelected(menu.flow) },
            { separator: true, label: "", onClick: () => {} },
            diffBase && diffBase.id !== menu.flow.id
              ? { label: `⚡ Diff with "${diffBase.path.slice(0,30)}"`, onClick: () => setDiffTarget(menu.flow) }
              : { label: diffBase?.id === menu.flow.id ? "✓ Set as diff base" : "⚡ Set as diff base", onClick: () => setDiffBase(menu.flow) },
            { separator: true, label: "", onClick: () => {} },
            {
              label: "📋 Copy URL",
              onClick: () =>
                navigator.clipboard?.writeText(menu.flow.url).catch(() => {}),
            },
            { label: "📋 Copy as cURL", onClick: () => copyCurl(menu.flow) },
          ]}
        />
      )}
    </div>
  );
}
