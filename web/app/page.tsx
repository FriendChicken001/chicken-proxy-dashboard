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
          if (cached === undefined) return true;
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

  const ledColor =
    conn === "live" ? "bg-[var(--green)] shadow-[0_0_8px_var(--green)]" :
    conn === "connecting" ? "bg-[var(--amber)]" :
    conn === "offline" ? "bg-[var(--red)]" :
    "bg-[var(--faint)]";

  const statusBorderColor =
    conn === "live" ? "border-[color-mix(in_srgb,var(--green)_30%,var(--border))]" :
    conn === "offline" ? "border-[color-mix(in_srgb,var(--red)_30%,var(--border))]" :
    "border-[var(--border)]";

  const statusLabelColor =
    conn === "live" ? "text-[var(--green)]" :
    conn === "offline" ? "text-[var(--red)]" :
    "text-[var(--muted)]";

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <header className="flex items-center gap-4 px-5 py-3 border-b border-[var(--border)] bg-[var(--bg-2)]">

        <div className={`inline-flex items-center gap-[7px] px-[14px] py-[5px] border rounded-full bg-[var(--panel)] text-xs text-[var(--muted)] whitespace-nowrap ${statusBorderColor}`}>
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${ledColor}`} />
          <span className={statusLabelColor}>
            {conn === "live" ? "Live" : conn === "connecting" ? "Connecting…" : "Offline"}
          </span>
          {connection && (
            <>
              <span className="w-px h-[14px] bg-[var(--border)] mx-[2px]" />
              <span className="text-[var(--text)] text-xs font-mono">{connection.lan_ip}</span>
              <span className="text-[var(--faint)]">:</span>
              <input
                className={`bg-transparent border-none outline-none font-mono text-xs w-11 p-0 ${portValid ? "text-[var(--text)]" : "text-[var(--red)]"}`}
                value={portInput}
                onChange={(e) => setPortInput(e.target.value)}
                inputMode="numeric"
                maxLength={5}
                title="Proxy port"
              />
            </>
          )}
        </div>

        <div className="flex-1" />
        <button
          className="bg-[var(--panel-2)] text-[var(--text)] border border-[var(--border)] rounded-[7px] px-3 py-[6px] text-xs cursor-pointer hover:bg-[#232c3d] transition-colors"
          onClick={() => openMocks(null)}
        >
          🐔 Mocks{mocks.length ? ` (${mocks.length})` : ""}
        </button>
        <button
          className="bg-[var(--panel-2)] text-[var(--accent)] border border-[var(--accent)] rounded-[7px] px-3 py-[6px] text-xs cursor-pointer hover:bg-[#1c2740] transition-colors"
          onClick={() => setShowConnect(true)}
        >
          📱 Connect devices
        </button>
        <button
          className={`inline-flex items-center justify-center w-8 h-8 rounded-lg p-0 border text-base leading-none cursor-pointer transition-colors ${
            paused
              ? "bg-[var(--panel)] border-[color-mix(in_srgb,var(--amber)_40%,var(--border))] text-[var(--amber)] hover:bg-[color-mix(in_srgb,var(--amber)_10%,transparent)] hover:border-[var(--amber)]"
              : "bg-[var(--panel)] border-[var(--border)] text-[var(--muted)] hover:bg-[var(--panel-2)] hover:text-[var(--text)] hover:border-[var(--accent)]"
          }`}
          onClick={() => setPaused(!paused)}
          title={paused ? "Resume capture" : "Pause capture"}
        >
          {paused ? "▶" : "⏸"}
        </button>
        <button
          className="inline-flex items-center justify-center w-8 h-8 rounded-lg p-0 bg-[var(--panel)] border border-[var(--border)] text-[var(--muted)] text-base leading-none cursor-pointer hover:bg-[var(--panel-2)] hover:text-[var(--text)] hover:border-[var(--accent)] transition-colors"
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

      <div className="flex items-center gap-[10px] px-5 pb-3 pt-[6px]">
        <input
          className="flex-1 max-w-[420px] bg-[var(--panel)] border border-[var(--border)] rounded-[7px] px-[11px] py-[7px] text-[var(--text)] text-[13px] outline-none focus:border-[var(--accent)]"
          placeholder="Filter by host, path, or method…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          className={`inline-flex items-center gap-[5px] px-[11px] py-[7px] rounded-[7px] text-[13px] cursor-pointer border whitespace-nowrap transition-colors ${
            bodySearch
              ? "text-[var(--accent)] border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]"
              : "bg-[var(--panel)] border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--accent)]"
          }`}
          onClick={() => setBodySearch(v => !v)}
          title="Search in request/response bodies"
        >
          {bodyFetching ? <span className="inline-block text-[11px]" style={{ animation: "spin .7s linear infinite" }}>↻</span> : null}
          Body
        </button>

        <div className="w-px h-5 bg-[var(--border)] flex-shrink-0" />

        <div className="flex gap-[6px]">
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
              className={`text-[11px] px-[10px] py-[5px] rounded-full cursor-pointer border ${
                filter === key
                  ? "text-[var(--text)] border-[var(--accent)] bg-[var(--panel-2)]"
                  : "border-[var(--border)] bg-[var(--panel)] text-[var(--muted)]"
              }`}
              onClick={() => setFilter(key)}
            >
              {label}
            </span>
          ))}
        </div>
        <div className="flex-1" />
        <span className="text-[var(--faint)] text-xs">
          {visible.length} / {flows.length} flows
          {paused ? " · paused" : ""}
        </span>
        <button
          className="inline-flex items-center gap-[5px] bg-[var(--panel)] border border-[var(--border)] text-[var(--muted)] text-xs cursor-pointer px-[10px] py-[5px] rounded-[7px] whitespace-nowrap hover:text-[var(--red)] transition-colors"
          onClick={onClear}
          title="Clear all flows"
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
