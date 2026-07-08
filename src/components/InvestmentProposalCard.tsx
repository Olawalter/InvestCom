"use client";

import type { InvestmentProposal } from "@/lib/types";
import { formatAddress, bpsToPercent, truncate } from "@/lib/utils";
import { Calendar, User, TrendingUp, Shield, Droplets, BookOpen } from "lucide-react";
import Link from "next/link";

interface InvestmentProposalCardProps {
  proposal: InvestmentProposal;
  isRecommended?: boolean;
  committeeId?: number;
}

export function InvestmentProposalCard({ proposal: p, isRecommended, committeeId }: InvestmentProposalCardProps) {
  return (
    <div className={`panel p-5 space-y-4 transition-all hover:border-committee-blue/40 ${
      isRecommended ? "border-liquidity-green/40 glow-green" : ""
    }`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {isRecommended && (
            <span className="band-pill bg-liquidity-green/10 text-liquidity-green border border-liquidity-green/30 mb-2 inline-block">
              ✓ Recommended
            </span>
          )}
          <h3 className="font-display font-semibold text-paper-white text-sm leading-snug">
            {p.title}
          </h3>
        </div>
        <span className="band-pill bg-committee-blue/10 text-signal-cyan border border-committee-blue/20 flex-shrink-0">
          #{p.proposal_id}
        </span>
      </div>

      {/* Summary */}
      <p className="text-xs text-slate-grey leading-relaxed">{truncate(p.summary, 200)}</p>

      {/* Key metrics */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="flex items-center gap-2 text-slate-grey">
          <TrendingUp size={12} className="text-signal-cyan flex-shrink-0" />
          <span className="truncate">{p.asset_or_strategy}</span>
        </div>
        <div className="flex items-center gap-2 text-slate-grey">
          <Shield size={12} className="text-policy-gold flex-shrink-0" />
          <span>{bpsToPercent(p.allocation_bps)} allocation</span>
        </div>
        <div className="flex items-center gap-2 text-slate-grey">
          <Calendar size={12} className="text-governance-purple flex-shrink-0" />
          <span>{p.expected_holding_period}</span>
        </div>
        <div className="flex items-center gap-2 text-slate-grey">
          <User size={12} className="text-slate-grey flex-shrink-0" />
          <span className="font-mono">{formatAddress(p.proposer)}</span>
        </div>
      </div>

      {/* Evidence URLs */}
      {p.evidence_urls && p.evidence_urls.length > 0 && (
        <div className="flex items-center gap-1.5 text-xs text-slate-grey">
          <BookOpen size={11} className="text-signal-cyan" />
          <span>{p.evidence_urls.length} evidence source{p.evidence_urls.length > 1 ? "s" : ""}</span>
        </div>
      )}

      {committeeId && (
        <div className="pt-1 border-t border-white/5">
          <Link
            href={`/committees/${committeeId}`}
            className="text-xs text-committee-blue hover:text-signal-cyan transition-colors"
          >
            View committee →
          </Link>
        </div>
      )}
    </div>
  );
}
