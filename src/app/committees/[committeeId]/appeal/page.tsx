"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useWallet } from "@/context/WalletContext";
import {
  getCommittee, getRecommendationResult, getAppeal,
  fileAppeal, requestAppealReview,
} from "@/lib/genlayer";
import type { InvestmentCommittee, RecommendationResult, Appeal, AppealBasis } from "@/lib/types";
import { useToast } from "@/components/ui/Toaster";
import { ExplorerLinkCard } from "@/components/ExplorerLinkCard";
import { CommitteeRecommendationSeal } from "@/components/CommitteeRecommendationSeal";
import { formatDate, verdictLabel } from "@/lib/utils";
import { Loader2, Plus, X, Scale } from "lucide-react";

const APPEAL_BASES: AppealBasis[] = [
  "new_risk_evidence",
  "liquidity_misread",
  "fundamental_misread",
  "governance_risk_misread",
  "policy_constraint_misapplied",
  "allocation_limit_error",
  "evidence_url_misread",
  "conflict_of_interest_claim",
];

const BASIS_LABELS: Record<AppealBasis, string> = {
  new_risk_evidence: "New Risk Evidence",
  liquidity_misread: "Liquidity Misread",
  fundamental_misread: "Fundamental Misread",
  governance_risk_misread: "Governance Risk Misread",
  policy_constraint_misapplied: "Policy Constraint Misapplied",
  allocation_limit_error: "Allocation Limit Error",
  evidence_url_misread: "Evidence URL Misread",
  conflict_of_interest_claim: "Conflict of Interest Claim",
};

