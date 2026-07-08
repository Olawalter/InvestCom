"use client";

import { bpsToPercent } from "@/lib/utils";

interface AllocationLimitMeterProps {
  label: string;
  current: number;
  max: number;
}

export function AllocationLimitMeter({ label, current, max }: AllocationLimitMeterProps) {
  const pct = Math.min((current / max) * 100, 100);
  const isOver = current > max;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs font-mono">
        <span className="text-slate-grey">{label}</span>
        <span className={isOver ? "text-risk-red" : "text-paper-white"}>
          {bpsToPercent(current)} / {bpsToPercent(max)}
        </span>
      </div>
      <div className="h-2 bg-graphite rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${isOver ? "bg-risk-red" : "bg-committee-blue"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
