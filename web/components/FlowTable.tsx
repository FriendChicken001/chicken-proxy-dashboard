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
  diffBaseId,
}: {
  flows: FlowSummary[];
  selectedId: string | null;
  onSelect: (f: FlowSummary) => void;
  onContext: (e: MouseEvent, f: FlowSummary) => void;
  pinnedIds: Set<string>;
  onPin: (id: string) => void;
  diffBaseId: string | null;
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
            <th className="sticky top-0 z-[2] bg-[var(--bg-2)] border-b border-[var(--border)]" style={{ width: 28 }}></th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((f) => {
            const isPinned = pinnedIds.has(f.id);
            const isSelected = f.id === selectedId;
            const isDiffBase = f.id === diffBaseId;
            const rowBg = isSelected
              ? "bg-[var(--panel-2)]"
              : f.intercepted
              ? "bg-[color-mix(in_srgb,var(--amber)_6%,transparent)] hover:bg-[color-mix(in_srgb,var(--amber)_10%,transparent)]"
              : isDiffBase
              ? "bg-[color-mix(in_srgb,var(--purple)_8%,transparent)] hover:bg-[color-mix(in_srgb,var(--purple)_12%,transparent)]"
              : isPinned
              ? "bg-[color-mix(in_srgb,var(--accent)_5%,transparent)]"
              : "hover:bg-[var(--panel)]";
            return (
              <tr
                key={f.id}
                className={`border-b border-[var(--bg-2)] cursor-pointer group ${rowBg}`}
                onClick={() => onSelect(f)}
                onContextMenu={(e) => { e.preventDefault(); onContext(e, f); }}
                onMouseDown={(e) => { if (e.button === 2) { e.preventDefault(); onContext(e, f); } }}
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
                  {isDiffBase && (
                    <span className="inline-flex items-center text-[11px] px-1 text-[var(--purple)]" title="Diff base">⚡</span>
                  )}
                  {f.intercepted && !isDiffBase && (
                    <span className="inline-flex items-center justify-center rounded-[6px] px-[3px] py-[1px]" title={f.breakpoint_name ?? "intercepted"} style={{ background: "color-mix(in srgb, var(--amber) 18%, transparent)" }}>
                      <img src="/chicken-breakpoint.svg" width={32} height={32} alt="breakpoint" style={{ display: "inline-block", verticalAlign: "middle" }} />
                    </span>
                  )}
                  {f.mocked && !f.intercepted && !isDiffBase && (
                    <span className="inline-flex items-center justify-center rounded-[6px] px-[3px] py-[1px]" title={f.mock_name ?? "mocked"} style={{ background: "color-mix(in srgb, var(--accent) 18%, transparent)" }}>
                      <img src="/chicken-icon.svg" width={32} height={32} alt="mocked" style={{ display: "inline-block", verticalAlign: "middle" }} />
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
                <td className="px-[4px] py-[7px] align-middle text-center">
                  <button
                    className="opacity-0 group-hover:opacity-100 bg-transparent border-none text-[var(--muted)] hover:text-[var(--text)] cursor-pointer px-[6px] py-[2px] rounded text-[16px] leading-none transition-all"
                    title="More actions"
                    onClick={(e) => { e.stopPropagation(); onContext(e as unknown as React.MouseEvent, f); }}
                  >⋮</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
