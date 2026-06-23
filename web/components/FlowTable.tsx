"use client";

import type { MouseEvent } from "react";
import type { FlowSummary } from "@/lib/types";
import { bytes, clockTime, ms, statusClass } from "@/lib/format";

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
      <div className="table-wrap">
        <div className="empty">
          All quiet here. Route traffic through the proxy to get started.
        </div>
      </div>
    );
  }

  return (
    <div className="table-wrap">
      <table className="flows">
        <thead>
          <tr>
            <th style={{ width: 28 }}></th>
            <th style={{ width: 36 }}></th>
            <th style={{ width: 80 }}>Time</th>
            <th style={{ width: 70 }}>Method</th>
            <th style={{ width: 60 }}>Status</th>
            <th>Host / Path</th>
            <th style={{ width: 90 }}>Type</th>
            <th style={{ width: 70, textAlign: "right" }}>Size</th>
            <th style={{ width: 70, textAlign: "right" }}>Time</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((f) => (
            <tr
              key={f.id}
              className={[
                f.id === selectedId ? "selected" : "",
                pinnedIds.has(f.id) ? "pinned" : "",
              ].filter(Boolean).join(" ")}
              onClick={() => onSelect(f)}
              onContextMenu={(e) => onContext(e, f)}
            >
              <td>
                <button
                  className={`pin-btn${pinnedIds.has(f.id) ? ' pinned' : ''}`}
                  title="Pin"
                  onClick={(e) => { e.stopPropagation(); onPin(f.id); }}
                >
                  {pinnedIds.has(f.id) ? '📌' : '⊙'}
                </button>
              </td>
              <td>
                {f.mocked && (
                  <span className="mock-tag sm" title={f.mock_name ?? "mocked"}>
                    🐔
                  </span>
                )}
              </td>
              <td className="mono host-cell">{clockTime(f.time_start)}</td>
              <td>
                <span className={`method m-${f.method}`}>{f.method}</span>
              </td>
              <td>
                {f.error ? (
                  <span className="status s-5" title={f.error}>
                    ERR
                  </span>
                ) : (
                  <span className={`status ${statusClass(f.status_code)}`}>
                    {f.status_code ?? "···"}
                  </span>
                )}
              </td>
              <td>
                <div className="path">
                  <span
                    className={f.scheme === "http" ? "scheme-http" : "host-cell"}
                  >
                    {f.scheme === "http" ? "⚠ " : ""}
                    {f.host}
                  </span>
                  <span className="mono"> {f.path}</span>
                </div>
              </td>
              <td className="mono host-cell">{f.content_type ?? "—"}</td>
              <td className="mono host-cell" style={{ textAlign: "right" }}>
                {bytes(f.response_size)}
              </td>
              <td className="mono host-cell" style={{ textAlign: "right" }}>
                {ms(f.duration_ms)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
