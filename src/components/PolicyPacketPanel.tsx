"use client";

import type { InvestmentCommittee } from "@/lib/types";
import { bpsToPercent } from "@/lib/utils";
import { Shield, Droplets, Target, AlertTriangle } from "lucide-react";

interface PolicyPacketPanelProps {
  committee: InvestmentCommittee;
}

export function PolicyPacketPanel({ committee: c }: PolicyPacketPanelProps) {
  return (
    <div className="panel-gold p-6 space-y-5">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-7 h-7 rounded-lg bg-policy-gold/20 flex items-center justify-center">
          <Shield size={14} className="text-policy-gold" />
        </div>
        <h3 className="font-display font-semibold text-paper-white">Investment Policy Packet</h3>
      </div>

      {/* Treasury objective */}
      <div className="space-y-1">
        <p className="text-xs text-slate-grey uppercase tracking-wider font-mono">Treasury Objective</p>
        <p className="text-sm text-paper-white leading-relaxed">{c.treasury_objective}</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Risk appetite */}
        <div className="space-y-1">
          <p className="text-xs text-slate-grey uppercase tracking-wider font-mono">Risk Appetite</p>
          <span className={`text-sm font-semibold capitalize ${
            c.risk_appetite === "conservative" ? "text-liquidity-green" :
            c.risk_appetite === "moderate" ? "text-policy-gold" : "text-risk-red"
          }`}>{c.risk_appetite}</span>
        </div>

        {/* Concentration limits */}
        <div className="space-y-1">
          <p className="text-xs text-slate-grey uppercase tracking-wider font-mono">Max Single Asset</p>
          <p className="text-sm text-paper-white font-mono">{bpsToPercent(c.max_single_asset_exposure_bps)}</p>
        </div>
      </div>

      {/* Liquidity requirement */}
      <div className="space-y-1">
        <div className="flex items-center gap-1.5">
          <Droplets size={12} className="text-signal-cyan" />
          <p className="text-xs text-slate-grey uppercase tracking-wider font-mono">Liquidity Requirement</p>
        </div>
        <p className="text-sm text-paper-white">{c.liquidity_requirement}</p>
      </div>

      {/* Allowed / disallowed */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <p className="text-xs text-slate-grey uppercase tracking-wider font-mono flex items-center gap-1">
            <Target size={10} className="text-liquidity-green" /> Allowed
          </p>
          <div className="flex flex-wrap gap-1">
            {c.allowed_asset_classes.map((a) => (
              <span key={a} className="band-pill bg-liquidity-green/10 text-liquidity-green border border-liquidity-green/20">
                {a}
              </span>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-xs text-slate-grey uppercase tracking-wider font-mono flex items-center gap-1">
            <AlertTriangle size={10} className="text-risk-red" /> Disallowed
          </p>
          <div className="flex flex-wrap gap-1">
            {c.disallowed_assets.map((a) => (
              <span key={a} className="band-pill bg-risk-red/10 text-risk-red border border-risk-red/20">
                {a}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Evaluation weights */}
      <div className="space-y-2">
        <p className="text-xs text-slate-grey uppercase tracking-wider font-mono">Evaluation Weights</p>
        <div className="space-y-1.5">
          {Object.entries(c.evaluation_weights).map(([key, value]) => (
            <div key={key} className="flex items-center gap-3">
              <span className="text-xs font-mono text-slate-grey w-40 capitalize">{key.replace(/_/g, " ")}</span>
              <div className="flex-1 h-1.5 bg-graphite rounded-full overflow-hidden">
                <div
                  className="h-full bg-policy-gold rounded-full"
                  style={{ width: `${value}%` }}
                />
              </div>
              <span className="text-xs font-mono text-policy-gold w-8 text-right">{value}%</span>
            </div>
          ))}
        </div>
      </div>

      {/* Governance constraints */}
      {c.governance_constraints && (
        <div className="space-y-1">
          <p className="text-xs text-slate-grey uppercase tracking-wider font-mono">Governance Constraints</p>
          <p className="text-sm text-paper-white/80">{c.governance_constraints}</p>
        </div>
      )}
    </div>
  );
}
