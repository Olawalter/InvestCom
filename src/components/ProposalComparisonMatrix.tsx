"use client";

import type { InvestmentProposal, RecommendationResult } from "@/lib/types";
import { bpsToPercent, formatAddress } from "@/lib/utils";
import { CheckCircle } from "lucide-react";

interface ProposalComparisonMatrixProps {
  proposals: InvestmentProposal[];
  recommendation?: RecommendationResult | null;
}

export function ProposalComparisonMatrix({ proposals, recommendation }: ProposalComparisonMatrixProps) {
  if (!proposals.length) return null;

  return (
    <div className="panel overflow-x-auto">
      <table className="w-full text-xs font-mono">
        <thead>
          <tr className="border-b border-white/10">
            <th className="text-left p-3 text-slate-grey font-normal">Proposal</th>
            <th className="text-left p-3 text-slate-grey font-normal">Strategy</th>
            <th className="text-right p-3 text-slate-grey font-normal">Allocation</th>
            <th className="text-left p-3 text-slate-grey font-normal">Hold Period</th>
            <th className="text-left p-3 text-slate-grey font-normal">Proposer</th>
            <th className="text-center p-3 text-slate-grey font-normal">Evidence</th>
          </tr>
        </thead>
        <tbody>
          {proposals.map((p) => {
            const isRec = recommendation?.recommended_proposal_id === p.proposal_id;
            return (
              <tr
                key={p.proposal_id}
                className={`border-b border-white/5 transition-colors ${
                  isRec ? "bg-liquidity-green/5" : "hover:bg-white/2"
                }`}
              >
                <td className="p-3">
                  <div className="flex items-center gap-2">
                    {isRec && <CheckCircle size={12} className="text-liquidity-green flex-shrink-0" />}
                    <span className={`font-display font-medium text-xs ${isRec ? "text-liquidity-green" : "text-paper-white"}`}>
                      #{p.proposal_id} {p.title.length > 40 ? p.title.slice(0, 40) + "…" : p.title}
                    </span>
                  </div>
                </td>
                <td className="p-3 text-slate-grey">{p.asset_or_strategy}</td>
                <td className="p-3 text-right text-policy-gold">{bpsToPercent(p.allocation_bps)}</td>
                <td className="p-3 text-slate-grey">{p.expected_holding_period}</td>
                <td className="p-3 text-slate-grey">{formatAddress(p.proposer)}</td>
                <td className="p-3 text-center text-signal-cyan">{p.evidence_urls?.length ?? 0}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
