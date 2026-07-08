"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useWallet } from "@/context/WalletContext";
import { getCommittee, submitProposal } from "@/lib/genlayer";
import type { InvestmentCommittee } from "@/lib/types";
import { useToast } from "@/components/ui/Toaster";
import { ExplorerLinkCard } from "@/components/ExplorerLinkCard";
import { Loader2, Plus, X, Info, Zap } from "lucide-react";
import { bpsToPercent } from "@/lib/utils";

const TEST_DEFAULTS = {
  title: "Allocate 10% Treasury to ETH via Lido Staking",
  summary: "Propose allocating 10% of the DAO treasury into ETH via Lido liquid staking to earn ~4% APY while maintaining liquidity through stETH. This balances yield generation with capital preservation aligned to our moderate risk appetite.",
  asset_or_strategy: "ETH via Lido staking (stETH)",
  allocation_bps: 1000,
  expected_holding_period: "12 months",
  liquidity_profile: "stETH is liquid on secondary markets within 24 hours. Full unstake takes up to 7 days via Lido withdrawal queue.",
  risk_thesis: "Primary risks: ETH price volatility, Lido smart contract risk, validator slashing. Lido is the largest LST protocol with $20B+ TVL, multiple audits, and a bug bounty program. Slashing insurance mitigates validator risk.",
  fundamental_thesis: "ETH is the base layer asset of the largest smart contract platform. Lido staking captures the protocol's native yield (~4% APY) without sacrificing liquidity. stETH has deep DeFi integrations and strong secondary market demand.",
  governance_risks: "Lido DAO controls key parameters but has a large, decentralized token holder base and a track record of responsible governance. No single admin key risk.",
  evidence_urls: ["https://lido.fi", "https://dune.com/lido"],
};

