"use client";

import { useEffect, useRef, useState } from "react";
import { deleteMock, saveMock } from "@/lib/api";
import type { MockRule } from "@/lib/types";

function exportMocks(mocks: MockRule[]) {
  const blob = new Blob([JSON.stringify(mocks, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `mocks-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function importMocks(file: File): Promise<{ imported: number; errors: number }> {
  const text = await file.text();
  const rules: Partial<MockRule>[] = JSON.parse(text);
  if (!Array.isArray(rules)) throw new Error("Expected a JSON array");
  let imported = 0, errors = 0;
  for (const rule of rules) {
    try {
      const { id: _id, hits: _hits, ...rest } = rule as MockRule;
      await saveMock(rest);
      imported++;
    } catch { errors++; }
  }
  return { imported, errors };
}

const METHODS = ["", "GET", "POST", "PUT", "PATCH", "DELETE"];

function headersToText(headers: [string, string][]): string {
  return headers.map(([k, v]) => `${k}: ${v}`).join("\n");
}

function prettyIfJson(text: string): string {
  const t = text.trim();
  if (!t || (t[0] !== "{" && t[0] !== "[")) return text;
  try { return JSON.stringify(JSON.parse(t), null, 2); } catch { return text; }
}

function textToHeaders(text: string): [string, string][] {
  return text.split("\n").map(l => l.trim()).filter(Boolean).map(line => {
    const i = line.indexOf(":");
    if (i === -1) return [line, ""] as [string, string];
    return [line.slice(0, i).trim(), line.slice(i + 1).trim()] as [string, string];
  });
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

function mkStatusClass(code: number): string {
  const s = Math.floor(code / 100);
  if (s === 2) return "bg-[color-mix(in_srgb,var(--green)_12%,transparent)] text-[var(--green)]";
  if (s === 3) return "bg-[color-mix(in_srgb,var(--amber)_12%,transparent)] text-[var(--amber)]";
  if (s === 4) return "bg-[color-mix(in_srgb,var(--red)_12%,transparent)] text-[var(--red)]";
  if (s === 5) return "bg-[color-mix(in_srgb,var(--red)_18%,transparent)] text-[var(--red)]";
  return "bg-[color-mix(in_srgb,var(--muted)_12%,transparent)] text-[var(--muted)]";
}

export default function MockModal({
  mocks, initialDraft, onClose,
}: {
  mocks: MockRule[];
  initialDraft: Partial<MockRule> | null;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState<Partial<MockRule> | null>(initialDraft);
  const [search, setSearch] = useState("");
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const toggle = (rule: MockRule) => saveMock({ ...rule, enabled: !rule.enabled }).catch(() => {});
  const remove = (id: string) => deleteMock(id).catch(() => {});

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setImporting(true); setImportMsg(null);
    try {
      const { imported, errors } = await importMocks(file);
      setImportMsg(errors > 0 ? `Imported ${imported}, ${errors} failed` : `Imported ${imported} rule${imported !== 1 ? "s" : ""}`);
    } catch { setImportMsg("Invalid file"); }
    finally { setImporting(false); }
  };

  const q = search.trim().toLowerCase();
  const filtered = q
    ? mocks.filter(m => m.name.toLowerCase().includes(q) || m.url_contains.toLowerCase().includes(q))
    : mocks;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-[30]" onClick={onClose} />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(720px,95vw)] max-h-[88vh] overflow-hidden bg-[var(--bg-2)] border border-[var(--border)] rounded-[14px] z-[31] flex flex-col shadow-[0_30px_80px_rgba(0,0,0,0.5)]">

        <div className="relative px-5 pt-[18px] pb-[14px] border-b border-[var(--border)] flex-shrink-0">
          <button
            className="absolute top-[18px] right-5 bg-none border-none text-[var(--muted)] text-[16px] cursor-pointer px-[6px] py-[2px] rounded-[5px] hover:text-[var(--text)] hover:bg-[var(--panel-2)] transition-colors"
            onClick={onClose}
          >✕</button>
          <div className="mb-3">
            {!editing ? (
              <div className="text-[16px] font-semibold text-[var(--text)] flex items-center gap-2">
                Mock rules
                {mocks.length > 0 && (
                  <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-[6px] rounded-full text-[11px] font-semibold bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] text-[var(--accent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)]">
                    {mocks.length}
                  </span>
                )}
              </div>
            ) : (
              <div className="text-[13px] text-[var(--muted)] font-medium mt-[2px]">
                {editing.id ? "Edit rule" : "New rule"}
              </div>
            )}
          </div>
          {!editing && (
            <div className="relative">
              <input
                className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg py-2 pl-3 pr-8 text-[var(--text)] text-[13px] outline-none font-[inherit] transition-colors focus:border-[var(--accent)] placeholder:text-[var(--faint)]"
                placeholder="Search by name or URL…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              {search && (
                <button
                  className="absolute right-[10px] top-1/2 -translate-y-1/2 bg-none border-none text-[var(--muted)] cursor-pointer text-[13px] px-1 py-[2px] leading-none hover:text-[var(--text)] transition-colors"
                  onClick={() => setSearch("")}
                >✕</button>
              )}
            </div>
          )}
        </div>

        {editing ? (
          <MockEditor
            draft={editing}
            onCancel={() => (initialDraft ? onClose() : setEditing(null))}
            onSaved={() => (initialDraft ? onClose() : setEditing(null))}
          />
        ) : (
          <>
            <div className="p-0 overflow-auto flex-1">
              {mocks.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-[52px] px-6 gap-2 text-center">
                  <div className="text-[36px] mb-1">🐔</div>
                  <div className="text-[14px] font-medium text-[var(--text)]">No mock rules yet</div>
                  <div className="text-xs text-[var(--faint)] max-w-[340px] leading-[1.55]">Create one here, or right-click any captured request → Mock this response</div>
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-[52px] px-6 gap-2 text-center">
                  <div className="text-[14px] font-medium text-[var(--text)]">No rules match &ldquo;{search}&rdquo;</div>
                </div>
              ) : (
                <div className="flex flex-col py-[6px]">
                  {filtered.map(m => (
                    <div
                      key={m.id}
                      className={`flex items-center gap-3 px-5 py-[10px] border-b border-[var(--border)] last:border-b-0 transition-colors hover:bg-[color-mix(in_srgb,var(--accent)_4%,transparent)] ${m.enabled ? "" : "opacity-45"}`}
                    >
                      <button
                        className={`flex-shrink-0 w-[34px] h-[19px] border-none rounded-full relative cursor-pointer transition-colors p-0 ${m.enabled ? "bg-[var(--accent)]" : "bg-[var(--border)]"}`}
                        onClick={() => toggle(m)}
                        title={m.enabled ? "Enabled — click to disable" : "Disabled — click to enable"}
                      >
                        <span
                          className="absolute top-[2px] left-[2px] w-[15px] h-[15px] rounded-full bg-white transition-transform"
                          style={{ transform: m.enabled ? "translateX(15px)" : "translateX(0)" }}
                        />
                      </button>

                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-medium text-[var(--text)] whitespace-nowrap overflow-hidden text-ellipsis mb-[3px]">{m.name}</div>
                        <div className="flex items-center gap-[6px] text-[11px] text-[var(--muted)] whitespace-nowrap overflow-hidden font-mono">
                          <span className={`font-mono text-[11px] font-semibold px-[7px] py-[2px] rounded-[5px] inline-block min-w-[48px] text-center ${methodClass(m.method || "GET")}`}>{m.method || "ANY"}</span>
                          <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[var(--faint)]">{m.url_contains || "(any URL)"}</span>
                        </div>
                      </div>

                      <span className={`flex-shrink-0 font-mono text-xs font-semibold px-2 py-[2px] rounded-[6px] ${mkStatusClass(m.status_code)}`}>
                        {m.status_code}
                      </span>

                      {(m.delay_ms ?? 0) > 0 && (
                        <span className="flex-shrink-0 font-mono text-[11px] px-[7px] py-[2px] rounded-[6px] bg-[color-mix(in_srgb,var(--amber)_12%,transparent)] text-[var(--amber)]" title="Response delay">
                          ⏱{m.delay_ms}ms
                        </span>
                      )}
                      {m.func && (
                        <span className="flex-shrink-0 font-mono text-[11px] px-[7px] py-[2px] rounded-[6px] bg-[color-mix(in_srgb,var(--purple)_14%,transparent)] text-[var(--purple)]" title="Dynamic Python function">
                          fn
                        </span>
                      )}

                      <span className="flex-shrink-0 text-[11px] text-[var(--faint)] font-mono w-7 text-right" title="Hit count">
                        {m.hits}×
                      </span>

                      <span className="w-px self-stretch bg-[var(--border)] flex-shrink-0 my-1" />
                      <div className="flex-shrink-0 flex items-center bg-[var(--panel)] border border-[var(--border)] rounded-[7px] overflow-hidden">
                        <button
                          className="bg-none border-none cursor-pointer text-[var(--muted)] text-[13px] px-[9px] py-1 leading-none hover:text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] transition-colors"
                          onClick={() => setEditing(m)}
                          title="Edit"
                        >✏</button>
                        <span className="w-px self-stretch bg-[var(--border)]" />
                        <button
                          className="bg-none border-none cursor-pointer text-[var(--muted)] text-[13px] px-[9px] py-1 leading-none hover:text-[var(--red)] hover:bg-[color-mix(in_srgb,var(--red)_10%,transparent)] transition-colors"
                          onClick={() => remove(m.id)}
                          title="Delete"
                        >✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-[10px] px-5 py-[14px] border-t border-[var(--border)] bg-[var(--bg-2)] rounded-b-[14px] flex-shrink-0">
              <input ref={fileInputRef} type="file" accept=".json,application/json" className="hidden" onChange={handleImport} />
              <button
                className="bg-[var(--panel-2)] text-[var(--text)] border border-[var(--border)] rounded-[7px] px-3 py-[6px] text-xs cursor-pointer hover:bg-[#232c3d] transition-colors disabled:opacity-50 disabled:cursor-default"
                onClick={() => fileInputRef.current?.click()}
                disabled={importing}
                title="Import from JSON"
              >
                ↑ Import
              </button>
              <button
                className="bg-[var(--panel-2)] text-[var(--text)] border border-[var(--border)] rounded-[7px] px-3 py-[6px] text-xs cursor-pointer hover:bg-[#232c3d] transition-colors disabled:opacity-50 disabled:cursor-default"
                onClick={() => exportMocks(mocks)}
                disabled={mocks.length === 0}
                title="Export as JSON"
              >
                ↓ Export
              </button>
              {importMsg && <span className="text-xs text-[var(--green)] self-center">{importMsg}</span>}
              <span className="flex-1" />
              <button
                className="bg-[var(--panel-2)] text-[var(--accent)] border border-[var(--accent)] rounded-[7px] px-3 py-[6px] text-xs cursor-pointer hover:bg-[#1c2740] transition-colors"
                onClick={() => setEditing({ enabled: true, status_code: 200 })}
              >
                ＋ New mock rule
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}

const DEFAULT_FUNC = `def mock(flow):
    import json
    # flow.request.path, .method, .headers, .query, .text available
    return 200, {"content-type": "application/json"}, json.dumps({
        "ok": True
    })
`;

function MockEditor({ draft, onCancel, onSaved }: { draft: Partial<MockRule>; onCancel: () => void; onSaved: () => void }) {
  const [name, setName] = useState(draft.name ?? "");
  const [enabled, setEnabled] = useState(draft.enabled ?? true);
  const [method, setMethod] = useState(draft.method ?? "");
  const [urlContains, setUrlContains] = useState(draft.url_contains ?? "");
  const [status, setStatus] = useState(String(draft.status_code ?? 200));
  const [headers, setHeaders] = useState(headersToText(draft.headers ?? [["content-type", "application/json"]]));
  const [body, setBody] = useState(prettyIfJson(draft.body ?? ""));
  const [bodyMsg, setBodyMsg] = useState<string | null>(null);
  const [delayMs, setDelayMs] = useState(String(draft.delay_ms ?? 0));
  const [funcMode, setFuncMode] = useState(!!(draft.func));
  const [funcCode, setFuncCode] = useState(draft.func || DEFAULT_FUNC);
  const [saving, setSaving] = useState(false);

  const inputCls = "w-full bg-[var(--panel)] border border-[var(--border)] rounded-[7px] px-[11px] py-[7px] text-[var(--text)] text-[13px] outline-none focus:border-[var(--accent)]";
  const monoInputCls = `${inputCls} font-mono`;
  const selectCls = `${inputCls} appearance-none`;
  const textareaCls = `${monoInputCls} resize-y leading-[1.45]`;

  const formatBody = () => {
    const t = body.trim();
    if (!t) return;
    try { setBody(JSON.stringify(JSON.parse(t), null, 2)); setBodyMsg(null); }
    catch { setBodyMsg("Not valid JSON — left as-is"); }
  };

  const save = async () => {
    setSaving(true);
    try {
      await saveMock({
        id: draft.id, name: name || "Mock", enabled, method,
        url_contains: urlContains, status_code: parseInt(status, 10) || 200,
        headers: textToHeaders(headers), body,
        delay_ms: Math.max(0, parseInt(delayMs, 10) || 0),
        func: funcMode ? funcCode : "",
      });
      onSaved();
    } catch { setSaving(false); }
  };

  return (
    <>
      <div className="px-5 py-[18px] overflow-auto flex-1">
        <div className="flex gap-3 items-end mb-3">
          <label className="flex-1 block">
            <span className="block text-[var(--muted)] text-[11px] uppercase tracking-[0.04em] mb-[6px]">Name</span>
            <input className={inputCls} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. fake login OK" />
          </label>
          <label className="inline-flex items-center gap-[6px] text-[13px] text-[var(--text)] pb-2 whitespace-nowrap">
            <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />
            Enabled
          </label>
        </div>

        <div className="text-[11px] uppercase tracking-[0.05em] text-[var(--faint)] mt-4 mb-2">Match when…</div>
        <div className="flex gap-3 items-end mb-3">
          <label style={{ flex: "0 0 120px" }} className="block">
            <span className="block text-[var(--muted)] text-[11px] uppercase tracking-[0.04em] mb-[6px]">Method</span>
            <select className={selectCls} value={method} onChange={e => setMethod(e.target.value)}>
              {METHODS.map(m => <option key={m} value={m}>{m || "ANY"}</option>)}
            </select>
          </label>
          <label className="flex-1 block">
            <span className="block text-[var(--muted)] text-[11px] uppercase tracking-[0.04em] mb-[6px]">URL contains</span>
            <input className={monoInputCls} value={urlContains} onChange={e => setUrlContains(e.target.value)} placeholder="api.example.com/users" />
          </label>
        </div>

        <div className="flex items-center justify-between mt-4 mb-2">
          <div className="text-[11px] uppercase tracking-[0.05em] text-[var(--faint)]">Respond with…</div>
          <div className="flex items-center gap-[2px] bg-[var(--panel)] border border-[var(--border)] rounded-[7px] p-[2px]">
            <button
              type="button"
              onClick={() => setFuncMode(false)}
              className={`px-[10px] py-[3px] text-[11px] rounded-[5px] border-none cursor-pointer transition-colors ${!funcMode ? "bg-[var(--bg-2)] text-[var(--text)] font-medium" : "bg-transparent text-[var(--muted)] hover:text-[var(--text)]"}`}
            >Static</button>
            <button
              type="button"
              onClick={() => setFuncMode(true)}
              className={`px-[10px] py-[3px] text-[11px] rounded-[5px] border-none cursor-pointer transition-colors ${funcMode ? "bg-[var(--bg-2)] text-[var(--purple)] font-medium" : "bg-transparent text-[var(--muted)] hover:text-[var(--text)]"}`}
            >Dynamic (Python)</button>
          </div>
        </div>

        {funcMode ? (
          <label className="block">
            <span className="block text-[var(--muted)] text-[11px] uppercase tracking-[0.04em] mb-[6px]">
              Python — define <code className="font-mono normal-case tracking-normal text-[var(--purple)]">mock(flow)</code> → (status, headers_dict, body_str)
            </span>
            <textarea
              className={textareaCls}
              value={funcCode}
              onChange={e => setFuncCode(e.target.value)}
              rows={10}
              spellCheck={false}
            />
          </label>
        ) : (
          <>
            <div className="flex gap-3 items-end mb-3">
              <label style={{ flex: "0 0 120px" }} className="block">
                <span className="block text-[var(--muted)] text-[11px] uppercase tracking-[0.04em] mb-[6px]">Status code</span>
                <input className={monoInputCls} value={status} onChange={e => setStatus(e.target.value)} inputMode="numeric" />
              </label>
              <label className="flex-1 block">
                <span className="block text-[var(--muted)] text-[11px] uppercase tracking-[0.04em] mb-[6px]">Headers (one per line: Key: Value)</span>
                <textarea className={textareaCls} value={headers} onChange={e => setHeaders(e.target.value)} rows={2} />
              </label>
            </div>
            <label className="block">
              <span className="flex items-center justify-between text-[var(--muted)] text-[11px] uppercase tracking-[0.04em] mb-[6px]">
                Body
                <span className="flex items-center gap-2">
                  {bodyMsg && <span className="normal-case tracking-normal text-[var(--amber)] text-[11px]">{bodyMsg}</span>}
                  <button
                    type="button"
                    className="bg-[var(--panel)] text-[var(--muted)] border border-[var(--border)] rounded-[6px] px-[9px] py-[3px] text-[11px] cursor-pointer hover:text-[var(--text)] hover:border-[var(--accent)] transition-colors normal-case tracking-normal"
                    onClick={formatBody}
                  >Format JSON</button>
                </span>
              </span>
              <textarea
                className={textareaCls}
                value={body}
                onChange={e => { setBody(e.target.value); if (bodyMsg) setBodyMsg(null); }}
                rows={8}
                placeholder={'{\n  "ok": true\n}'}
              />
            </label>
          </>
        )}

        <div className="mt-4">
          <label style={{ width: 160 }} className="block">
            <span className="block text-[var(--muted)] text-[11px] uppercase tracking-[0.04em] mb-[6px]">Delay (ms)</span>
            <input
              className={monoInputCls}
              value={delayMs}
              onChange={e => setDelayMs(e.target.value)}
              inputMode="numeric"
              placeholder="0"
            />
          </label>
        </div>
      </div>

      <div className="flex justify-end gap-[10px] px-5 py-[14px] border-t border-[var(--border)] bg-[var(--bg-2)] rounded-b-[14px] flex-shrink-0">
        <button
          className="bg-[var(--panel-2)] text-[var(--text)] border border-[var(--border)] rounded-[7px] px-3 py-[6px] text-xs cursor-pointer hover:bg-[#232c3d] transition-colors"
          onClick={onCancel}
        >Cancel</button>
        <button
          className="bg-[var(--panel-2)] text-[var(--accent)] border border-[var(--accent)] rounded-[7px] px-3 py-[6px] text-xs cursor-pointer hover:bg-[#1c2740] transition-colors disabled:opacity-50 disabled:cursor-default"
          onClick={save}
          disabled={saving}
        >{saving ? "Saving…" : "Save mock"}</button>
      </div>
    </>
  );
}
