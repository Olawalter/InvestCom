"use client";

import type { InvestmentCommittee } from "@/lib/types";
import { statusLabel, statusColor, formatDate } from "@/lib/utils";
import { Clock } from "lucide-react";

export function TreasuryObjectiveBanner({ committee: c }: { committee: InvestmentCommittee }) {
  const now = Math.floor(Date.now() / 1000);
  const deadlinePassed = now >= c.proposal_deadline;

  return (
    <div className="bg-graphite border-b border-committee-blue/20 px-6 py-4">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h1 className="font-display text-xl font-bold text-paper-white">{c.dao_name}</h1>
              <span className={`band-pill border bg-transparent ${statusColor(c.status)} border-current`}>
                {statusLabel(c.status)}
              </span>
            </div>
            <p className="text-sm text-slate-grey max-w-2xl">{c.treasury_objective}</p>
          </div>
          <div className="flex items-center gap-2 text-xs font-mono text-slate-grey">
            <Clock size={12} className={deadlinePassed ? "text-risk-red" : "text-signal-cyan"} />
            <span>
              {deadlinePassed ? "Deadline passed" : "Deadline:"}{" "}
              {formatDate(c.proposal_deadline)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
