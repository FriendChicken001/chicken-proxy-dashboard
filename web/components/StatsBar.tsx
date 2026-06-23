"use client";

import type { Stats } from "@/lib/types";
import { bytes, ms } from "@/lib/format";

export default function StatsBar({ stats }: { stats: Stats | null }) {
  const s = stats;
  const errors =
    (s?.status_classes["4xx"] ?? 0) + (s?.status_classes["5xx"] ?? 0);

  return (
    <div className="stats-row">
      <Card label="Total flows" value={s?.total ?? 0} />
      <Card
        label="Mocked"
        value={s?.mocked ?? 0}
        tone={s?.mocked ? "purple" : undefined}
      />
      <Card
        label="Errors (4xx/5xx)"
        value={errors}
        tone={errors ? "amber" : undefined}
      />
      <Card label="Avg latency" value={ms(s?.avg_ms ?? 0)} sub={`p95 ${ms(s?.p95_ms ?? 0)}`} />
      <Card label="Data received" value={bytes(s?.bytes_in ?? 0)} />
    </div>
  );
}

function Card({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: number | string;
  sub?: string;
  tone?: "red" | "green" | "amber" | "purple";
}) {
  return (
    <div className="card">
      <div className="label">{label}</div>
      <div className={`value ${tone ?? ""}`}>{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}