export default function SubmitProposalPage() {
  const { committeeId } = useParams<{ committeeId: string }>();
  const router = useRouter();
  const { client, address } = useWallet();
  const { toast } = useToast();

  const [committee, setCommittee] = useState<InvestmentCommittee | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [newUrl, setNewUrl] = useState("");
  const [form, setForm] = useState({
    title: "",
    summary: "",
    asset_or_strategy: "",
    allocation_bps: 1000,
    expected_holding_period: "",
    liquidity_profile: "",
    risk_thesis: "",
    fundamental_thesis: "",
    governance_risks: "",
    evidence_urls: [] as string[],
  });

  const cid = Number(committeeId);

  useEffect(() => {
    if (!client) return;
    getCommittee(client, cid)
      .then((c) => setCommittee(c as unknown as InvestmentCommittee))
      .catch(() => {});
  }, [client, cid]);

  function set(key: string, value: unknown) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function fillTestData() {
    setForm({ ...TEST_DEFAULTS });
  }

  function addUrl() {
    if (!newUrl.trim()) return;
    if (!newUrl.startsWith("http://") && !newUrl.startsWith("https://")) {
      toast({ type: "error", title: "Invalid URL", description: "Must start with http:// or https://" });
      return;
    }
    if (form.evidence_urls.length >= 8) {
      toast({ type: "error", title: "Max 8 evidence URLs" });
      return;
    }
    set("evidence_urls", [...form.evidence_urls, newUrl.trim()]);
    setNewUrl("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    console.log("[handleSubmit] called — address:", address, "client:", !!client, "cid:", cid);

    if (!client || !address) {
      toast({ type: "error", title: "Connect wallet first" });
      return;
    }
    if (form.evidence_urls.length === 0) {
      toast({ type: "error", title: "Add at least 1 evidence URL" });
      return;
    }

    setSubmitting(true);
    try {
      console.log("[handleSubmit] calling submitProposal...");
      const hash = await submitProposal(client, cid, {
        title: form.title || "Untitled Proposal",
        summary: form.summary || "No summary provided.",
        asset_or_strategy: form.asset_or_strategy || "Unspecified",
        allocation_bps: form.allocation_bps,
        expected_holding_period: form.expected_holding_period || "Unspecified",
        liquidity_profile: form.liquidity_profile || "Unspecified",
        risk_thesis: form.risk_thesis || "No risk thesis provided.",
        fundamental_thesis: form.fundamental_thesis || "No fundamental thesis provided.",
        governance_risks: form.governance_risks || "No governance risks stated.",
        evidence_urls: form.evidence_urls,
      });
      console.log("[handleSubmit] tx hash:", hash);
      setTxHash(hash as string);
      toast({ type: "info", title: "Proposal submitted", description: "Transaction sent to StudioNet." });
      router.push(`/committees/${cid}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[submitProposal] error:", err);
      toast({ type: "error", title: "Submission failed", description: msg || "Unknown error — check console" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 space-y-8">
      <div>
        <Link href={`/committees/${cid}`} className="text-sm text-slate-grey hover:text-paper-white transition-colors">
          ← Back to committee
        </Link>
        <div className="flex items-center justify-between mt-3">
          <h1 className="font-display text-3xl font-bold text-paper-white">Submit Investment Proposal</h1>
          <button
            type="button"
            onClick={fillTestData}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-mono text-policy-gold border border-policy-gold/30 rounded-lg hover:bg-policy-gold/10 transition-colors"
          >
            <Zap size={12} /> Fill test data
          </button>
        </div>
        {committee && (
          <p className="text-slate-grey text-sm mt-1">
            For {committee.dao_name} · Max single asset: {bpsToPercent(committee.max_single_asset_exposure_bps)}
          </p>
        )}
      </div>

      {!address && (
        <div className="panel border-policy-gold/30 p-4 flex items-start gap-3">
          <Info size={16} className="text-policy-gold flex-shrink-0 mt-0.5" />
          <p className="text-sm text-paper-white/80">Connect your wallet to submit a proposal.</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <Field label="Proposal Title" required>
          <input
            className="input-field"
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder="e.g. Allocate 10% to ETH via Lido Staking"
          />
        </Field>

        <Field label="Summary" required hint="Describe the proposal and how it fits the DAO's objectives">
          <textarea
            className="input-field min-h-24 resize-y"
            value={form.summary}
            onChange={(e) => set("summary", e.target.value)}
            placeholder="Describe the investment proposal and how it fits the DAO's treasury objectives…"
          />
        </Field>

        <Field label="Asset or Strategy" required>
          <input
            className="input-field"
            value={form.asset_or_strategy}
            onChange={(e) => set("asset_or_strategy", e.target.value)}
            placeholder="e.g. ETH + stablecoin lending via Aave"
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Allocation (bps)" hint={`${bpsToPercent(form.allocation_bps)} · ${form.allocation_bps} bps`}>
            <input
              type="number"
              className="input-field"
              value={form.allocation_bps}
              onChange={(e) => set("allocation_bps", Number(e.target.value))}
              min={1}
              max={committee?.max_single_asset_exposure_bps ?? 10000}
            />
          </Field>
          <Field label="Expected Holding Period" required>
            <input
              className="input-field"
              value={form.expected_holding_period}
              onChange={(e) => set("expected_holding_period", e.target.value)}
              placeholder="e.g. 6–12 months"
            />
          </Field>
        </div>

        <Field label="Liquidity Profile" required>
          <textarea
            className="input-field resize-y"
            value={form.liquidity_profile}
            onChange={(e) => set("liquidity_profile", e.target.value)}
            placeholder="e.g. ETH liquid immediately, lending position withdrawable within 3 days."
          />
        </Field>

        <Field label="Risk Thesis" required>
          <textarea
            className="input-field min-h-24 resize-y"
            value={form.risk_thesis}
            onChange={(e) => set("risk_thesis", e.target.value)}
            placeholder="Describe the primary risks: market risk, protocol risk, concentration risk…"
          />
        </Field>

        <Field label="Fundamental Thesis" required>
          <textarea
            className="input-field min-h-24 resize-y"
            value={form.fundamental_thesis}
            onChange={(e) => set("fundamental_thesis", e.target.value)}
            placeholder="Explain why this asset or strategy has sound fundamentals…"
          />
        </Field>

        <Field label="Governance Risks" required>
          <textarea
            className="input-field resize-y"
            value={form.governance_risks}
            onChange={(e) => set("governance_risks", e.target.value)}
            placeholder="e.g. Protocol has admin controls but public audits and mature governance."
          />
        </Field>

        <Field label={`Evidence URLs (${form.evidence_urls.length}/8)`} required hint="At least 1 required. Validators may fetch these.">
          <div className="space-y-2 mb-2">
            {form.evidence_urls.map((url, i) => (
              <div key={i} className="flex items-center gap-2 bg-graphite border border-white/10 rounded-lg px-3 py-2">
                <span className="flex-1 text-xs font-mono text-paper-white/70 truncate">{url}</span>
                <button
                  type="button"
                  onClick={() => set("evidence_urls", form.evidence_urls.filter((_, j) => j !== i))}
                  className="text-slate-grey hover:text-risk-red transition-colors flex-shrink-0"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              className="input-field flex-1 text-xs"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              placeholder="https://example.com/risk-report"
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addUrl(); } }}
            />
            <button
              type="button"
              onClick={addUrl}
              className="p-2 bg-committee-blue/10 border border-committee-blue/30 rounded-lg text-signal-cyan hover:bg-committee-blue/20 transition-colors"
            >
              <Plus size={14} />
            </button>
          </div>
        </Field>

        {txHash && <ExplorerLinkCard label="Proposal submission transaction" hash={txHash} />}

        <button
          type="submit"
          disabled={submitting || !address}
          className="w-full py-3.5 bg-committee-blue hover:bg-committee-blue/80 disabled:bg-committee-blue/30 disabled:cursor-not-allowed text-white font-display font-bold rounded-xl transition-all flex items-center justify-center gap-2"
        >
          {submitting ? (
            <><Loader2 size={16} className="animate-spin" />Submitting proposal…</>
          ) : (
            "Submit Proposal"
          )}
        </button>
      </form>

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
          border-color: rgba(37, 99, 235, 0.5);
          box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.1);
        }
        .input-field::placeholder { color: #8B93A1; }
      `}</style>
    </div>
  );
}

function Field({ label, children, hint, required }: {
  label: string; children: React.ReactNode; hint?: string; required?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1.5 text-sm font-display font-semibold text-paper-white">
        {label}
        {required && <span className="text-risk-red text-xs">*</span>}
      </label>
      {hint && <p className="text-xs text-slate-grey">{hint}</p>}
      {children}
    </div>
  );
}
