"use client";

import { useEffect, useState } from "react";
import { fetchFlowDetail } from "@/lib/api";
import type { FlowDetail, MessageBody, MockRule } from "@/lib/types";
import { bytes, clockTime, ms, statusClass } from "@/lib/format";
import { draftFromDetail } from "@/lib/mockDraft";

type Tab = "overview" | "request" | "response";

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
      <div className="overlay" onClick={onClose} />
      <aside className="drawer">
        <div className="drawer-head">
          <span className="close" onClick={onClose}>
            ✕
          </span>
          {detail ? (
            <>
              <div>
                <span className={`method m-${detail.method}`}>
                  {detail.method}
                </span>{" "}
                {detail.error ? (
                  <span className="status s-5">ERR</span>
                ) : (
                  <span className={`status ${statusClass(detail.status_code)}`}>
                    {detail.status_code ?? "pending"} {detail.reason ?? ""}
                  </span>
                )}
                {detail.mocked && (
                  <span className="mock-tag" style={{ marginLeft: 8 }}>
                    🐔 {detail.mock_name}
                  </span>
                )}
              </div>
              <div className="url">{detail.url}</div>
              <button
                className="btn primary mock-btn"
                onClick={() => onMock(draftFromDetail(detail))}
              >
                🐔 Mock this response
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                <button className="btn" onClick={resend} disabled={resendState === 'sending'}>
                  {resendState === 'sending' ? '↺ Sending…' : '↺ Resend'}
                </button>
                {resendState !== 'idle' && resendState !== 'sending' && (
                  <span style={{ fontSize: 12, color: typeof resendState === 'object' && resendState.status < 400 ? 'var(--green)' : 'var(--red)' }}>
                    {resendState === 'error' ? 'Network error' : `→ ${resendState.status}`}
                  </span>
                )}
              </div>
            </>
          ) : (
            <div className="url">{err ?? "Loading…"}</div>
          )}
        </div>

        {detail && (
          <>
            <div className="tabs">
              {(["overview", "request", "response"] as Tab[]).map((t) => (
                <span
                  key={t}
                  className={`tab ${tab === t ? "on" : ""}`}
                  onClick={() => setTab(t)}
                >
                  {t[0].toUpperCase() + t.slice(1)}
                </span>
              ))}
            </div>

            <div className="drawer-body">
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
        <span className="meta-pill">{d.scheme.toUpperCase()}</span>
        <span className="meta-pill">{d.http_version}</span>
        <span className="meta-pill">{d.host}:{d.port}</span>
      </div>
      <div className="section-title">Timing & size</div>
      <div className="kv">
        <span className="k">started</span>
        <span className="v">{clockTime(d.time_start)}</span>
        <span className="k">duration</span>
        <span className="v">{ms(d.duration_ms)}</span>
        <span className="k">request size</span>
        <span className="v">{bytes(d.request_size)}</span>
        <span className="k">response size</span>
        <span className="v">{bytes(d.response_size)}</span>
        <span className="k">content-type</span>
        <span className="v">{d.content_type ?? "—"}</span>
      </div>
      {d.error && (
        <>
          <div className="section-title">Error</div>
          <pre className="body">{d.error}</pre>
        </>
      )}
    </>
  );
}

function Headers({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <>
      <div className="section-title">{title}</div>
      {rows.length === 0 ? (
        <div style={{ color: "#5b6577", fontSize: 12 }}>none</div>
      ) : (
        <div className="kv">
          {rows.map(([k, v], i) => (
            <span style={{ display: "contents" }} key={`${k}-${i}`}>
              <span className="k">{k}</span>
              <span className="v">{v}</span>
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
        <div className="section-title">{title}</div>
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
      <div className="section-title body-head">
        <span>
          {title} · {bytes(body.size)}
          {pretty ? " · JSON" : ""}
          {body.truncated ? " · truncated" : ""}
        </span>
        {body.is_text && text !== null && (
          <span className="body-actions">
            {pretty && (
              <>
                <button
                  className={`mini ${!raw ? "on" : ""}`}
                  onClick={() => setRaw(false)}
                >
                  Formatted
                </button>
                <button
                  className={`mini ${raw ? "on" : ""}`}
                  onClick={() => setRaw(true)}
                >
                  Raw
                </button>
              </>
            )}
            <button className="mini" onClick={copy}>
              {copied ? "✓ copied" : "⧉ Copy"}
            </button>
          </span>
        )}
      </div>
      {body.is_text && shown !== null ? (
        <pre className="body">{shown}</pre>
      ) : (
        <div style={{ color: "#5b6577", fontSize: 12 }}>
          binary content ({bytes(body.size)}) — not shown
        </div>
      )}
    </>
  );
}
