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
      <div className="overlay" onClick={onClose} />
      <div className="modal diff-modal">
        <div className="diff-header">
          <button className="cm-close" onClick={onClose}>✕</button>
          <div className="diff-title">Response diff</div>
          {!loading && (
            <div className="diff-meta">
              <span className="diff-badge added">+{added}</span>
              <span className="diff-badge removed">−{removed}</span>
            </div>
          )}
        </div>

        {/* flow labels */}
        {!loading && (
          <div className="diff-labels">
            <div className="diff-label a">
              <span className={`method m-${a.method}`}>{a.method}</span>
              <span className={`status ${statusClass(a.status_code)}`}>{a.status_code}</span>
              <span className="diff-label-path">{a.path}</span>
              <span className="diff-label-tag">A</span>
            </div>
            <div className="diff-label b">
              <span className={`method m-${b.method}`}>{b.method}</span>
              <span className={`status ${statusClass(b.status_code)}`}>{b.status_code}</span>
              <span className="diff-label-path">{b.path}</span>
              <span className="diff-label-tag">B</span>
            </div>
          </div>
        )}

        {/* tabs */}
        <div className="tabs diff-tabs">
          <span className={`tab ${tab === "body" ? "on" : ""}`} onClick={() => setTab("body")}>Body</span>
          <span className={`tab ${tab === "headers" ? "on" : ""}`} onClick={() => setTab("headers")}>Headers</span>
        </div>

        <div className="diff-body">
          {loading ? (
            <div className="diff-loading">Loading…</div>
          ) : lines.length === 0 ? (
            <div className="diff-empty">No differences</div>
          ) : (
            <pre className="diff-pre">
              {lines.map((line, i) => (
                <div key={i} className={`diff-line diff-${line.type}`}>
                  <span className="diff-gutter">
                    {line.type === "added" ? "+" : line.type === "removed" ? "−" : " "}
                  </span>
                  <span className="diff-text">{line.text}</span>
                </div>
              ))}
            </pre>
          )}
        </div>
      </div>
    </>
  );
}
