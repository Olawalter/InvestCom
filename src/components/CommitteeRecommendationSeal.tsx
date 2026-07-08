"use client";

import type { RecommendationResult, Verdict } from "@/lib/types";
import { verdictLabel, verdictColor, bandColor } from "@/lib/utils";
import { CheckCircle, XCircle, AlertCircle, Scale, FileWarning, Eye } from "lucide-react";
import { RiskBandMeter, LiquidityGauge, FundamentalsPanel, GovernanceRiskPanel } from "./RiskBandMeter";

const verdictIcons: Partial<Record<Verdict, React.ReactNode>> = {
  proposal_recommended: <CheckCircle size={32} className="text-liquidity-green" />,
  no_suitable_proposal: <XCircle size={32} className="text-risk-red" />,
  tie_detected: <Scale size={32} className="text-policy-gold" />,
  insufficient_evidence: <AlertCircle size={32} className="text-slate-grey" />,
  policy_violation_detected: <FileWarning size={32} className="text-risk-red" />,
  manual_review_required: <Eye size={32} className="text-governance-purple" />,
};

interface CommitteeRecommendationSealProps {
  result: RecommendationResult;
  proposalTitle?: string;
}

export function CommitteeRecommendationSeal({ result, proposalTitle }: CommitteeRecommendationSealProps) {
  const icon = verdictIcons[result.verdict] ?? <CheckCircle size={32} className="text-signal-cyan" />;

  return (
    <div className="space-y-6">
      {/* Seal header */}
      <div className="flex flex-col items-center text-center gap-3 py-8 panel-gold relative overflow-hidden">
        {/* Background glow */}
        <div className="absolute inset-0 bg-gradient-radial from-policy-gold/5 to-transparent pointer-events-none" />

        <div className="seal-ring p-6 relative z-10">
          {icon}
        </div>
        <div className="relative z-10 space-y-1">
          <p className="text-xs font-mono text-slate-grey uppercase tracking-widest">Consensus Verdict</p>
          <h2 className={`font-display text-2xl font-bold ${verdictColor(result.verdict)}`}>
            {verdictLabel(result.verdict)}
          </h2>
          {result.verdict === "proposal_recommended" && proposalTitle && (
            <p className="text-sm text-paper-white/80 max-w-md mt-1">
              {proposalTitle}
            </p>
          )}
        </div>
        <div className="relative z-10 flex items-center gap-2 mt-1">
          <div className="flex-1 h-px w-12 bg-policy-gold/30" />
          <span className="text-xs font-mono text-policy-gold">Confidence {result.confidence}%</span>
          <div className="flex-1 h-px w-12 bg-policy-gold/30" />
        </div>
      </div>

      {/* Band grid */}
      <div className="panel p-5 space-y-4">
        <p className="text-xs font-mono text-slate-grey uppercase tracking-wider">Policy Evaluation Bands</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <RiskBandMeter label="Policy Fit" band={result.policy_fit_band} color="gold" />
          <RiskBandMeter label="Risk" band={result.risk_band} color="red" />
          <LiquidityGauge band={result.liquidity_band} />
          <FundamentalsPanel band={result.fundamentals_band} />
          <GovernanceRiskPanel band={result.governance_band} />
          <RiskBandMeter label="Treasury Objective Fit" band={result.treasury_objective_fit} color="gold" />
        </div>
      </div>

      {/* Reason */}
      {result.short_reason && (
        <div className="panel p-5 space-y-2">
          <p className="text-xs font-mono text-slate-grey uppercase tracking-wider">Reason</p>
          <p className="text-sm text-paper-white leading-relaxed">{result.short_reason}</p>
          {result.reason_code && (
            <span className="band-pill bg-committee-blue/10 text-signal-cyan border border-committee-blue/30 mt-2 inline-block">
              {result.reason_code}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
