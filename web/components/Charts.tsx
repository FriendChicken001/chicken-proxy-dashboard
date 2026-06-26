"use client";

import { useState } from "react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts";
import type { Stats } from "@/lib/types";

export default function Charts({
  stats,
  highlightedHost,
  onHighlight,
}: {
  stats: Stats | null;
  highlightedHost: string | null;
  onHighlight: (host: string | null) => void;
}) {
  const timeline = (stats?.timeline ?? []).map((p) => ({
    t: new Date(p.t * 1000).toLocaleTimeString([], {
      minute: "2-digit",
      second: "2-digit",
    }),
    count: p.count,
  }));

  const [hostSearch, setHostSearch] = useState("");
  const allHosts = stats?.top_hosts ?? [];
  const hosts = hostSearch.trim()
    ? allHosts.filter((h) => h.host.toLowerCase().includes(hostSearch.toLowerCase()))
    : allHosts;

  return (
    <div className="grid gap-3 px-5 py-3" style={{ gridTemplateColumns: "1.6fr 1fr" }}>
      <div className="bg-[var(--panel)] border border-[var(--border)] rounded-[10px] px-[14px] py-3">
        <h3 className="m-0 mb-[10px] text-[12px] font-semibold text-[var(--muted)] uppercase tracking-[0.04em]">Requests / sec</h3>
        <ResponsiveContainer width="100%" height={150}>
          <AreaChart data={timeline} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
            <defs>
              <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#5b8cff" stopOpacity={0.6} />
                <stop offset="100%" stopColor="#5b8cff" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="t"
              tick={{ fill: "#5b6577", fontSize: 10 }}
              interval="preserveEnd"
              minTickGap={28}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                background: "#151a26",
                border: "1px solid #232c3d",
                borderRadius: 8,
                fontSize: 12,
              }}
              labelStyle={{ color: "#8a95a8" }}
            />
            <Area
              type="monotone"
              dataKey="count"
              stroke="#5b8cff"
              fill="url(#g)"
              strokeWidth={2}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-[var(--panel)] border border-[var(--border)] rounded-[10px] px-[14px] py-3 flex flex-col">
        <div className="flex items-center justify-between mb-2">
          <h3 className="m-0 text-[12px] font-semibold text-[var(--muted)] uppercase tracking-[0.04em]">Top hosts</h3>
          {highlightedHost && (
            <button
              className="bg-[var(--panel)] text-[var(--muted)] border border-[var(--border)] rounded-[6px] px-[9px] py-[3px] text-[10px] cursor-pointer hover:text-[var(--text)] hover:border-[var(--accent)] transition-colors"
              onClick={() => onHighlight(null)}
              title="Show all hosts"
            >
              ✕ Clear filter
            </button>
          )}
        </div>

        <div className="relative mb-2">
          <input
            className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-[7px] py-[5px] pl-[9px] pr-7 text-[var(--text)] text-xs font-mono outline-none transition-colors focus:border-[var(--accent)] placeholder:text-[var(--faint)] placeholder:font-sans"
            placeholder="Search hosts…"
            value={hostSearch}
            onChange={(e) => setHostSearch(e.target.value)}
          />
          {hostSearch && (
            <button
              className="absolute right-[6px] top-1/2 -translate-y-1/2 bg-none border-none text-[var(--faint)] text-[11px] cursor-pointer px-1 py-[2px] rounded-[3px] hover:text-[var(--text)] transition-colors"
              onClick={() => setHostSearch("")}
            >✕</button>
          )}
        </div>

        {allHosts.length === 0 ? (
          <div className="text-[var(--faint)] text-xs py-2">No traffic yet</div>
        ) : hosts.length === 0 ? (
          <div className="text-[var(--faint)] text-xs py-2">No hosts match &ldquo;{hostSearch}&rdquo;</div>
        ) : (
          <ol className="list-none m-0 p-0 flex flex-col gap-[2px] overflow-y-auto" style={{ maxHeight: 220 }}>
            {hosts.map((h, i) => {
              const isHighlighted = highlightedHost === h.host;
              const isDimmed = highlightedHost !== null && !isHighlighted;
              const pct = stats?.total
                ? Math.round((h.count / stats.total) * 100)
                : 0;
              return (
                <li
                  key={h.host}
                  className={`flex items-center gap-2 px-2 py-[7px] rounded-lg cursor-pointer border transition-all ${
                    isHighlighted
                      ? "bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] border-[color-mix(in_srgb,var(--accent)_30%,transparent)]"
                      : "border-transparent hover:bg-[var(--panel-2)]"
                  } ${isDimmed ? "opacity-30" : ""}`}
                  onClick={() => onHighlight(isHighlighted ? null : h.host)}
                >
                  <span className={`text-[10px] font-bold tabular-nums w-5 flex-shrink-0 ${isHighlighted ? "text-[var(--accent)]" : "text-[var(--faint)]"}`}>
                    #{i + 1}
                  </span>
                  <span className="flex flex-col gap-[2px] flex-1 min-w-0">
                    <span className={`font-mono text-xs whitespace-nowrap overflow-hidden text-ellipsis ${isHighlighted ? "text-[var(--accent)] font-semibold" : "text-[var(--text)]"}`}>
                      {h.host}
                    </span>
                    <span className="flex items-center gap-[5px] text-[11px]">
                      <span className="text-[var(--accent)] font-semibold tabular-nums">{pct}%</span>
                      <span className="text-[var(--faint)]">·</span>
                      <span className="text-[var(--muted)] tabular-nums">{h.count} req</span>
                    </span>
                  </span>
                  <button
                    className="opacity-0 group-hover:opacity-100 flex-shrink-0 bg-none border border-[var(--border)] text-[var(--muted)] text-[13px] cursor-pointer px-[6px] py-[2px] rounded-[5px] hover:text-[var(--text)] hover:border-[var(--accent)] transition-all"
                    title="Copy hostname"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigator.clipboard?.writeText(h.host).catch(() => {});
                    }}
                    style={{ opacity: isHighlighted ? 1 : undefined }}
                  >
                    ⎘
                  </button>
                  {isHighlighted && (
                    <span className="text-[9px] font-bold uppercase tracking-[0.06em] text-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] rounded-full px-[6px] py-[1px] flex-shrink-0">
                      filtering
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}
