"use client";

import type { CommitteeStatus } from "@/lib/types";
import { CheckCircle, Circle, Clock } from "lucide-react";

const STEPS: Array<{ key: CommitteeStatus; label: string }> = [
  { key: "draft", label: "Draft" },
  { key: "open_for_proposals", label: "Open for Proposals" },
  { key: "proposal_submission_closed", label: "Proposals Closed" },
  { key: "under_consensus_review", label: "Consensus Review" },
  { key: "appeal_window_open", label: "Appeal Window" },
  { key: "finalized", label: "Finalized" },
];

const STATUS_ORDER: Record<string, number> = {
  draft: 0,
  open_for_proposals: 1,
  proposal_submission_closed: 2,
  under_consensus_review: 3,
  recommendation_issued: 3,
  appeal_window_open: 4,
  appeal_under_review: 4,
  finalized: 5,
};

interface RecommendationTimelineProps {
  status: CommitteeStatus;
}

export function RecommendationTimeline({ status }: RecommendationTimelineProps) {
  const currentOrder = STATUS_ORDER[status] ?? 0;

  return (
    <div className="panel p-4">
      <p className="text-xs font-mono text-slate-grey uppercase tracking-wider mb-4">Committee Lifecycle</p>
      <div className="relative">
        <div className="absolute left-3.5 top-0 bottom-0 w-px bg-committee-blue/20" />
        <div className="space-y-3">
          {STEPS.map((step, i) => {
            const done = STATUS_ORDER[step.key] < currentOrder;
            const active = STATUS_ORDER[step.key] === currentOrder;
            return (
              <div key={step.key} className="flex items-center gap-3 relative z-10">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                  done ? "bg-liquidity-green/20" :
                  active ? "bg-committee-blue/20 ring-2 ring-signal-cyan/50" :
                  "bg-graphite border border-white/10"
                }`}>
                  {done ? (
                    <CheckCircle size={14} className="text-liquidity-green" />
                  ) : active ? (
                    <Clock size={14} className="text-signal-cyan pulse-blue" />
                  ) : (
                    <Circle size={14} className="text-white/20" />
                  )}
                </div>
                <span className={`text-sm ${
                  done ? "text-paper-white/60" :
                  active ? "text-paper-white font-semibold" :
                  "text-slate-grey"
                }`}>
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
