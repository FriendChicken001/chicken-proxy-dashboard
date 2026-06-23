"use client";

import type { Stats } from "@/lib/types";
import { bytes, ms } from "@/lib/format";

export default function StatsBar({ stats }: { stats: Stats | null }) {
  const s = stats;
  const errors =
    (s?.status_classes["4xx"] ?? 0) + (s?.status_classes["5xx"] ?? 0);

  return (
    <div className="grid gap-3 px-5 pt-4 pb-1" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
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
      <Card label="Avg latency" value={ms(s?.avg_ms ?? 0)} sub={undefined} />
      <Card label="Data received" value={bytes(s?.bytes_in ?? 0)} />
    </div>
  );
}

const toneColors: Record<string, string> = {
  green: "text-[var(--green)]",
  red: "text-[var(--red)]",
  amber: "text-[var(--amber)]",
  purple: "text-[var(--purple)]",
};

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
    <div className="bg-[var(--panel)] border border-[var(--border)] rounded-[10px] px-4 py-[14px]">
      <div className="text-[var(--muted)] text-[11px] uppercase tracking-[0.04em]">{label}</div>
      <div className={`text-2xl font-semibold mt-[6px] tabular-nums ${tone ? toneColors[tone] : "text-[var(--text)]"}`}>{value}</div>
      {sub && <div className="text-[var(--faint)] text-[11px] mt-[2px]">{sub}</div>}
    </div>
  );
}
