"use client";

import { useEffect, useRef, useState } from "react";
import { fetchFlowDetail } from "@/lib/api";
import type { FlowDetail } from "@/lib/types";
import { statusClass } from "@/lib/format";

type DiffLine = { type: "same" | "added" | "removed"; text: string };

type SideLine = { text: string; type: "same" | "removed" | "added" | "empty"; lineNo: number | null };
type SideRow  = { left: SideLine; right: SideLine };

function lcs(a: string[], b: string[]): number[][] {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] + 1 : Math.max(dp[i-1][j], dp[i][j-1]);
  return dp;
}

function diffLines(a: string, b: string): DiffLine[] {
  const aLines = a.split("\n"), bLines = b.split("\n");
  const dp = lcs(aLines, bLines);
  const stack: DiffLine[] = [];
  let i = aLines.length, j = bLines.length;
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

function toSideBySide(diff: DiffLine[]): SideRow[] {
  const rows: SideRow[] = [];
  let ln = 1, rn = 1, i = 0;
  while (i < diff.length) {
    if (diff[i].type === "same") {
      rows.push({ left: { text: diff[i].text, type: "same", lineNo: ln++ }, right: { text: diff[i].text, type: "same", lineNo: rn++ } });
      i++;
    } else {
      const removed: string[] = [], added: string[] = [];
      while (i < diff.length && diff[i].type !== "same") {
        if (diff[i].type === "removed") removed.push(diff[i].text);
        else added.push(diff[i].text);
        i++;
      }
      const len = Math.max(removed.length, added.length);
      for (let k = 0; k < len; k++) {
        rows.push({
          left:  k < removed.length ? { text: removed[k], type: "removed", lineNo: ln++ } : { text: "", type: "empty", lineNo: null },
          right: k < added.length   ? { text: added[k],   type: "added",   lineNo: rn++ } : { text: "", type: "empty", lineNo: null },
        });
      }
    }
  }
  return rows;
}

function tryFmt(s: string): string {
  if (!s.trim()) return s;
  try { return JSON.stringify(JSON.parse(s), null, 2); } catch { return s; }
}

const methodColors: Record<string, string> = {
  GET: "bg-[#1c2c44] text-[#7eb0ff]", POST: "bg-[#14342a] text-[#4ade80]",
  PUT: "bg-[#34290f] text-[#fbbf24]", DELETE: "bg-[#361a1a] text-[#f87171]",
};
const methodColorFallback = "bg-[#2a2440] text-[#c4b5fd]";
const statusColors: Record<string, string> = {
  "s-2": "text-[var(--green)]", "s-3": "text-[var(--accent)]",
  "s-4": "text-[var(--amber)]", "s-5": "text-[var(--red)]", "s-pending": "text-[var(--faint)]",
};

type Tab = "body" | "headers";

export default function DiffModal({ idA, idB, onClose }: { idA: string; idB: string; onClose: () => void }) {
  const [a, setA] = useState<FlowDetail | null>(null);
  const [b, setB] = useState<FlowDetail | null>(null);
  const [tab, setTab] = useState<Tab>("body");
  const leftRef  = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const syncingRef = useRef(false);

  useEffect(() => {
    fetchFlowDetail(idA).then(setA).catch(() => {});
    fetchFlowDetail(idB).then(setB).catch(() => {});
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [idA, idB, onClose]);

  const syncScroll = (from: "left" | "right") => (e: React.UIEvent<HTMLDivElement>) => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    const other = from === "left" ? rightRef.current : leftRef.current;
    if (other) {
      other.scrollTop  = (e.target as HTMLDivElement).scrollTop;
      other.scrollLeft = (e.target as HTMLDivElement).scrollLeft;
    }
    syncingRef.current = false;
  };

  const loading = !a || !b;

  const bodyRows = !loading
    ? toSideBySide(diffLines(tryFmt(a.response_body?.text ?? ""), tryFmt(b.response_body?.text ?? "")))
    : [];

  const headerRows = !loading
    ? toSideBySide(diffLines(
        a.response_headers.map(([k, v]) => `${k}: ${v}`).join("\n"),
        b.response_headers.map(([k, v]) => `${k}: ${v}`).join("\n"),
      ))
    : [];

  const rows = tab === "body" ? bodyRows : headerRows;
  const added   = rows.filter(r => r.right.type === "added").length;
  const removed = rows.filter(r => r.left.type  === "removed").length;

  const cellBg = (type: SideLine["type"]) =>
    type === "added"   ? "bg-[color-mix(in_srgb,var(--green)_12%,transparent)]" :
    type === "removed" ? "bg-[color-mix(in_srgb,var(--red)_12%,transparent)]"   :
    type === "empty"   ? "bg-[color-mix(in_srgb,var(--faint)_5%,transparent)]"  : "";

  const lineNoBg = (type: SideLine["type"]) =>
    type === "added"   ? "bg-[color-mix(in_srgb,var(--green)_18%,transparent)] text-[var(--green)]" :
    type === "removed" ? "bg-[color-mix(in_srgb,var(--red)_18%,transparent)] text-[var(--red)]"     :
    "text-[var(--faint)]";

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-[30]" onClick={onClose} />
      <div className="fixed top-[3vh] left-[2vw] right-[2vw] bottom-[3vh] bg-[var(--bg-2)] border border-[var(--border)] rounded-[14px] z-[31] flex flex-col shadow-[0_30px_80px_rgba(0,0,0,0.5)]">

        {/* header */}
        <div className="flex items-center gap-3 px-5 py-[12px] border-b border-[var(--border)] flex-shrink-0">
          <button className="bg-none border-none text-[var(--muted)] text-[16px] cursor-pointer px-[6px] py-[2px] rounded hover:text-[var(--text)] hover:bg-[var(--panel-2)] transition-colors" onClick={onClose}>✕</button>
          <span className="text-[15px] font-semibold flex-1">Response diff</span>
          {!loading && (
            <div className="flex gap-2">
              <span className="text-[11px] font-bold px-2 py-[2px] rounded-full tabular-nums bg-[color-mix(in_srgb,var(--green)_15%,transparent)] text-[var(--green)]">+{added}</span>
              <span className="text-[11px] font-bold px-2 py-[2px] rounded-full tabular-nums bg-[color-mix(in_srgb,var(--red)_15%,transparent)] text-[var(--red)]">−{removed}</span>
            </div>
          )}
        </div>

        {/* flow labels */}
        {!loading && (
          <div className="grid border-b border-[var(--border)] flex-shrink-0" style={{ gridTemplateColumns: "1fr 1fr" }}>
            {([{ flow: a, side: "A", color: "var(--red)" }, { flow: b, side: "B", color: "var(--green)" }] as const).map(({ flow, side, color }) => (
              <div key={side} className="flex items-center gap-2 px-4 py-[9px] text-xs border-r last:border-r-0 border-[var(--border)]" style={{ background: `color-mix(in srgb, ${color} 4%, transparent)` }}>
                <span className={`font-mono text-[11px] font-semibold px-[7px] py-[2px] rounded-[5px] inline-block min-w-[48px] text-center ${methodColors[flow.method] ?? methodColorFallback}`}>{flow.method}</span>
                <span className={`tabular-nums font-mono text-xs ${statusColors[statusClass(flow.status_code)] ?? "text-[var(--faint)]"}`}>{flow.status_code}</span>
                <span className="font-mono text-[11px] text-[var(--muted)] overflow-hidden text-ellipsis whitespace-nowrap flex-1">{flow.path}</span>
                <span className="text-[10px] font-[800] tracking-[0.06em] px-[6px] py-[1px] rounded flex-shrink-0" style={{ background: `color-mix(in srgb, ${color} 20%, transparent)`, color }}>{side}</span>
              </div>
            ))}
          </div>
        )}

        {/* tabs */}
        <div className="flex gap-1 px-4 border-b border-[var(--border)] flex-shrink-0">
          {(["body", "headers"] as Tab[]).map(t => (
            <span key={t} className={`px-[14px] py-[9px] cursor-pointer text-xs border-b-2 transition-colors capitalize ${tab === t ? "text-[var(--text)] border-[var(--accent)]" : "text-[var(--muted)] border-transparent"}`} onClick={() => setTab(t)}>{t}</span>
          ))}
        </div>

        {/* side-by-side */}
        <div className="flex-1 overflow-hidden grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
          {loading ? (
            <div className="col-span-2 text-[var(--faint)] text-[13px] px-5 py-6">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="col-span-2 text-[var(--faint)] text-[13px] px-5 py-6">No differences</div>
          ) : (
            <>
              {/* LEFT */}
              <div ref={leftRef} className="overflow-auto border-r border-[var(--border)]" onScroll={syncScroll("left")}>
                <pre className="m-0 font-mono text-xs leading-[1.6] min-w-max">
                  {rows.map((row, i) => (
                    <div key={i} className={`flex ${cellBg(row.left.type)}`}>
                      <span className={`w-10 flex-shrink-0 text-right pr-3 select-none text-[11px] border-r border-[var(--border)] mr-2 ${lineNoBg(row.left.type)}`}>
                        {row.left.lineNo ?? ""}
                      </span>
                      <span className="whitespace-pre pr-6">{row.left.text}</span>
                    </div>
                  ))}
                </pre>
              </div>
              {/* RIGHT */}
              <div ref={rightRef} className="overflow-auto" onScroll={syncScroll("right")}>
                <pre className="m-0 font-mono text-xs leading-[1.6] min-w-max">
                  {rows.map((row, i) => (
                    <div key={i} className={`flex ${cellBg(row.right.type)}`}>
                      <span className={`w-10 flex-shrink-0 text-right pr-3 select-none text-[11px] border-r border-[var(--border)] mr-2 ${lineNoBg(row.right.type)}`}>
                        {row.right.lineNo ?? ""}
                      </span>
                      <span className="whitespace-pre pr-6">{row.right.text}</span>
                    </div>
                  ))}
                </pre>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