export default function AppealPage() {
  const { committeeId } = useParams<{ committeeId: string }>();
  const router = useRouter();
  const { client, address } = useWallet();
  const { toast } = useToast();

  const [committee, setCommittee] = useState<InvestmentCommittee | null>(null);
  const [recommendation, setRecommendation] = useState<RecommendationResult | null>(null);
  const [existingAppeal, setExistingAppeal] = useState<Appeal | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [newUrl, setNewUrl] = useState("");

  const [form, setForm] = useState({
    basis: "" as AppealBasis | "",
    statement: "",
    evidence_urls: [] as string[],
  });

  const cid = Number(committeeId);

  useEffect(() => {
    async function load() {
      if (!client) return;
      try {
        const [c, rec] = await Promise.all([
          getCommittee(client, cid),
          getRecommendationResult(client, cid).catch(() => null),
        ]);
        setCommittee(c as unknown as InvestmentCommittee);
        setRecommendation(rec as unknown as RecommendationResult | null);
        try {
          const appeal = await getAppeal(client, cid);
          setExistingAppeal(appeal as unknown as Appeal);
        } catch {
          // no appeal yet
        }
      } catch (e: unknown) {
        toast({ type: "error", title: "Failed to load", description: (e as Error).message });
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [client, cid]);

  function set(key: string, value: unknown) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function addUrl() {
    if (!newUrl.trim()) return;
    if (!newUrl.startsWith("http://") && !newUrl.startsWith("https://")) {
      toast({ type: "error", title: "Invalid URL" });
      return;
    }
    set("evidence_urls", [...form.evidence_urls, newUrl.trim()]);
    setNewUrl("");
  }

  async function handleFileAppeal(e: React.FormEvent) {
    e.preventDefault();
    if (!client || !address) { toast({ type: "error", title: "Connect wallet first" }); return; }
    if (!form.basis) { toast({ type: "error", title: "Select an appeal basis" }); return; }

    setSubmitting(true);
    try {
      const hash = await fileAppeal(client, cid, form.basis, form.statement, form.evidence_urls);
      setTxHash(hash as string);
      toast({ type: "success", title: "Appeal filed", description: "Transaction sent to StudioNet." });
      router.refresh();
    } catch (err: unknown) {
      toast({ type: "error", title: "Appeal failed", description: (err as Error).message });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRequestReview() {
    if (!client || !address) { toast({ type: "error", title: "Connect wallet first" }); return; }
    setSubmitting(true);
    try {
      const hash = await requestAppealReview(client, cid);
      setTxHash(hash as string);
      toast({ type: "info", title: "Appeal review requested", description: "GenLayer validators are re-evaluating. Check back in 1–2 minutes." });
      router.push(`/committees/${cid}/recommendation`);
    } catch (err: unknown) {
      toast({ type: "error", title: "Review failed", description: (err as Error).message });
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96 gap-3 text-slate-grey">
        <Loader2 className="animate-spin" size={20} />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 space-y-8">
      <div>
        <Link href={`/committees/${cid}`} className="text-sm text-slate-grey hover:text-paper-white transition-colors">
          ← Back to committee
        </Link>
        <div className="flex items-center gap-3 mt-3">
          <div className="w-9 h-9 rounded-xl bg-governance-purple/20 flex items-center justify-center">
            <Scale size={18} className="text-governance-purple" />
          </div>
          <div>
            <h1 className="font-display text-3xl font-bold text-paper-white">Appeal Desk</h1>
            {committee && <p className="text-slate-grey text-sm">{committee.dao_name}</p>}
          </div>
        </div>
      </div>

      {/* Original recommendation summary */}
      {recommendation && (
        <div className="panel p-4 space-y-2">
          <p className="text-xs font-mono text-slate-grey uppercase tracking-wider">Original Recommendation</p>
          <div className="flex items-center justify-between">
            <span className="text-paper-white font-display font-semibold">{verdictLabel(recommendation.verdict)}</span>
            <span className="text-xs font-mono text-slate-grey">Confidence: {recommendation.confidence}%</span>
          </div>
          <p className="text-sm text-slate-grey">{recommendation.short_reason}</p>
        </div>
      )}

      {/* Existing appeal result */}
      {existingAppeal && (
        <div className="space-y-4">
          <div className="panel-gold p-5 space-y-3">
            <p className="text-xs font-mono text-slate-grey uppercase tracking-wider">Filed Appeal</p>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-slate-grey">Basis</p>
                <p className="text-paper-white font-semibold">{BASIS_LABELS[existingAppeal.basis as AppealBasis]}</p>
              </div>
              <div>
                <p className="text-xs text-slate-grey">Status</p>
                <p className={`font-semibold capitalize ${existingAppeal.status === "reviewed" ? "text-liquidity-green" : "text-policy-gold"}`}>
                  {existingAppeal.status}
                </p>
              </div>
            </div>
            <p className="text-sm text-paper-white/80">{existingAppeal.statement}</p>
            <p className="text-xs text-slate-grey">Filed: {formatDate(existingAppeal.created_at)}</p>
          </div>

          {existingAppeal.status === "reviewed" && existingAppeal.result && (
            <div className="panel p-5 space-y-2">
              <p className="text-xs font-mono text-slate-grey uppercase tracking-wider">Appeal Result</p>
              <p className={`font-display font-bold ${
                existingAppeal.result.appeal_verdict === "appeal_granted" ? "text-liquidity-green" : "text-risk-red"
              }`}>
                {existingAppeal.result.appeal_verdict?.replace(/_/g, " ").toUpperCase()}
              </p>
              {existingAppeal.result.short_reason && (
                <p className="text-sm text-paper-white/80">{existingAppeal.result.short_reason}</p>
              )}
            </div>
          )}

          {existingAppeal.status === "filed" && (
            <button
              onClick={handleRequestReview}
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 py-3 bg-governance-purple/20 border border-governance-purple/40 hover:border-governance-purple text-governance-purple font-display font-bold text-sm rounded-xl transition-all disabled:opacity-50"
            >
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <Scale size={16} />}
              Request Appeal Review
            </button>
          )}
        </div>
      )}

      {/* File new appeal */}
      {!existingAppeal && committee?.status === "appeal_window_open" && (
        <form onSubmit={handleFileAppeal} className="space-y-6">
          <div className="space-y-3">
            <label className="text-sm font-display font-semibold text-paper-white">Appeal Basis <span className="text-risk-red">*</span></label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {APPEAL_BASES.map((basis) => (
                <button
                  key={basis}
                  type="button"
                  onClick={() => set("basis", basis)}
                  className={`text-left p-3 rounded-lg border text-sm transition-all ${
                    form.basis === basis
                      ? "border-governance-purple bg-governance-purple/10 text-governance-purple"
                      : "border-white/10 text-slate-grey hover:border-white/30 hover:text-paper-white"
                  }`}
                >
                  {BASIS_LABELS[basis]}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-display font-semibold text-paper-white">
              Appeal Statement <span className="text-risk-red">*</span>
            </label>
            <textarea
              className="input-field min-h-32 resize-y"
              value={form.statement}
              onChange={(e) => set("statement", e.target.value)}
              placeholder="Explain why the original recommendation should be reconsidered…"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-display font-semibold text-paper-white">
              Additional Evidence URLs ({form.evidence_urls.length}/8)
            </label>
            <div className="space-y-2 mb-2">
              {form.evidence_urls.map((url, i) => (
                <div key={i} className="flex items-center gap-2 bg-graphite border border-white/10 rounded-lg px-3 py-2">
                  <span className="flex-1 text-xs font-mono text-paper-white/70 truncate">{url}</span>
                  <button type="button" onClick={() => set("evidence_urls", form.evidence_urls.filter((_, j) => j !== i))}
                    className="text-slate-grey hover:text-risk-red transition-colors">
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input className="input-field flex-1 text-xs" value={newUrl} onChange={(e) => setNewUrl(e.target.value)}
                placeholder="https://example.com/new-evidence"
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addUrl(); } }} />
              <button type="button" onClick={addUrl}
                className="p-2 bg-governance-purple/10 border border-governance-purple/30 rounded-lg text-governance-purple hover:bg-governance-purple/20 transition-colors">
                <Plus size={14} />
              </button>
            </div>
          </div>

          {txHash && <ExplorerLinkCard label="Appeal transaction" hash={txHash} />}

          <button
            type="submit"
            disabled={submitting || !address || !form.basis}
            className="w-full py-3.5 bg-governance-purple/20 hover:bg-governance-purple/30 disabled:opacity-40 disabled:cursor-not-allowed border border-governance-purple/40 hover:border-governance-purple text-governance-purple font-display font-bold rounded-xl transition-all flex items-center justify-center gap-2"
          >
            {submitting ? <Loader2 size={16} className="animate-spin" /> : <Scale size={16} />}
            File Appeal
          </button>
        </form>
      )}

      {committee && !["appeal_window_open", "appeal_under_review"].includes(committee.status) && !existingAppeal && (
        <div className="panel p-6 text-center space-y-2">
          <p className="text-paper-white font-display">Appeal window not open</p>
          <p className="text-slate-grey text-sm">
            Current status: {committee.status.replace(/_/g, " ")}
          </p>
        </div>
      )}

      <style jsx global>{`
        .input-field {
          width: 100%;
          background: #111827;
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 8px;
          padding: 10px 12px;
          color: #F7F3EA;
          font-size: 14px;
          transition: border-color 0.2s;
          outline: none;
        }
        .input-field:focus {
          border-color: rgba(139, 92, 246, 0.5);
        }
        .input-field::placeholder { color: #8B93A1; }
      `}</style>
    </div>
  );
}
