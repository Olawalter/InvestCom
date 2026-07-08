"use client";

import type { RecommendationResult } from "@/lib/types";
import { bandColor, bandScore } from "@/lib/utils";

interface PolicyFitGridProps {
  result: RecommendationResult;
}

const GRID_ITEMS = [
  { key: "policy_fit_band" as const, label: "Policy Fit" },
  { key: "risk_band" as const, label: "Risk" },
  { key: "liquidity_band" as const, label: "Liquidity" },
  { key: "fundamentals_band" as const, label: "Fundamentals" },
  { key: "governance_band" as const, label: "Governance" },
  { key: "treasury_objective_fit" as const, label: "Treasury Fit" },
];

type BandKey = "policy_fit_band" | "risk_band" | "liquidity_band" | "fundamentals_band" | "governance_band" | "treasury_objective_fit";

export function PolicyFitGrid({ result }: PolicyFitGridProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {GRID_ITEMS.map(({ key, label }) => {
        const band = result[key as BandKey] as string;
        const score = bandScore(band);
        return (
          <div key={key} className="panel p-3 text-center space-y-2">
            <p className="text-xs font-mono text-slate-grey uppercase tracking-wider">{label}</p>
            <div className="relative w-12 h-12 mx-auto">
              <svg className="w-12 h-12 -rotate-90" viewBox="0 0 48 48">
                <circle cx="24" cy="24" r="20" stroke="currentColor" strokeWidth="3" fill="none" className="text-graphite" />
                <circle
                  cx="24" cy="24" r="20"
                  stroke="currentColor" strokeWidth="3" fill="none"
                  className={bandColor(band).replace("text-", "text-")}
                  strokeDasharray={`${(score / 100) * 125.6} 125.6`}
                  strokeLinecap="round"
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-xs font-mono font-bold text-paper-white">
                {score}
              </span>
            </div>
            <p className={`text-xs font-mono font-semibold uppercase ${bandColor(band)}`}>{band}</p>
          </div>
        );
      })}
    </div>
  );
}
