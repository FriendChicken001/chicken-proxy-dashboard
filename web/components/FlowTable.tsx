"use client";

import type { MouseEvent } from "react";
import type { FlowSummary } from "@/lib/types";
import { bytes, clockTime, ms, statusClass } from "@/lib/format";

const methodColors: Record<string, string> = {
  GET: "bg-[#1c2c44] text-[#7eb0ff]",
  POST: "bg-[#14342a] text-[#4ade80]",
  PUT: "bg-[#34290f] text-[#fbbf24]",
  DELETE: "bg-[#361a1a] text-[#f87171]",
};
const methodColorFallback = "bg-[#2a2440] text-[#c4b5fd]";

function methodClass(method: string): string {
  return methodColors[method] ?? methodColorFallback;
}

const statusColors: Record<string, string> = {
  "s-2": "text-[var(--green)]",
  "s-3": "text-[var(--accent)]",
  "s-4": "text-[var(--amber)]",
  "s-5": "text-[var(--red)]",
  "s-pending": "text-[var(--faint)]",
};

function statusColorClass(code: number | null): string {
  const cls = statusClass(code);
  return statusColors[cls] ?? "text-[var(--faint)]";
}

export default function FlowTable({
  flows,
  selectedId,
  onSelect,
  onContext,
  pinnedIds,
  onPin,
}: {
  flows: FlowSummary[];
  selectedId: string | null;
  onSelect: (f: FlowSummary) => void;
  onContext: (e: MouseEvent, f: FlowSummary) => void;
  pinnedIds: Set<string>;
  onPin: (id: string) => void;
}) {
  const sorted = [...flows].sort((a, b) => (pinnedIds.has(b.id) ? 1 : 0) - (pinnedIds.has(a.id) ? 1 : 0));

  if (flows.length === 0) {
    return (
      <div className="flex-1 overflow-auto px-5 pb-5">
        <div className="text-[var(--faint)] text-center py-[60px] px-5">
          All quiet here. Route traffic through the proxy to get started.
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto px-5 pb-5">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr>
            <th className="sticky top-0 z-[2] bg-[var(--bg-2)] text-[var(--muted)] text-left font-medium text-[11px] uppercase tracking-[0.03em] px-[10px] py-[9px] border-b border-[var(--border)]" style={{ width: 28 }}></th>
            <th className="sticky top-0 z-[2] bg-[var(--bg-2)] text-[var(--muted)] text-left font-medium text-[11px] uppercase tracking-[0.03em] px-[10px] py-[9px] border-b border-[var(--border)]" style={{ width: 36 }}></th>
            <th className="sticky top-0 z-[2] bg-[var(--bg-2)] text-[var(--muted)] text-left font-medium text-[11px] uppercase tracking-[0.03em] px-[10px] py-[9px] border-b border-[var(--border)]" style={{ width: 80 }}>Time</th>
            <th className="sticky top-0 z-[2] bg-[var(--bg-2)] text-[var(--muted)] text-left font-medium text-[11px] uppercase tracking-[0.03em] px-[10px] py-[9px] border-b border-[var(--border)]" style={{ width: 70 }}>Method</th>
            <th className="sticky top-0 z-[2] bg-[var(--bg-2)] text-[var(--muted)] text-left font-medium text-[11px] uppercase tracking-[0.03em] px-[10px] py-[9px] border-b border-[var(--border)]" style={{ width: 60 }}>Status</th>
            <th className="sticky top-0 z-[2] bg-[var(--bg-2)] text-[var(--muted)] text-left font-medium text-[11px] uppercase tracking-[0.03em] px-[10px] py-[9px] border-b border-[var(--border)]">Host / Path</th>
            <th className="sticky top-0 z-[2] bg-[var(--bg-2)] text-[var(--muted)] text-left font-medium text-[11px] uppercase tracking-[0.03em] px-[10px] py-[9px] border-b border-[var(--border)]" style={{ width: 90 }}>Type</th>
            <th className="sticky top-0 z-[2] bg-[var(--bg-2)] text-[var(--muted)] text-left font-medium text-[11px] uppercase tracking-[0.03em] px-[10px] py-[9px] border-b border-[var(--border)] text-right" style={{ width: 70 }}>Size</th>
            <th className="sticky top-0 z-[2] bg-[var(--bg-2)] text-[var(--muted)] text-left font-medium text-[11px] uppercase tracking-[0.03em] px-[10px] py-[9px] border-b border-[var(--border)] text-right" style={{ width: 70 }}>Time</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((f) => {
            const isPinned = pinnedIds.has(f.id);
            const isSelected = f.id === selectedId;
            const rowBg = isSelected
              ? "bg-[var(--panel-2)]"
              : f.intercepted
              ? "bg-[color-mix(in_srgb,var(--amber)_6%,transparent)] hover:bg-[color-mix(in_srgb,var(--amber)_10%,transparent)]"
              : isPinned
              ? "bg-[color-mix(in_srgb,var(--accent)_5%,transparent)]"
              : "hover:bg-[var(--panel)]";
            return (
              <tr
                key={f.id}
                className={`border-b border-[var(--bg-2)] cursor-pointer group ${rowBg}`}
                onClick={() => onSelect(f)}
                onContextMenu={(e) => onContext(e, f)}
              >
                <td className="px-[10px] py-[7px] align-middle">
                  <button
                    className={`bg-none border-none cursor-pointer px-1 py-[2px] text-[13px] transition-all ${
                      isPinned ? "opacity-100 text-[var(--accent)]" : "opacity-0 group-hover:opacity-100 text-[var(--faint)]"
                    }`}
                    title="Pin"
                    onClick={(e) => { e.stopPropagation(); onPin(f.id); }}
                  >
                    {isPinned ? '📌' : '⊙'}
                  </button>
                </td>
                <td className="px-[10px] py-[7px] align-middle">
                  {f.intercepted && (
                    <span className="inline-flex items-center text-[11px] px-1 text-[var(--amber)]" title={f.breakpoint_name ?? "intercepted"}>
                      ⏸
                    </span>
                  )}
                  {f.mocked && !f.intercepted && (
                    <span className="inline-flex items-center gap-1 text-[11px] px-1 mr-1" title={f.mock_name ?? "mocked"}>
                      🐔
                    </span>
                  )}
                </td>
                <td className="px-[10px] py-[7px] align-middle font-mono text-xs text-[var(--muted)]">{clockTime(f.time_start)}</td>
                <td className="px-[10px] py-[7px] align-middle">
                  <span className={`font-mono text-[11px] font-semibold px-[7px] py-[2px] rounded-[5px] inline-block min-w-[48px] text-center ${methodClass(f.method)}`}>{f.method}</span>
                </td>
                <td className="px-[10px] py-[7px] align-middle">
                  {f.error ? (
                    <span className="tabular-nums font-mono text-xs text-[var(--red)]" title={f.error}>
                      ERR
                    </span>
                  ) : (
                    <span className={`tabular-nums font-mono text-xs ${statusColorClass(f.status_code)}`}>
                      {f.status_code ?? "···"}
                    </span>
                  )}
                </td>
                <td className="px-[10px] py-[7px] align-middle">
                  <div className="text-[var(--text)] max-w-[460px] overflow-hidden text-ellipsis whitespace-nowrap">
                    <span className={f.scheme === "http" ? "text-[var(--orange)]" : "text-[var(--muted)]"}>
                      {f.scheme === "http" ? "⚠ " : ""}
                      {f.host}
                    </span>
                    <span className="font-mono text-xs"> {f.path}</span>
                  </div>
                </td>
                <td className="px-[10px] py-[7px] align-middle font-mono text-xs text-[var(--muted)]">{f.content_type ?? "—"}</td>
                <td className="px-[10px] py-[7px] align-middle font-mono text-xs text-[var(--muted)] text-right">
                  {bytes(f.response_size)}
                </td>
                <td className="px-[10px] py-[7px] align-middle font-mono text-xs text-[var(--muted)] text-right">
                  {ms(f.duration_ms)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
