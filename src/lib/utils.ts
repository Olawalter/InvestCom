import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type {
  RiskBand,
  LiquidityBand,
  PolicyFitBand,
  FundamentalsBand,
  GovernanceBand,
  ObjectiveFitBand,
  CommitteeStatus,
  Verdict,
} from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatAddress(address: string) {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function formatDate(timestamp: number) {
  return new Date(timestamp * 1000).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function bpsToPercent(bps: number) {
  return (bps / 100).toFixed(1) + "%";
}

export function statusLabel(status: CommitteeStatus): string {
  const labels: Record<CommitteeStatus, string> = {
    draft: "Draft",
    open_for_proposals: "Open for Proposals",
    proposal_submission_closed: "Proposals Closed",
    under_consensus_review: "Under Review",
    recommendation_issued: "Recommendation Issued",
    appeal_window_open: "Appeal Window Open",
    appeal_under_review: "Appeal Under Review",
    finalized: "Finalized",
    cancelled: "Cancelled",
    no_suitable_proposal: "No Suitable Proposal",
    insufficient_evidence: "Insufficient Evidence",
    policy_violation_detected: "Policy Violation",
    manual_review_required: "Manual Review Required",
  };
  return labels[status] ?? status;
}

export function statusColor(status: CommitteeStatus): string {
  switch (status) {
    case "open_for_proposals": return "text-liquidity-green";
    case "under_consensus_review": return "text-signal-cyan";
    case "recommendation_issued":
    case "appeal_window_open": return "text-policy-gold";
    case "finalized": return "text-committee-blue";
    case "cancelled": return "text-risk-red";
    case "appeal_under_review": return "text-governance-purple";
    default: return "text-slate-grey";
  }
}

export function verdictLabel(verdict: Verdict): string {
  const labels: Record<Verdict, string> = {
    proposal_recommended: "Proposal Recommended",
    no_suitable_proposal: "No Suitable Proposal",
    tie_detected: "Tie Detected",
    insufficient_evidence: "Insufficient Evidence",
    policy_violation_detected: "Policy Violation Detected",
    manual_review_required: "Manual Review Required",
    appeal_granted: "Appeal Granted",
    appeal_rejected: "Appeal Rejected",
  };
  return labels[verdict] ?? verdict;
}

export function verdictColor(verdict: Verdict): string {
  switch (verdict) {
    case "proposal_recommended": return "text-liquidity-green";
    case "no_suitable_proposal":
    case "policy_violation_detected": return "text-risk-red";
    case "tie_detected": return "text-policy-gold";
    case "insufficient_evidence": return "text-slate-grey";
    case "manual_review_required": return "text-governance-purple";
    default: return "text-paper-white";
  }
}

export function bandColor(band: string): string {
  const positive = new Set(["strong", "excellent", "low", "minimal"]);
  const caution = new Set(["acceptable", "moderate"]);
  const negative = new Set(["poor", "weak", "excessive", "high", "illiquid", "questionable", "dangerous", "misaligned"]);
  if (positive.has(band)) return "text-liquidity-green";
  if (caution.has(band)) return "text-policy-gold";
  if (negative.has(band)) return "text-risk-red";
  return "text-slate-grey";
}

export function bandScore(band: string): number {
  const scores: Record<string, number> = {
    excellent: 100, strong: 80, acceptable: 60, weak: 35, poor: 15,
    minimal: 100, low: 80, moderate: 60, high: 30, excessive: 10,
    illiquid: 5, questionable: 35, dangerous: 5,
    misaligned: 10,
  };
  return scores[band] ?? 50;
}

export function riskBandColor(band: RiskBand): string {
  const map: Record<RiskBand, string> = {
    minimal: "text-liquidity-green",
    low: "text-liquidity-green",
    moderate: "text-policy-gold",
    high: "text-risk-red",
    excessive: "text-risk-red",
  };
  return map[band];
}

export function truncate(str: string, max = 100) {
  if (!str) return "";
  return str.length > max ? str.slice(0, max) + "…" : str;
}
