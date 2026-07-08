"use client";

import { bandScore, bandColor } from "@/lib/utils";

interface BandMeterProps {
  label: string;
  band: string;
  color?: "cyan" | "gold" | "green" | "purple" | "red";
}

const colorMap = {
  cyan: "bg-signal-cyan",
  gold: "bg-policy-gold",
  green: "bg-liquidity-green",
  purple: "bg-governance-purple",
  red: "bg-risk-red",
};

export function RiskBandMeter({ label, band, color = "cyan" }: BandMeterProps) {
  const score = bandScore(band);
  const barColor = colorMap[color];

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-grey font-mono uppercase tracking-wider">{label}</span>
        <span className={`text-xs font-mono font-semibold uppercase ${bandColor(band)}`}>{band}</span>
      </div>
      <div className="h-1.5 bg-graphite rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${barColor}`}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}

interface LiquidityGaugeProps {
  band: string;
}

export function LiquidityGauge({ band }: LiquidityGaugeProps) {
  return <RiskBandMeter label="Liquidity" band={band} color="cyan" />;
}

interface FundamentalsPanelProps {
  band: string;
}

export function FundamentalsPanel({ band }: FundamentalsPanelProps) {
  return <RiskBandMeter label="Fundamentals" band={band} color="green" />;
}

interface GovernanceRiskPanelProps {
  band: string;
}

export function GovernanceRiskPanel({ band }: GovernanceRiskPanelProps) {
  return <RiskBandMeter label="Governance" band={band} color="purple" />;
}
