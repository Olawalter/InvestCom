export type RiskAppetite = "conservative" | "moderate" | "aggressive";

export type CommitteeStatus =
  | "draft"
  | "open_for_proposals"
  | "proposal_submission_closed"
  | "under_consensus_review"
  | "recommendation_issued"
  | "appeal_window_open"
  | "appeal_under_review"
  | "finalized"
  | "cancelled"
  | "no_suitable_proposal"
  | "insufficient_evidence"
  | "policy_violation_detected"
  | "manual_review_required";

export type Verdict =
  | "proposal_recommended"
  | "no_suitable_proposal"
  | "tie_detected"
  | "insufficient_evidence"
  | "policy_violation_detected"
  | "manual_review_required"
  | "appeal_granted"
  | "appeal_rejected";

export type PolicyFitBand = "poor" | "weak" | "acceptable" | "strong" | "excellent";
export type RiskBand = "excessive" | "high" | "moderate" | "low" | "minimal";
export type LiquidityBand = "illiquid" | "weak" | "acceptable" | "strong" | "excellent";
export type FundamentalsBand = "weak" | "questionable" | "acceptable" | "strong" | "excellent";
export type GovernanceBand = "dangerous" | "weak" | "acceptable" | "strong" | "excellent";
export type ObjectiveFitBand = "misaligned" | "weak" | "acceptable" | "strong" | "excellent";

export type AppealBasis =
  | "new_risk_evidence"
  | "liquidity_misread"
  | "fundamental_misread"
  | "governance_risk_misread"
  | "policy_constraint_misapplied"
  | "allocation_limit_error"
  | "evidence_url_misread"
  | "conflict_of_interest_claim";

export interface EvaluationWeights {
  risk: number;
  liquidity: number;
  fundamentals: number;
  governance: number;
  treasury_objective_fit: number;
}

export interface InvestmentCommittee {
  committee_id: number;
  dao: string;
  dao_name: string;
  treasury_objective: string;
  risk_appetite: RiskAppetite;
  liquidity_requirement: string;
  max_single_asset_exposure_bps: number;
  max_protocol_exposure_bps: number;
  allowed_asset_classes: string[];
  disallowed_assets: string[];
  governance_constraints: string;
  evaluation_weights: EvaluationWeights;
  proposal_deadline: number;
  appeal_window: number;
  appeal_deadline?: number;
  status: CommitteeStatus;
  created_at: number;
  finalized: boolean;
}

export interface InvestmentProposal {
  proposal_id: number;
  committee_id: number;
  proposer: string;
  title: string;
  summary: string;
  asset_or_strategy: string;
  allocation_bps: number;
  expected_holding_period: string;
  liquidity_profile: string;
  risk_thesis: string;
  fundamental_thesis: string;
  governance_risks: string;
  evidence_urls: string[];
  submitted_at: number;
  revised_at: number;
  status: string;
}

export interface RecommendationResult {
  committee_id: number;
  verdict: Verdict;
  recommended_proposal_id: number;
  recommended_proposer: string;
  confidence: number;
  policy_fit_band: PolicyFitBand;
  risk_band: RiskBand;
  liquidity_band: LiquidityBand;
  fundamentals_band: FundamentalsBand;
  governance_band: GovernanceBand;
  treasury_objective_fit: ObjectiveFitBand;
  reason_code: string;
  short_reason: string;
  appeal_allowed: boolean;
  issued_at: number;
}

export interface Appeal {
  appeal_id: number;
  committee_id: number;
  filed_by: string;
  basis: AppealBasis;
  statement: string;
  evidence_urls: string[];
  status: "filed" | "reviewed";
  result: {
    appeal_verdict?: string;
    final_recommendation_changed?: boolean;
    new_recommended_proposal_id?: number;
    confidence?: number;
    reason_code?: string;
    short_reason?: string;
  };
  created_at: number;
}
