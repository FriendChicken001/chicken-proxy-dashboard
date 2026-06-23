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
      <div className="overlay" onClick={onClose} />
      <div className="modal modal-wide">

        {/* header */}
        <div className="mk-header">
          <button className="cm-close" onClick={onClose}>✕</button>
          <div className="mk-header-top">
            <div className="mk-title">
              Mock rules
              {mocks.length > 0 && <span className="mk-count">{mocks.length}</span>}
            </div>
          </div>
          {!editing && (
            <div className="mk-search-wrap">
              <input
                className="mk-search"
                placeholder="Search by name or URL…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              {search && (
                <button className="mk-search-clear" onClick={() => setSearch("")}>✕</button>
              )}
            </div>
          )}
          {editing && (
            <div className="mk-editor-title">
              {editing.id ? "Edit rule" : "New rule"}
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
            <div className="modal-body mk-body">
              {mocks.length === 0 ? (
                <div className="mk-empty">
                  <div className="mk-empty-icon">🐔</div>
                  <div className="mk-empty-text">No mock rules yet</div>
                  <div className="mk-empty-sub">Create one here, or right-click any captured request → Mock this response</div>
                </div>
              ) : filtered.length === 0 ? (
                <div className="mk-empty">
                  <div className="mk-empty-text">No rules match "{search}"</div>
                </div>
              ) : (
                <div className="mk-list">
                  {filtered.map(m => (
                    <div key={m.id} className={`mk-row${m.enabled ? "" : " mk-off"}`}>
                      {/* toggle */}
                      <button
                        className={`mk-toggle${m.enabled ? " on" : ""}`}
                        onClick={() => toggle(m)}
                        title={m.enabled ? "Enabled — click to disable" : "Disabled — click to enable"}
                      >
                        <span className="mk-toggle-knob" />
                      </button>

                      {/* info */}
                      <div className="mk-info">
                        <div className="mk-row-name">{m.name}</div>
                        <div className="mk-row-match mono">
                          <span className={`method m-${m.method || "GET"}`}>{m.method || "ANY"}</span>
                          <span className="mk-url">{m.url_contains || "(any URL)"}</span>
                        </div>
                      </div>

                      {/* status */}
                      <span className={`mk-status status s-${Math.floor(m.status_code / 100)}`}>
                        {m.status_code}
                      </span>

                      {/* hits */}
                      <span className="mk-hits" title="Hit count">
                        {m.hits}×
                      </span>

                      {/* actions */}
                      <span className="mk-row-sep" />
                      <div className="mk-actions">
                        <button className="mk-act-btn" onClick={() => setEditing(m)} title="Edit">✏</button>
                        <span className="mk-act-div" />
                        <button className="mk-act-btn del" onClick={() => remove(m.id)} title="Delete">✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="modal-footer">
              <input ref={fileInputRef} type="file" accept=".json,application/json" style={{ display: "none" }} onChange={handleImport} />
              <button className="btn" onClick={() => fileInputRef.current?.click()} disabled={importing} title="Import from JSON">
                ↑ Import
              </button>
              <button className="btn" onClick={() => exportMocks(mocks)} disabled={mocks.length === 0} title="Export as JSON">
                ↓ Export
              </button>
              {importMsg && <span className="import-msg">{importMsg}</span>}
              <span style={{ flex: 1 }} />
              <button className="btn primary" onClick={() => setEditing({ enabled: true, status_code: 200 })}>
                ＋ New mock rule
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function MockEditor({ draft, onCancel, onSaved }: { draft: Partial<MockRule>; onCancel: () => void; onSaved: () => void }) {
  const [name, setName] = useState(draft.name ?? "");
  const [enabled, setEnabled] = useState(draft.enabled ?? true);
  const [method, setMethod] = useState(draft.method ?? "");
  const [urlContains, setUrlContains] = useState(draft.url_contains ?? "");
  const [status, setStatus] = useState(String(draft.status_code ?? 200));
  const [headers, setHeaders] = useState(headersToText(draft.headers ?? [["content-type", "application/json"]]));
  const [body, setBody] = useState(prettyIfJson(draft.body ?? ""));
  const [bodyMsg, setBodyMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const formatBody = () => {
    const t = body.trim();
    if (!t) return;
    try { setBody(JSON.stringify(JSON.parse(t), null, 2)); setBodyMsg(null); }
    catch { setBodyMsg("Not valid JSON — left as-is"); }
  };

  const save = async () => {
    setSaving(true);
    try {
      await saveMock({ id: draft.id, name: name || "Mock", enabled, method, url_contains: urlContains, status_code: parseInt(status, 10) || 200, headers: textToHeaders(headers), body });
      onSaved();
    } catch { setSaving(false); }
  };

  return (
    <>
      <div className="modal-body">
        {/* name + enabled */}
        <div className="form-row">
          <label style={{ flex: 1 }}>
            <span className="field-label">Name</span>
            <input className="search full" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. fake login OK" />
          </label>
          <label className="check-inline">
            <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />
            Enabled
          </label>
        </div>

        <div className="mk-section">Match when…</div>
        <div className="form-row">
          <label style={{ flex: "0 0 120px" }}>
            <span className="field-label">Method</span>
            <select className="search full" value={method} onChange={e => setMethod(e.target.value)}>
              {METHODS.map(m => <option key={m} value={m}>{m || "ANY"}</option>)}
            </select>
          </label>
          <label style={{ flex: 1 }}>
            <span className="field-label">URL contains</span>
            <input className="search full mono" value={urlContains} onChange={e => setUrlContains(e.target.value)} placeholder="api.example.com/users" />
          </label>
        </div>

        <div className="mk-section">Respond with…</div>
        <div className="form-row">
          <label style={{ flex: "0 0 120px" }}>
            <span className="field-label">Status code</span>
            <input className="search full mono" value={status} onChange={e => setStatus(e.target.value)} inputMode="numeric" />
          </label>
          <label style={{ flex: 1 }}>
            <span className="field-label">Headers (one per line: Key: Value)</span>
            <textarea className="search full mono area" value={headers} onChange={e => setHeaders(e.target.value)} rows={2} />
          </label>
        </div>
        <label>
          <span className="field-label body-label">
            Body
            <span className="body-label-actions">
              {bodyMsg && <span className="body-msg">{bodyMsg}</span>}
              <button type="button" className="mini" onClick={formatBody}>Format JSON</button>
            </span>
          </span>
          <textarea className="search full mono area" value={body} onChange={e => { setBody(e.target.value); if (bodyMsg) setBodyMsg(null); }} rows={8} placeholder={'{\n  "ok": true\n}'} />
        </label>
      </div>

      <div className="modal-footer">
        <button className="btn" onClick={onCancel}>Cancel</button>
        <button className="btn primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save mock"}</button>
      </div>
    </>
  );
}
