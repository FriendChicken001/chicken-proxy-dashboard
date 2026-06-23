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
    <div className="charts-row">
      <div className="panel">
        <h3>Requests / sec</h3>
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

      <div className="panel host-panel">
        <div className="host-bar-head">
          <h3>Top hosts</h3>
          {highlightedHost && (
            <button
              className="mini host-clear"
              onClick={() => onHighlight(null)}
              title="Show all hosts"
            >
              ✕ Clear filter
            </button>
          )}
        </div>

        <div className="host-search-wrap">
          <input
            className="host-search"
            placeholder="Search hosts…"
            value={hostSearch}
            onChange={(e) => setHostSearch(e.target.value)}
          />
          {hostSearch && (
            <button className="host-search-clear" onClick={() => setHostSearch("")}>✕</button>
          )}
        </div>

        {allHosts.length === 0 ? (
          <div className="host-empty">No traffic yet</div>
        ) : hosts.length === 0 ? (
          <div className="host-empty">No hosts match "{hostSearch}"</div>
        ) : (
          <ol className="host-list">
            {hosts.map((h, i) => {
              const isHighlighted = highlightedHost === h.host;
              const isDimmed = highlightedHost !== null && !isHighlighted;
              const pct = stats?.total
                ? Math.round((h.count / stats.total) * 100)
                : 0;
              return (
                <li
                  key={h.host}
                  className={`host-item${isHighlighted ? " active" : ""}${isDimmed ? " dimmed" : ""}`}
                  onClick={() => onHighlight(isHighlighted ? null : h.host)}
                >
                  <span className="host-rank">#{i + 1}</span>
                  <span className="host-info">
                    <span className="host-name">{h.host}</span>
                    <span className="host-meta">
                      <span className="host-pct">{pct}%</span>
                      <span className="host-sep">·</span>
                      <span className="host-req">{h.count} req</span>
                    </span>
                  </span>
                  <button
                    className="host-copy"
                    title="Copy hostname"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigator.clipboard?.writeText(h.host).catch(() => {});
                    }}
                  >
                    ⎘
                  </button>
                  {isHighlighted && (
                    <span className="host-active-badge">filtering</span>
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
