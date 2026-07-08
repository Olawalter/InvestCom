"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useWallet } from "@/context/WalletContext";
import { getCommittee, getCommitteeProposals, getRecommendationResult } from "@/lib/genlayer";
import type { InvestmentCommittee, InvestmentProposal, RecommendationResult } from "@/lib/types";
import { CommitteeRecommendationSeal } from "@/components/CommitteeRecommendationSeal";
import { PolicyFitGrid } from "@/components/PolicyFitGrid";
import { InvestmentProposalCard } from "@/components/InvestmentProposalCard";
import { ExplorerLinkCard } from "@/components/ExplorerLinkCard";
import { RecommendationTimeline } from "@/components/RecommendationTimeline";
import { formatDate } from "@/lib/utils";
import { Loader2, RefreshCw } from "lucide-react";

export default function RecommendationPage() {
  const { committeeId } = useParams<{ committeeId: string }>();
  const { client } = useWallet();
  const cid = Number(committeeId);

  const [committee, setCommittee] = useState<InvestmentCommittee | null>(null);
  const [proposals, setProposals] = useState<InvestmentProposal[]>([]);
  const [recommendation, setRecommendation] = useState<RecommendationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      const [c, props] = await Promise.all([
        getCommittee(client, cid),
        getCommitteeProposals(client, cid),
      ]);
      setCommittee(c as unknown as InvestmentCommittee);
      setProposals(props as unknown as InvestmentProposal[]);
      try {
        const rec = await getRecommendationResult(client, cid);
        setRecommendation(rec as unknown as RecommendationResult);
      } catch {
        setError("No recommendation issued yet for this committee.");
      }
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [client, cid]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96 gap-3 text-slate-grey">
        <Loader2 className="animate-spin" size={20} />
        <span>Loading recommendation…</span>
      </div>
    );
  }

  const recommendedProposal = recommendation
    ? proposals.find((p) => p.proposal_id === recommendation.recommended_proposal_id)
    : null;

  return (
    <div className="min-h-screen">
      {committee && (
        <div className="bg-graphite border-b border-committee-blue/20 px-6 py-4">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div>
              <Link href={`/committees/${cid}`} className="text-sm text-slate-grey hover:text-paper-white transition-colors">
                ← {committee.dao_name}
              </Link>
              <h1 className="font-display text-2xl font-bold text-paper-white mt-1">Consensus Recommendation</h1>
            </div>
            <button onClick={load} className="p-2 text-slate-grey hover:text-paper-white border border-white/10 rounded-lg transition-colors">
              <RefreshCw size={14} />
            </button>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && !recommendation && (
          <div className="panel border-slate-grey/30 p-8 text-center space-y-3">
            <p className="text-paper-white font-display text-lg">No Recommendation Yet</p>
            <p className="text-slate-grey text-sm">{error}</p>
            <Link href={`/committees/${cid}`} className="text-committee-blue hover:text-signal-cyan transition-colors text-sm">
              ← Back to committee
            </Link>
          </div>
        )}

        {recommendation && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-8">
              {/* Main seal */}
              <CommitteeRecommendationSeal result={recommendation} proposalTitle={recommendedProposal?.title} />

              {/* Policy fit grid */}
              <div className="space-y-4">
                <h2 className="font-display text-xl font-bold text-paper-white">Policy Fit Analysis</h2>
                <PolicyFitGrid result={recommendation} />
              </div>

              {/* Recommended proposal detail */}
              {recommendedProposal && (
                <div className="space-y-4">
                  <h2 className="font-display text-xl font-bold text-paper-white">Recommended Proposal</h2>
                  <InvestmentProposalCard proposal={recommendedProposal} isRecommended />
                  <div className="panel p-5 space-y-4">
                    {[
                      { label: "Risk Thesis", content: recommendedProposal.risk_thesis },
                      { label: "Fundamental Thesis", content: recommendedProposal.fundamental_thesis },
                      { label: "Governance Risks", content: recommendedProposal.governance_risks },
                      { label: "Liquidity Profile", content: recommendedProposal.liquidity_profile },
                    ].map(({ label, content }) => (
                      <div key={label} className="space-y-1">
                        <p className="text-xs font-mono text-slate-grey uppercase tracking-wider">{label}</p>
                        <p className="text-sm text-paper-white/90 leading-relaxed">{content}</p>
                      </div>
                    ))}
                    {recommendedProposal.evidence_urls.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-mono text-slate-grey uppercase tracking-wider">Evidence Sources</p>
                        {recommendedProposal.evidence_urls.map((url, i) => (
                          <a key={i} href={url} target="_blank" rel="noreferrer"
                            className="block text-xs font-mono text-committee-blue hover:text-signal-cyan transition-colors truncate">
                            {url}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* All proposals for comparison */}
              {proposals.length > 1 && (
                <div className="space-y-4">
                  <h2 className="font-display text-xl font-bold text-paper-white">All Proposals Evaluated</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {proposals.map((p) => (
                      <InvestmentProposalCard
                        key={p.proposal_id}
                        proposal={p}
                        isRecommended={recommendation.recommended_proposal_id === p.proposal_id}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Sidebar */}
            <div className="space-y-5">
              {committee && <RecommendationTimeline status={committee.status} />}

              <div className="panel p-4 space-y-3">
                <p className="text-xs font-mono text-slate-grey uppercase tracking-wider">Recommendation Meta</p>
                <div className="space-y-2 text-xs font-mono">
                  <div className="flex justify-between text-slate-grey">
                    <span>Issued</span>
                    <span className="text-paper-white">{formatDate(recommendation.issued_at)}</span>
                  </div>
                  <div className="flex justify-between text-slate-grey">
                    <span>Confidence</span>
                    <span className="text-policy-gold">{recommendation.confidence}%</span>
                  </div>
                  <div className="flex justify-between text-slate-grey">
                    <span>Appeal Allowed</span>
                    <span className={recommendation.appeal_allowed ? "text-liquidity-green" : "text-risk-red"}>
                      {recommendation.appeal_allowed ? "Yes" : "No"}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-grey">
                    <span>Reason Code</span>
                    <span className="text-signal-cyan">{recommendation.reason_code}</span>
                  </div>
                </div>
              </div>

              {committee?.status === "appeal_window_open" && recommendation.appeal_allowed && (
                <Link
                  href={`/committees/${cid}/appeal`}
                  className="block text-center px-4 py-3 bg-governance-purple/10 border border-governance-purple/30 hover:border-governance-purple text-governance-purple font-display font-semibold text-sm rounded-xl transition-all"
                >
                  File Appeal →
                </Link>
              )}

              <ExplorerLinkCard label="GenLayer Contract" isContract />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
