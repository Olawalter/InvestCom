"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useWallet } from "@/context/WalletContext";
import {
  getCommittee, getCommitteeProposals, getRecommendationResult,
  openCommittee, closeProposals, cancelCommittee, requestRecommendation,
  requestAppealReview, finalizeRecommendation,
} from "@/lib/genlayer";
import type { InvestmentCommittee, InvestmentProposal, RecommendationResult } from "@/lib/types";
import { PolicyPacketPanel } from "@/components/PolicyPacketPanel";
import { TreasuryObjectiveBanner } from "@/components/TreasuryObjectiveBanner";
import { InvestmentProposalCard } from "@/components/InvestmentProposalCard";
import { ProposalComparisonMatrix } from "@/components/ProposalComparisonMatrix";
import { RecommendationTimeline } from "@/components/RecommendationTimeline";
import { CommitteeRecommendationSeal } from "@/components/CommitteeRecommendationSeal";
import { ExplorerLinkCard } from "@/components/ExplorerLinkCard";
import { useToast } from "@/components/ui/Toaster";
import { Loader2, Plus, RefreshCw, FileText, Bell, CheckSquare, XSquare } from "lucide-react";

export default function CommitteeDetailPage() {
  const { committeeId } = useParams<{ committeeId: string }>();
  const router = useRouter();
  const { client, address } = useWallet();
  const { toast } = useToast();

  const [committee, setCommittee] = useState<InvestmentCommittee | null>(null);
  const [proposals, setProposals] = useState<InvestmentProposal[]>([]);
  const [recommendation, setRecommendation] = useState<RecommendationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 5000);
    return () => clearInterval(t);
  }, []);

  const cid = Number(committeeId);

  async function loadAll(): Promise<InvestmentCommittee | null> {
    setLoading(true);
    try {
      const [c, props] = await Promise.all([
        getCommittee(null as any, cid),
        getCommitteeProposals(null as any, cid),
      ]);
      const committee = c as unknown as InvestmentCommittee;
      setCommittee(committee);
      setProposals(props as unknown as InvestmentProposal[]);

      const recStatuses = new Set([
        "recommendation_issued", "appeal_window_open",
        "appeal_under_review", "finalized",
      ]);
      if (recStatuses.has(committee.status)) {
        try {
          const rec = await getRecommendationResult(null as any, cid);
          setRecommendation(rec as unknown as RecommendationResult);
        } catch {
          // no recommendation yet
        }
      }
      return committee;
    } catch (e: unknown) {
      toast({ type: "error", title: "Failed to load committee", description: (e as Error).message });
      return null;
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadAll(); }, [cid]);

  // Actions that invoke LLM consensus need a much longer wait
  const LLM_ACTIONS = new Set(["Request Recommendation", "Appeal Review"]);

  async function doAction(actionName: string, fn: () => Promise<string>) {
    setActionLoading(actionName);
    const statusBefore = committee?.status;
    const isLlm = LLM_ACTIONS.has(actionName);
    // deterministic: 22 × 8s ≈ 3 min | LLM consensus: 75 × 8s = 10 min
    const maxPolls = isLlm ? 75 : 22;
    try {
      const hash = await fn();
      setTxHash(hash as string);
      toast({
        type: "info",
        title: `${actionName} submitted`,
        description: isLlm
          ? "GenLayer validators are evaluating proposals with AI — this takes 3–8 minutes. Stay on this page."
          : "Waiting for GenLayer validators… status updates automatically (30–120s).",
      });

      for (let i = 0; i < maxPolls; i++) {
        await new Promise((r) => setTimeout(r, 8000));
        const latest = await loadAll();
        if (latest && latest.status !== statusBefore) {
          toast({
            type: "success",
            title: `${actionName} confirmed`,
            description: `Status → ${latest.status.replace(/_/g, " ")}`,
          });
          return;
        }
        // Midpoint reminder for LLM actions so the user knows it's still running
        if (isLlm && i === 22) {
          toast({
            type: "info",
            title: "Still in consensus",
            description: "AI validators are still deliberating — up to 10 min total. Do not close the page.",
          });
        }
      }
      toast({
        type: "info",
        title: "Taking longer than expected",
        description: "Use the refresh button to check status. The tx was submitted — consensus may still be in progress.",
      });
    } catch (e: unknown) {
      const msg = (e as { message?: string })?.message ?? String(e);
      toast({ type: "error", title: `${actionName} failed`, description: msg });
    } finally {
      setActionLoading(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96 gap-3 text-slate-grey">
        <Loader2 className="animate-spin" size={20} />
        <span>Loading committee…</span>
      </div>
    );
  }

  if (!committee) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center space-y-4">
        <p className="text-paper-white font-display text-xl">Committee not found</p>
        <Link href="/committees" className="text-committee-blue hover:text-signal-cyan transition-colors text-sm">
          ← Back to committees
        </Link>
      </div>
    );
  }

  const isDao = !!address && address.toLowerCase() === committee.dao?.toLowerCase();
  const canOpen = isDao && committee.status === "draft";
  const canClose = isDao && committee.status === "open_for_proposals" && proposals.length > 0;
  const canCancel = isDao && !["finalized", "cancelled"].includes(committee.status);
  const deadlinePassed = now >= committee.proposal_deadline;
  const canRequestRec = isDao && committee.status === "proposal_submission_closed" && deadlinePassed;
  const waitingForDeadline = isDao && committee.status === "proposal_submission_closed" && !deadlinePassed;
  const canRequestAppealReview = isDao && committee.status === "appeal_under_review";
  const canFinalize = isDao && (committee.status === "appeal_window_open" || committee.status === "recommendation_issued");

  const secsUntilDeadline = Math.max(0, committee.proposal_deadline - now);
  function fmtCountdown(secs: number) {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  }

  const recommendedProposal = recommendation
    ? proposals.find((p) => p.proposal_id === recommendation.recommended_proposal_id)
    : null;

  return (
    <div className="min-h-screen">
      <TreasuryObjectiveBanner committee={committee} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Top actions bar */}
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <Link href="/committees" className="text-sm text-slate-grey hover:text-paper-white transition-colors">
            ← Committees
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={loadAll} className="p-2 text-slate-grey hover:text-paper-white border border-white/10 rounded-lg transition-colors">
              <RefreshCw size={14} />
            </button>
            {committee.status === "open_for_proposals" && (
              <Link
                href={`/committees/${cid}/submit-proposal`}
                className="flex items-center gap-2 px-4 py-2 bg-committee-blue hover:bg-committee-blue/80 text-white font-display font-semibold text-sm rounded-xl transition-all"
              >
                <Plus size={14} /> Submit Proposal
              </Link>
            )}
            {(committee.status === "appeal_window_open") && (
              <Link
                href={`/committees/${cid}/appeal`}
                className="flex items-center gap-2 px-4 py-2 bg-governance-purple/20 border border-governance-purple/40 hover:border-governance-purple text-governance-purple font-display font-semibold text-sm rounded-xl transition-all"
              >
                <FileText size={14} /> File Appeal
              </Link>
            )}
            {recommendation && (
              <Link
                href={`/committees/${cid}/recommendation`}
                className="flex items-center gap-2 px-4 py-2 bg-policy-gold/10 border border-policy-gold/30 hover:border-policy-gold text-policy-gold font-display font-semibold text-sm rounded-xl transition-all"
              >
                <Bell size={14} /> Recommendation
              </Link>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main column */}
          <div className="lg:col-span-2 space-y-8">
            {/* Recommendation seal if available */}
            {recommendation && (
              <CommitteeRecommendationSeal result={recommendation} proposalTitle={recommendedProposal?.title} />
            )}

            {/* Proposals */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-xl font-bold text-paper-white">
                  Proposals <span className="text-slate-grey text-base font-normal">({proposals.length})</span>
                </h2>
              </div>

              {proposals.length === 0 ? (
                <div className="panel p-8 text-center space-y-3">
                  <p className="text-slate-grey">No proposals submitted yet.</p>
                  {committee.status === "open_for_proposals" && (
                    <Link
                      href={`/committees/${cid}/submit-proposal`}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-committee-blue text-white font-display font-semibold text-sm rounded-xl hover:bg-committee-blue/80 transition-all"
                    >
                      <Plus size={14} /> Submit First Proposal
                    </Link>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <ProposalComparisonMatrix proposals={proposals} recommendation={recommendation} />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {proposals.map((p) => (
                      <InvestmentProposalCard
                        key={p.proposal_id}
                        proposal={p}
                        isRecommended={recommendation?.recommended_proposal_id === p.proposal_id}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-5">
            {/* Lifecycle */}
            <RecommendationTimeline status={committee.status} />

            {/* DAO actions */}
            {isDao && (canOpen || canClose || canCancel || canRequestRec || waitingForDeadline || canRequestAppealReview || canFinalize) && (
              <div className="panel p-5 space-y-3">
                <p className="text-xs font-mono text-slate-grey uppercase tracking-wider">DAO Actions</p>

                {canOpen && (
                  <button
                    onClick={() => doAction("Open Committee", () => openCommittee(client!, cid))}
                    disabled={!!actionLoading}
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-liquidity-green/10 border border-liquidity-green/30 hover:border-liquidity-green text-liquidity-green font-display font-semibold text-sm rounded-xl transition-all disabled:opacity-50"
                  >
                    {actionLoading === "Open Committee" ? <Loader2 size={14} className="animate-spin" /> : <CheckSquare size={14} />}
                    Open for Proposals
                  </button>
                )}

                {canClose && (
                  <button
                    onClick={() => doAction("Close Proposals", () => closeProposals(client!, cid))}
                    disabled={!!actionLoading}
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-policy-gold/10 border border-policy-gold/30 hover:border-policy-gold text-policy-gold font-display font-semibold text-sm rounded-xl transition-all disabled:opacity-50"
                  >
                    {actionLoading === "Close Proposals" ? <Loader2 size={14} className="animate-spin" /> : <XSquare size={14} />}
                    Close Proposals
                  </button>
                )}

                {waitingForDeadline && (
                  <div className="w-full px-3 py-3 bg-policy-gold/5 border border-policy-gold/20 rounded-xl text-center space-y-1">
                    <p className="text-xs text-slate-grey">Waiting for proposal deadline</p>
                    <p className="text-policy-gold font-mono font-bold text-sm">{fmtCountdown(secsUntilDeadline)}</p>
                    <p className="text-xs text-slate-grey/70">Request Recommendation available after deadline</p>
                  </div>
                )}

                {canRequestRec && (
                  <button
                    onClick={() => doAction("Request Recommendation", () => requestRecommendation(client!, cid))}
                    disabled={!!actionLoading}
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-signal-cyan/10 border border-signal-cyan/30 hover:border-signal-cyan text-signal-cyan font-display font-semibold text-sm rounded-xl transition-all disabled:opacity-50"
                  >
                    {actionLoading === "Request Recommendation" ? <Loader2 size={14} className="animate-spin" /> : <Bell size={14} />}
                    Request Recommendation
                  </button>
                )}

                {canRequestAppealReview && (
                  <button
                    onClick={() => doAction("Appeal Review", () => requestAppealReview(client!, cid))}
                    disabled={!!actionLoading}
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-governance-purple/10 border border-governance-purple/30 hover:border-governance-purple text-governance-purple font-display font-semibold text-sm rounded-xl transition-all disabled:opacity-50"
                  >
                    {actionLoading === "Appeal Review" ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
                    Request Appeal Review
                  </button>
                )}

                {canFinalize && (
                  <button
                    onClick={() => doAction("Finalize", () => finalizeRecommendation(client!, cid))}
                    disabled={!!actionLoading}
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-committee-blue/10 border border-committee-blue/30 hover:border-committee-blue text-committee-blue font-display font-semibold text-sm rounded-xl transition-all disabled:opacity-50"
                  >
                    {actionLoading === "Finalize" ? <Loader2 size={14} className="animate-spin" /> : <CheckSquare size={14} />}
                    Finalize Recommendation
                  </button>
                )}

                {canCancel && (
                  <button
                    onClick={() => { if (confirm("Cancel this committee? This cannot be undone.")) doAction("Cancel Committee", () => cancelCommittee(client!, cid)); }}
                    disabled={!!actionLoading}
                    className="w-full flex items-center justify-center gap-2 py-2 text-risk-red/70 hover:text-risk-red border border-risk-red/20 hover:border-risk-red/40 rounded-xl text-sm font-display font-semibold transition-all disabled:opacity-50"
                  >
                    Cancel Committee
                  </button>
                )}
              </div>
            )}

            {/* Policy packet */}
            <PolicyPacketPanel committee={committee} />

            {/* Explorer */}
            <div className="space-y-2">
              <ExplorerLinkCard label="GenLayer Contract" isContract />
              {txHash && <ExplorerLinkCard label="Last Transaction" hash={txHash} />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
