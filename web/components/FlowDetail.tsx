"use client";

import { useEffect, useState } from "react";
import { fetchFlowDetail } from "@/lib/api";
import type { FlowDetail, MessageBody, MockRule } from "@/lib/types";
import { bytes, clockTime, ms, statusClass } from "@/lib/format";
import { draftFromDetail } from "@/lib/mockDraft";

type Tab = "overview" | "request" | "response";

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

export default function FlowDetailDrawer({
  flowId,
  onClose,
  onMock,
}: {
  flowId: string;
  onClose: () => void;
  onMock: (draft: Partial<MockRule>) => void;
}) {
  const [detail, setDetail] = useState<FlowDetail | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [err, setErr] = useState<string | null>(null);
  const [resendState, setResendState] = useState<'idle' | 'sending' | { status: number } | 'error'>('idle');

  useEffect(() => {
    setDetail(null);
    setErr(null);
    setTab("overview");
    setResendState('idle');
    fetchFlowDetail(flowId)
      .then(setDetail)
      .catch((e) => setErr(String(e)));
  }, [flowId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const resend = async () => {
    if (!detail) return;
    setResendState('sending');
    try {
      const headers: Record<string, string> = {};
      for (const [k, v] of detail.request_headers) {
        if (['host', 'content-length', 'transfer-encoding', 'connection'].includes(k.toLowerCase())) continue;
        headers[k] = v;
      }
      const res = await fetch(detail.url, {
        method: detail.method,
        headers,
        body: detail.request_body?.size > 0 && detail.request_body?.text ? detail.request_body.text : undefined,
      });
      setResendState({ status: res.status });
    } catch {
      setResendState('error');
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-[30]" onClick={onClose} />
      <aside className="fixed top-0 right-0 bottom-0 w-[min(640px,92vw)] bg-[var(--bg-2)] border-l border-[var(--border)] z-[31] flex flex-col shadow-[-20px_0_60px_rgba(0,0,0,0.4)]">
        <div className="px-[18px] py-[14px] border-b border-[var(--border)]">
          <span className="float-right cursor-pointer text-[var(--muted)] text-[18px] leading-none" onClick={onClose}>
            ✕
          </span>
          {detail ? (
            <>
              <div>
                <span className={`font-mono text-[11px] font-semibold px-[7px] py-[2px] rounded-[5px] inline-block min-w-[48px] text-center ${methodClass(detail.method)}`}>
                  {detail.method}
                </span>{" "}
                {detail.error ? (
                  <span className="tabular-nums font-mono text-xs text-[var(--red)]">ERR</span>
                ) : (
                  <span className={`tabular-nums font-mono text-xs ${statusColorClass(detail.status_code)}`}>
                    {detail.status_code ?? "pending"} {detail.reason ?? ""}
                  </span>
                )}
                {detail.mocked && (
                  <span className="inline-flex items-center gap-1 text-[11px] px-[7px] py-[1px] rounded-full bg-[#211b38] text-[var(--purple)] border border-[#382e5c] ml-2">
                    🐔 {detail.mock_name}
                  </span>
                )}
              </div>
              <div className="font-mono text-xs text-[var(--text)] break-all mt-2">{detail.url}</div>
              <button
                className="mt-[10px] bg-[var(--panel-2)] text-[var(--accent)] border border-[var(--accent)] rounded-[7px] px-3 py-[6px] text-xs cursor-pointer hover:bg-[#1c2740] transition-colors"
                onClick={() => onMock(draftFromDetail(detail))}
              >
                🐔 Mock this response
              </button>
              <div className="flex items-center gap-2 mt-[6px]">
                <button
                  className="bg-[var(--panel-2)] text-[var(--text)] border border-[var(--border)] rounded-[7px] px-3 py-[6px] text-xs cursor-pointer hover:bg-[#232c3d] transition-colors disabled:opacity-50 disabled:cursor-default"
                  onClick={resend}
                  disabled={resendState === 'sending'}
                >
                  {resendState === 'sending' ? '↺ Sending…' : '↺ Resend'}
                </button>
                {resendState !== 'idle' && resendState !== 'sending' && (
                  <span style={{ fontSize: 12, color: typeof resendState === 'object' && resendState.status < 400 ? 'var(--green)' : 'var(--red)' }}>
                    {resendState === 'error' ? 'Network error' : `→ ${(resendState as { status: number }).status}`}
                  </span>
                )}
              </div>
            </>
          ) : (
            <div className="font-mono text-xs text-[var(--text)] break-all mt-2">{err ?? "Loading…"}</div>
          )}
        </div>

        {detail && (
          <>
            <div className="flex gap-1 px-[18px] border-b border-[var(--border)]">
              {(["overview", "request", "response"] as Tab[]).map((t) => (
                <span
                  key={t}
                  className={`px-[14px] py-[9px] cursor-pointer text-xs border-b-2 transition-colors ${
                    tab === t
                      ? "text-[var(--text)] border-[var(--accent)]"
                      : "text-[var(--muted)] border-transparent"
                  }`}
                  onClick={() => setTab(t)}
                >
                  {t[0].toUpperCase() + t.slice(1)}
                </span>
              ))}
            </div>

            <div className="flex-1 overflow-auto px-[18px] py-4">
              {tab === "overview" && <Overview d={detail} />}
              {tab === "request" && (
                <>
                  <Headers title="Request headers" rows={detail.request_headers} />
                  {detail.query.length > 0 && (
                    <Headers title="Query parameters" rows={detail.query} />
                  )}
                  <Body title="Request body" body={detail.request_body} />
                </>
              )}
              {tab === "response" && (
                <>
                  <Headers
                    title="Response headers"
                    rows={detail.response_headers}
                  />
                  <Body title="Response body" body={detail.response_body} />
                </>
              )}
            </div>
          </>
        )}
      </aside>
    </>
  );
}

function Overview({ d }: { d: FlowDetail }) {
  return (
    <>
      <div>
        <span className="inline-block bg-[var(--panel-2)] border border-[var(--border)] rounded-full px-[9px] py-[2px] text-[11px] text-[var(--muted)] mr-[6px]">{d.scheme.toUpperCase()}</span>
        <span className="inline-block bg-[var(--panel-2)] border border-[var(--border)] rounded-full px-[9px] py-[2px] text-[11px] text-[var(--muted)] mr-[6px]">{d.http_version}</span>
        <span className="inline-block bg-[var(--panel-2)] border border-[var(--border)] rounded-full px-[9px] py-[2px] text-[11px] text-[var(--muted)] mr-[6px]">{d.host}:{d.port}</span>
      </div>
      <div className="text-[11px] uppercase tracking-[0.04em] text-[var(--faint)] mt-[18px] mb-2">Timing &amp; size</div>
      <div className="grid gap-1 text-xs" style={{ gridTemplateColumns: "200px 1fr", gap: "4px 12px" }}>
        <span className="text-[var(--muted)] font-mono break-all">started</span>
        <span className="text-[var(--text)] font-mono break-all">{clockTime(d.time_start)}</span>
        <span className="text-[var(--muted)] font-mono break-all">duration</span>
        <span className="text-[var(--text)] font-mono break-all">{ms(d.duration_ms)}</span>
        <span className="text-[var(--muted)] font-mono break-all">request size</span>
        <span className="text-[var(--text)] font-mono break-all">{bytes(d.request_size)}</span>
        <span className="text-[var(--muted)] font-mono break-all">response size</span>
        <span className="text-[var(--text)] font-mono break-all">{bytes(d.response_size)}</span>
        <span className="text-[var(--muted)] font-mono break-all">content-type</span>
        <span className="text-[var(--text)] font-mono break-all">{d.content_type ?? "—"}</span>
      </div>
      {d.error && (
        <>
          <div className="text-[11px] uppercase tracking-[0.04em] text-[var(--faint)] mt-[18px] mb-2">Error</div>
          <pre className="bg-[var(--bg)] border border-[var(--border)] rounded-lg p-3 font-mono text-xs text-[#cdd6e6] whitespace-pre-wrap break-words max-h-[420px] overflow-auto m-0">{d.error}</pre>
        </>
      )}
    </>
  );
}

function Headers({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <>
      <div className="text-[11px] uppercase tracking-[0.04em] text-[var(--faint)] mt-[18px] mb-2">{title}</div>
      {rows.length === 0 ? (
        <div style={{ color: "#5b6577", fontSize: 12 }}>none</div>
      ) : (
        <div className="grid text-xs" style={{ gridTemplateColumns: "200px 1fr", gap: "4px 12px" }}>
          {rows.map(([k, v], i) => (
            <span style={{ display: "contents" }} key={`${k}-${i}`}>
              <span className="text-[var(--muted)] font-mono break-all">{k}</span>
              <span className="text-[var(--text)] font-mono break-all">{v}</span>
            </span>
          ))}
        </div>
      )}
    </>
  );
}

function prettyJson(text: string): string | null {
  const t = text.trim();
  if (!t || (t[0] !== "{" && t[0] !== "[")) return null;
  try {
    return JSON.stringify(JSON.parse(t), null, 2);
  } catch {
    return null;
  }
}

function Body({ title, body }: { title: string; body: MessageBody | null }) {
  const [raw, setRaw] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!body || body.size === 0)
    return (
      <>
        <div className="text-[11px] uppercase tracking-[0.04em] text-[var(--faint)] mt-[18px] mb-2">{title}</div>
        <div style={{ color: "#5b6577", fontSize: 12 }}>empty</div>
      </>
    );

  const text = body.text;
  const pretty = body.is_text && text !== null ? prettyJson(text) : null;
  const shown = pretty && !raw ? pretty : text;

  const copy = () => {
    if (!text) return;
    navigator.clipboard
      ?.writeText(text)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      })
      .catch(() => {});
  };

  return (
    <>
      <div className="text-[11px] uppercase tracking-[0.04em] text-[var(--faint)] mt-[18px] mb-2 flex items-center justify-between gap-[10px]">
        <span>
          {title} · {bytes(body.size)}
          {pretty ? " · JSON" : ""}
          {body.truncated ? " · truncated" : ""}
        </span>
        {body.is_text && text !== null && (
          <span className="flex gap-[6px]">
            {pretty && (
              <>
                <button
                  className={`bg-[var(--panel)] text-[var(--muted)] border border-[var(--border)] rounded-[6px] px-[9px] py-[3px] text-[11px] cursor-pointer hover:text-[var(--text)] hover:border-[var(--accent)] transition-colors normal-case tracking-normal ${!raw ? "text-[var(--accent)] border-[var(--accent)]" : ""}`}
                  onClick={() => setRaw(false)}
                >
                  Formatted
                </button>
                <button
                  className={`bg-[var(--panel)] text-[var(--muted)] border border-[var(--border)] rounded-[6px] px-[9px] py-[3px] text-[11px] cursor-pointer hover:text-[var(--text)] hover:border-[var(--accent)] transition-colors normal-case tracking-normal ${raw ? "text-[var(--accent)] border-[var(--accent)]" : ""}`}
                  onClick={() => setRaw(true)}
                >
                  Raw
                </button>
              </>
            )}
            <button
              className="bg-[var(--panel)] text-[var(--muted)] border border-[var(--border)] rounded-[6px] px-[9px] py-[3px] text-[11px] cursor-pointer hover:text-[var(--text)] hover:border-[var(--accent)] transition-colors normal-case tracking-normal"
              onClick={copy}
            >
              {copied ? "✓ copied" : "⧉ Copy"}
            </button>
          </span>
        )}
      </div>
      {body.is_text && shown !== null ? (
        <pre className="bg-[var(--bg)] border border-[var(--border)] rounded-lg p-3 font-mono text-xs text-[#cdd6e6] whitespace-pre-wrap break-words max-h-[420px] overflow-auto m-0">{shown}</pre>
      ) : (
        <div style={{ color: "#5b6577", fontSize: 12 }}>
          binary content ({bytes(body.size)}) — not shown
        </div>
      )}
    </>
  );
}
