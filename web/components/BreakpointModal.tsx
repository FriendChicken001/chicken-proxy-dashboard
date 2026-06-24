"use client";

import { useEffect, useState } from "react";
import { deleteBreakpoint, saveBreakpoint } from "@/lib/api";
import type { BreakpointRule } from "@/lib/types";

const METHODS = ["", "GET", "POST", "PUT", "PATCH", "DELETE"];

const DEFAULT_FUNC = `def should_break(flow):
    # Return True to intercept, False to let through.
    # flow.request.path, .method, .headers, .query, .text available
    import json
    body = flow.request.get_text(strict=False) or ""
    # Example: only break when body contains a specific value
    return True
`;

const methodColors: Record<string, string> = {
  GET: "bg-[#1c2c44] text-[#7eb0ff]",
  POST: "bg-[#14342a] text-[#4ade80]",
  PUT: "bg-[#34290f] text-[#fbbf24]",
  DELETE: "bg-[#361a1a] text-[#f87171]",
};
const methodColorFallback = "bg-[#2a2440] text-[#c4b5fd]";
function methodClass(m: string) { return methodColors[m] ?? methodColorFallback; }

export default function BreakpointModal({
  breakpoints, initialDraft, onClose,
}: {
  breakpoints: BreakpointRule[];
  initialDraft?: { urlContains: string; method: string } | null;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState<Partial<BreakpointRule> | null>(
    initialDraft
      ? { enabled: true, phase: "request", url_contains: initialDraft.urlContains, method: initialDraft.method }
      : null
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const toggle = (bp: BreakpointRule) =>
    saveBreakpoint({ ...bp, enabled: !bp.enabled }).catch(() => {});
  const remove = (id: string) => deleteBreakpoint(id).catch(() => {});

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-[30]" onClick={onClose} />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(680px,95vw)] max-h-[88vh] overflow-hidden bg-[var(--bg-2)] border border-[var(--border)] rounded-[14px] z-[31] flex flex-col shadow-[0_30px_80px_rgba(0,0,0,0.5)]">

        <div className="relative px-5 pt-[18px] pb-[14px] border-b border-[var(--border)] flex-shrink-0">
          <button
            className="absolute top-[18px] right-5 bg-none border-none text-[var(--muted)] text-[16px] cursor-pointer px-[6px] py-[2px] rounded-[5px] hover:text-[var(--text)] hover:bg-[var(--panel-2)] transition-colors"
            onClick={onClose}
          >✕</button>
          <div className="text-[16px] font-semibold text-[var(--text)] flex items-center gap-2">
            {editing ? (editing.id ? "Edit breakpoint" : "New breakpoint") : (
              <>
                Breakpoints
                {breakpoints.length > 0 && (
                  <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-[6px] rounded-full text-[11px] font-semibold bg-[color-mix(in_srgb,var(--amber)_14%,transparent)] text-[var(--amber)] border border-[color-mix(in_srgb,var(--amber)_30%,transparent)]">
                    {breakpoints.length}
                  </span>
                )}
              </>
            )}
          </div>
          {!editing && (
            <p className="text-[12px] text-[var(--faint)] mt-[6px]">
              Pause matching requests so you can inspect them before they continue to the server.
            </p>
          )}
        </div>

        {editing ? (
          <BpEditor
            draft={editing}
            onCancel={() => setEditing(null)}
            onSaved={() => setEditing(null)}
          />
        ) : (
          <>
            <div className="overflow-auto flex-1">
              {breakpoints.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-[52px] px-6 gap-2 text-center">
                  <div className="text-[32px] mb-1">⏸</div>
                  <div className="text-[14px] font-medium text-[var(--text)]">No breakpoints yet</div>
                  <div className="text-xs text-[var(--faint)] max-w-[340px] leading-[1.55]">
                    Add a breakpoint to pause matching requests. You can then inspect and resume or abort them from the flow detail panel.
                  </div>
                </div>
              ) : (
                <div className="flex flex-col py-[6px]">
                  {breakpoints.map(bp => (
                    <div
                      key={bp.id}
                      className={`flex items-center gap-3 px-5 py-[10px] border-b border-[var(--border)] last:border-b-0 transition-colors hover:bg-[color-mix(in_srgb,var(--amber)_4%,transparent)] ${bp.enabled ? "" : "opacity-45"}`}
                    >
                      <button
                        className={`flex-shrink-0 w-[34px] h-[19px] border-none rounded-full relative cursor-pointer transition-colors p-0 ${bp.enabled ? "bg-[var(--amber)]" : "bg-[var(--border)]"}`}
                        onClick={() => toggle(bp)}
                        title={bp.enabled ? "Enabled" : "Disabled"}
                      >
                        <span
                          className="absolute top-[2px] left-[2px] w-[15px] h-[15px] rounded-full bg-white transition-transform"
                          style={{ transform: bp.enabled ? "translateX(15px)" : "translateX(0)" }}
                        />
                      </button>

                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-medium text-[var(--text)] whitespace-nowrap overflow-hidden text-ellipsis mb-[3px]">{bp.name}</div>
                        <div className="flex items-center gap-[6px] text-[11px] whitespace-nowrap overflow-hidden font-mono">
                          <span className={`font-mono text-[11px] font-semibold px-[7px] py-[2px] rounded-[5px] inline-block min-w-[48px] text-center ${methodClass(bp.method || "GET")}`}>{bp.method || "ANY"}</span>
                          <span className="overflow-hidden text-ellipsis text-[var(--faint)]">{bp.url_contains || "(any URL)"}</span>
                        </div>
                      </div>

                      <span className={`flex-shrink-0 text-[11px] px-[7px] py-[2px] rounded-[6px] font-medium ${bp.phase === "response" ? "bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-[var(--accent)]" : "bg-[color-mix(in_srgb,var(--amber)_12%,transparent)] text-[var(--amber)]"}`}>
                        {bp.phase === "response" ? "response" : "request"}
                      </span>

                      {bp.func && (
                        <span className="flex-shrink-0 font-mono text-[11px] px-[7px] py-[2px] rounded-[6px] bg-[color-mix(in_srgb,var(--purple)_14%,transparent)] text-[var(--purple)]" title="Conditional Python function">
                          fn
                        </span>
                      )}

                      <span className="flex-shrink-0 text-[11px] text-[var(--faint)] font-mono w-7 text-right" title="Hit count">
                        {bp.hits}×
                      </span>

                      <span className="w-px self-stretch bg-[var(--border)] flex-shrink-0 my-1" />
                      <div className="flex-shrink-0 flex items-center bg-[var(--panel)] border border-[var(--border)] rounded-[7px] overflow-hidden">
                        <button
                          className="bg-none border-none cursor-pointer text-[var(--muted)] text-[13px] px-[9px] py-1 leading-none hover:text-[var(--amber)] hover:bg-[color-mix(in_srgb,var(--amber)_10%,transparent)] transition-colors"
                          onClick={() => setEditing(bp)}
                          title="Edit"
                        >✏</button>
                        <span className="w-px self-stretch bg-[var(--border)]" />
                        <button
                          className="bg-none border-none cursor-pointer text-[var(--muted)] text-[13px] px-[9px] py-1 leading-none hover:text-[var(--red)] hover:bg-[color-mix(in_srgb,var(--red)_10%,transparent)] transition-colors"
                          onClick={() => remove(bp.id)}
                          title="Delete"
                        >✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-[10px] px-5 py-[14px] border-t border-[var(--border)] bg-[var(--bg-2)] rounded-b-[14px] flex-shrink-0">
              <button
                className="bg-[var(--panel-2)] text-[var(--amber)] border border-[var(--amber)] rounded-[7px] px-3 py-[6px] text-xs cursor-pointer hover:bg-[color-mix(in_srgb,var(--amber)_8%,transparent)] transition-colors"
                onClick={() => setEditing({ enabled: true, phase: "request" })}
              >
                ＋ New breakpoint
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function BpEditor({
  draft, onCancel, onSaved,
}: {
  draft: Partial<BreakpointRule>;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(draft.name ?? "");
  const [enabled, setEnabled] = useState(draft.enabled ?? true);
  const [method, setMethod] = useState(draft.method ?? "");
  const [urlContains, setUrlContains] = useState(draft.url_contains ?? "");
  const [phase, setPhase] = useState<"request" | "response">(draft.phase ?? "request");
  const [funcMode, setFuncMode] = useState(!!(draft.func));
  const [funcCode, setFuncCode] = useState(draft.func || DEFAULT_FUNC);
  const [timeoutS, setTimeoutS] = useState(String(draft.timeout_s ?? 0));
  const [maxHits, setMaxHits] = useState(String(draft.max_hits ?? 0));
  const [saving, setSaving] = useState(false);

  const inputCls = "w-full bg-[var(--panel)] border border-[var(--border)] rounded-[7px] px-[11px] py-[7px] text-[var(--text)] text-[13px] outline-none focus:border-[var(--amber)]";
  const monoInputCls = `${inputCls} font-mono`;
  const selectCls = `${inputCls} appearance-none`;

  const save = async () => {
    setSaving(true);
    try {
      await saveBreakpoint({
        id: draft.id,
        name: name || "Breakpoint",
        enabled, method, url_contains: urlContains,
        phase,
        func: funcMode ? funcCode : "",
        timeout_s: Math.max(0, parseInt(timeoutS, 10) || 0),
        max_hits: Math.max(0, parseInt(maxHits, 10) || 0),
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
            <input className={inputCls} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Pause login" />
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
            <input className={monoInputCls} value={urlContains} onChange={e => setUrlContains(e.target.value)} placeholder="api.example.com/login" />
          </label>
        </div>

        <div className="text-[11px] uppercase tracking-[0.05em] text-[var(--faint)] mt-4 mb-2">Intercept phase</div>
        <div className="flex items-center gap-[2px] bg-[var(--panel)] border border-[var(--border)] rounded-[7px] p-[2px] w-fit mb-4">
          {(["request", "response"] as const).map(p => (
            <button
              key={p}
              type="button"
              onClick={() => setPhase(p)}
              className={`px-[12px] py-[4px] text-[11px] rounded-[5px] border-none cursor-pointer transition-colors capitalize ${phase === p ? "bg-[var(--bg-2)] text-[var(--amber)] font-medium" : "bg-transparent text-[var(--muted)] hover:text-[var(--text)]"}`}
            >{p}</button>
          ))}
        </div>

        <div className="flex items-center justify-between mb-2">
          <div className="text-[11px] uppercase tracking-[0.05em] text-[var(--faint)]">Condition</div>
          <div className="flex items-center gap-[2px] bg-[var(--panel)] border border-[var(--border)] rounded-[7px] p-[2px]">
            <button
              type="button"
              onClick={() => setFuncMode(false)}
              className={`px-[10px] py-[3px] text-[11px] rounded-[5px] border-none cursor-pointer transition-colors ${!funcMode ? "bg-[var(--bg-2)] text-[var(--text)] font-medium" : "bg-transparent text-[var(--muted)] hover:text-[var(--text)]"}`}
            >Always break</button>
            <button
              type="button"
              onClick={() => setFuncMode(true)}
              className={`px-[10px] py-[3px] text-[11px] rounded-[5px] border-none cursor-pointer transition-colors ${funcMode ? "bg-[var(--bg-2)] text-[var(--purple)] font-medium" : "bg-transparent text-[var(--muted)] hover:text-[var(--text)]"}`}
            >Python condition</button>
          </div>
        </div>

        {funcMode && (
          <label className="block">
            <span className="block text-[var(--muted)] text-[11px] uppercase tracking-[0.04em] mb-[6px]">
              Define <code className="font-mono normal-case tracking-normal text-[var(--purple)]">should_break(flow)</code> → bool
            </span>
            <textarea
              className={`${monoInputCls} resize-y leading-[1.45]`}
              value={funcCode}
              onChange={e => setFuncCode(e.target.value)}
              rows={8}
              spellCheck={false}
            />
          </label>
        )}

        <div className="text-[11px] uppercase tracking-[0.05em] text-[var(--faint)] mt-5 mb-2">Limits</div>
        <div className="flex gap-3 items-end">
          <label style={{ flex: "0 0 160px" }} className="block">
            <span className="block text-[var(--muted)] text-[11px] uppercase tracking-[0.04em] mb-[6px]">Auto-resume after (sec)</span>
            <input
              className={monoInputCls}
              value={timeoutS}
              onChange={e => setTimeoutS(e.target.value)}
              inputMode="numeric"
              placeholder="0 = off"
            />
          </label>
          <label style={{ flex: "0 0 160px" }} className="block">
            <span className="block text-[var(--muted)] text-[11px] uppercase tracking-[0.04em] mb-[6px]">Auto-disable after hits</span>
            <input
              className={monoInputCls}
              value={maxHits}
              onChange={e => setMaxHits(e.target.value)}
              inputMode="numeric"
              placeholder="0 = unlimited"
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
          className="bg-[var(--panel-2)] text-[var(--amber)] border border-[var(--amber)] rounded-[7px] px-3 py-[6px] text-xs cursor-pointer hover:bg-[color-mix(in_srgb,var(--amber)_8%,transparent)] transition-colors disabled:opacity-50"
          onClick={save}
          disabled={saving}
        >{saving ? "Saving…" : "Save breakpoint"}</button>
      </div>
    </>
  );
}
