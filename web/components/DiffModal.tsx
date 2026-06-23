"use client";

import { useEffect, useState } from "react";
import { fetchFlowDetail } from "@/lib/api";
import type { FlowDetail } from "@/lib/types";
import { statusClass } from "@/lib/format";

type DiffLine =
  | { type: "same";    text: string }
  | { type: "added";   text: string }
  | { type: "removed"; text: string };

function lcs(a: string[], b: string[]): number[][] {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] + 1 : Math.max(dp[i-1][j], dp[i][j-1]);
  return dp;
}

function diffLines(a: string, b: string): DiffLine[] {
  const aLines = a.split("\n");
  const bLines = b.split("\n");
  const dp = lcs(aLines, bLines);
  const result: DiffLine[] = [];
  let i = aLines.length, j = bLines.length;
  const stack: DiffLine[] = [];
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && aLines[i-1] === bLines[j-1]) {
      stack.push({ type: "same", text: aLines[i-1] }); i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j-1] >= dp[i-1][j])) {
      stack.push({ type: "added", text: bLines[j-1] }); j--;
    } else {
      stack.push({ type: "removed", text: aLines[i-1] }); i--;
    }
  }
  return stack.reverse();
}

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
  return statusColors[statusClass(code)] ?? "text-[var(--faint)]";
}

type Tab = "body" | "headers";

export default function DiffModal({
  idA, idB, onClose,
}: {
  idA: string; idB: string; onClose: () => void;
}) {
  const [a, setA] = useState<FlowDetail | null>(null);
  const [b, setB] = useState<FlowDetail | null>(null);
  const [tab, setTab] = useState<Tab>("body");

  useEffect(() => {
    fetchFlowDetail(idA).then(setA).catch(() => {});
    fetchFlowDetail(idB).then(setB).catch(() => {});
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [idA, idB, onClose]);

  const loading = !a || !b;

  const bodyDiff = !loading
    ? diffLines(a.response_body?.text ?? "", b.response_body?.text ?? "")
    : [];

  const headerDiff = !loading
    ? diffLines(
        a.response_headers.map(([k,v]) => `${k}: ${v}`).join("\n"),
        b.response_headers.map(([k,v]) => `${k}: ${v}`).join("\n"),
      )
    : [];

  const lines = tab === "body" ? bodyDiff : headerDiff;
  const added   = lines.filter(l => l.type === "added").length;
  const removed = lines.filter(l => l.type === "removed").length;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-[30]" onClick={onClose} />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(860px,96vw)] max-h-[90vh] overflow-hidden bg-[var(--bg-2)] border border-[var(--border)] rounded-[14px] z-[31] flex flex-col shadow-[0_30px_80px_rgba(0,0,0,0.5)]">
        <div className="flex items-center gap-[10px] px-5 py-4 border-b border-[var(--border)] flex-shrink-0">
          <button
            className="float-none bg-none border-none text-[var(--muted)] text-[16px] cursor-pointer px-[6px] py-[2px] rounded-[5px] hover:text-[var(--text)] hover:bg-[var(--panel-2)] transition-colors"
            onClick={onClose}
          >✕</button>
          <div className="text-[15px] font-semibold flex-1">Response diff</div>
          {!loading && (
            <div className="flex gap-[6px]">
              <span className="text-[11px] font-bold px-2 py-[2px] rounded-full tabular-nums bg-[color-mix(in_srgb,var(--green)_15%,transparent)] text-[var(--green)]">+{added}</span>
              <span className="text-[11px] font-bold px-2 py-[2px] rounded-full tabular-nums bg-[color-mix(in_srgb,var(--red)_15%,transparent)] text-[var(--red)]">−{removed}</span>
            </div>
          )}
        </div>

        {!loading && (
          <div className="grid border-b border-[var(--border)] flex-shrink-0" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <div className="flex items-center gap-2 px-4 py-[10px] text-xs relative border-r border-[var(--border)] bg-[color-mix(in_srgb,var(--red)_4%,transparent)]">
              <span className={`font-mono text-[11px] font-semibold px-[7px] py-[2px] rounded-[5px] inline-block min-w-[48px] text-center ${methodClass(a.method)}`}>{a.method}</span>
              <span className={`tabular-nums font-mono text-xs ${statusColorClass(a.status_code)}`}>{a.status_code}</span>
              <span className="font-mono text-[11px] text-[var(--muted)] overflow-hidden text-ellipsis whitespace-nowrap flex-1">{a.path}</span>
              <span className="text-[10px] font-[800] tracking-[0.06em] px-[6px] py-[1px] rounded flex-shrink-0 bg-[color-mix(in_srgb,var(--red)_20%,transparent)] text-[var(--red)]">A</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-[10px] text-xs relative bg-[color-mix(in_srgb,var(--green)_4%,transparent)]">
              <span className={`font-mono text-[11px] font-semibold px-[7px] py-[2px] rounded-[5px] inline-block min-w-[48px] text-center ${methodClass(b.method)}`}>{b.method}</span>
              <span className={`tabular-nums font-mono text-xs ${statusColorClass(b.status_code)}`}>{b.status_code}</span>
              <span className="font-mono text-[11px] text-[var(--muted)] overflow-hidden text-ellipsis whitespace-nowrap flex-1">{b.path}</span>
              <span className="text-[10px] font-[800] tracking-[0.06em] px-[6px] py-[1px] rounded flex-shrink-0 bg-[color-mix(in_srgb,var(--green)_20%,transparent)] text-[var(--green)]">B</span>
            </div>
          </div>
        )}

        <div className="flex gap-1 px-4 border-b border-[var(--border)] flex-shrink-0">
          <span
            className={`px-[14px] py-[9px] cursor-pointer text-xs border-b-2 transition-colors ${tab === "body" ? "text-[var(--text)] border-[var(--accent)]" : "text-[var(--muted)] border-transparent"}`}
            onClick={() => setTab("body")}
          >Body</span>
          <span
            className={`px-[14px] py-[9px] cursor-pointer text-xs border-b-2 transition-colors ${tab === "headers" ? "text-[var(--text)] border-[var(--accent)]" : "text-[var(--muted)] border-transparent"}`}
            onClick={() => setTab("headers")}
          >Headers</span>
        </div>

        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="text-[var(--faint)] text-[13px] px-5 py-6">Loading…</div>
          ) : lines.length === 0 ? (
            <div className="text-[var(--faint)] text-[13px] px-5 py-6">No differences</div>
          ) : (
            <pre className="m-0 py-2 font-mono text-xs leading-[1.6]">
              {lines.map((line, i) => (
                <div
                  key={i}
                  className={`flex hover:bg-[var(--panel)] ${
                    line.type === "added" ? "bg-[color-mix(in_srgb,var(--green)_10%,transparent)]" :
                    line.type === "removed" ? "bg-[color-mix(in_srgb,var(--red)_10%,transparent)]" :
                    ""
                  }`}
                >
                  <span className={`w-8 flex-shrink-0 text-center text-xs select-none ${
                    line.type === "added" ? "text-[var(--green)]" :
                    line.type === "removed" ? "text-[var(--red)]" :
                    "text-[var(--faint)]"
                  }`}>
                    {line.type === "added" ? "+" : line.type === "removed" ? "−" : " "}
                  </span>
                  <span className="flex-1 whitespace-pre overflow-visible pr-4">{line.text}</span>
                </div>
              ))}
            </pre>
          )}
        </div>
      </div>
    </>
  );
}
