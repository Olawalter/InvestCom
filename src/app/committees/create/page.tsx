"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@/context/WalletContext";
import { createCommittee } from "@/lib/genlayer";
import { useToast } from "@/components/ui/Toaster";
import { ExplorerLinkCard } from "@/components/ExplorerLinkCard";
import { Loader2, Plus, X, Info } from "lucide-react";

const RISK_APPETITES = ["conservative", "moderate", "aggressive"];

export default function CreateCommitteePage() {
  const router = useRouter();
  const { client, address } = useWallet();
  const { toast } = useToast();

  const [submitting, setSubmitting] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);

  const [form, setForm] = useState({
    dao_name: "",
    treasury_objective: "",
    risk_appetite: "moderate",
    liquidity_requirement: "",
    max_single_asset_exposure_bps: 2000,
    max_protocol_exposure_bps: 1500,
    allowed_asset_classes: ["stablecoins", "ETH", "BTC"],
    disallowed_assets: ["microcaps", "anonymous-team-assets"],
    governance_constraints: "",
    evaluation_weights: { risk: 30, liquidity: 25, fundamentals: 20, governance: 15, treasury_objective_fit: 10 },
    proposal_deadline_minutes: 10,
    appeal_window_hours: 1,
  });

  const [newAllowed, setNewAllowed] = useState("");
  const [newDisallowed, setNewDisallowed] = useState("");

  const weightsSum = Object.values(form.evaluation_weights).reduce((a, b) => a + b, 0);

  function set(key: string, value: unknown) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function addToList(field: "allowed_asset_classes" | "disallowed_assets", val: string) {
    if (!val.trim()) return;
    set(field, [...form[field], val.trim()]);
  }

  function removeFromList(field: "allowed_asset_classes" | "disallowed_assets", index: number) {
    set(field, (form[field] as string[]).filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!client || !address) {
      toast({ type: "error", title: "Connect wallet first" });
      return;
    }
    if (weightsSum !== 100) {
      toast({ type: "error", title: "Evaluation weights must sum to 100", description: `Current sum: ${weightsSum}` });
      return;
    }

    setSubmitting(true);
    try {
      const deadlineTs = Math.floor(Date.now() / 1000) + form.proposal_deadline_minutes * 60;
      const appealWindowSecs = form.appeal_window_hours * 3600;

      const hash = await createCommittee(client, {
        dao_name: form.dao_name,
        treasury_objective: form.treasury_objective,
        risk_appetite: form.risk_appetite,
        liquidity_requirement: form.liquidity_requirement,
        max_single_asset_exposure_bps: form.max_single_asset_exposure_bps,
        max_protocol_exposure_bps: form.max_protocol_exposure_bps,
        allowed_asset_classes: form.allowed_asset_classes,
        disallowed_assets: form.disallowed_assets,
        governance_constraints: form.governance_constraints,
        evaluation_weights: form.evaluation_weights,
        proposal_deadline: deadlineTs,
        appeal_window: appealWindowSecs,
      });

      const hashStr = hash as string;
      setTxHash(hashStr);
      toast({ type: "info", title: "Transaction submitted", description: "Committee is being created on StudioNet…" });

      // Navigate immediately — committee list will show once tx finalizes (~30–120s)
      router.push("/committees");
    } catch (err: unknown) {
      toast({
        type: "error",
        title: "Transaction failed",
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 space-y-8">
      <div>
        <h1 className="font-display text-3xl font-bold text-paper-white">Create Investment Committee</h1>
        <p className="text-slate-grey mt-2 text-sm">
          Define your DAO&apos;s investment policy. GenLayer validators will use this to evaluate proposals.
        </p>
      </div>

      {!address && (
        <div className="panel border-policy-gold/30 p-4 flex items-start gap-3">
          <Info size={16} className="text-policy-gold flex-shrink-0 mt-0.5" />
          <p className="text-sm text-paper-white/80">Connect your wallet to create a committee.</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* DAO name */}
        <Field label="DAO Name" required hint="3–80 characters">
          <input
            className="input-field"
            value={form.dao_name}
            onChange={(e) => set("dao_name", e.target.value)}
            placeholder="e.g. AtlasDAO"
            minLength={3} maxLength={80} required
          />
        </Field>

        {/* Treasury objective */}
        <Field label="Treasury Objective" required hint="30–2000 characters">
          <textarea
            className="input-field min-h-24 resize-y"
            value={form.treasury_objective}
            onChange={(e) => set("treasury_objective", e.target.value)}
            placeholder="e.g. Preserve 18 months runway while allocating up to 20% of treasury into productive low-to-medium risk strategies."
            minLength={30} maxLength={2000} required
          />
        </Field>

        {/* Risk appetite */}
        <Field label="Risk Appetite" required>
          <div className="flex gap-3">
            {RISK_APPETITES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => set("risk_appetite", r)}
                className={`flex-1 py-2 rounded-lg border text-sm font-display font-semibold capitalize transition-all ${
                  form.risk_appetite === r
                    ? r === "conservative"
                      ? "border-liquidity-green bg-liquidity-green/10 text-liquidity-green"
                      : r === "moderate"
                      ? "border-policy-gold bg-policy-gold/10 text-policy-gold"
                      : "border-risk-red bg-risk-red/10 text-risk-red"
                    : "border-white/10 text-slate-grey hover:border-white/30"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </Field>

        {/* Liquidity requirement */}
        <Field label="Liquidity Requirement" required hint="20–1000 characters">
          <textarea
            className="input-field resize-y"
            value={form.liquidity_requirement}
            onChange={(e) => set("liquidity_requirement", e.target.value)}
            placeholder="e.g. At least 60% of treasury must remain liquid within 7 days."
            minLength={20} maxLength={1000} required
          />
        </Field>

        {/* Concentration limits */}
        <div className="grid grid-cols-2 gap-4">
          <Field label="Max Single Asset Exposure (bps)" hint="e.g. 2000 = 20%">
            <input
              type="number"
              className="input-field"
              value={form.max_single_asset_exposure_bps}
              onChange={(e) => set("max_single_asset_exposure_bps", Number(e.target.value))}
              min={100} max={10000}
            />
          </Field>
          <Field label="Max Protocol Exposure (bps)" hint="e.g. 1500 = 15%">
            <input
              type="number"
              className="input-field"
              value={form.max_protocol_exposure_bps}
              onChange={(e) => set("max_protocol_exposure_bps", Number(e.target.value))}
              min={100} max={10000}
            />
          </Field>
        </div>

        {/* Allowed / Disallowed assets */}
        <div className="grid grid-cols-2 gap-4">
          <Field label="Allowed Asset Classes">
            <div className="flex flex-wrap gap-1 mb-2">
              {form.allowed_asset_classes.map((a, i) => (
                <span key={i} className="band-pill bg-liquidity-green/10 text-liquidity-green border border-liquidity-green/20 flex items-center gap-1">
                  {a}
                  <button type="button" onClick={() => removeFromList("allowed_asset_classes", i)} className="hover:text-risk-red transition-colors">
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                className="input-field text-xs flex-1"
                value={newAllowed}
                onChange={(e) => setNewAllowed(e.target.value)}
                placeholder="Add asset class…"
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addToList("allowed_asset_classes", newAllowed); setNewAllowed(""); } }}
              />
              <button type="button" onClick={() => { addToList("allowed_asset_classes", newAllowed); setNewAllowed(""); }} className="p-2 bg-liquidity-green/10 border border-liquidity-green/30 rounded-lg text-liquidity-green hover:bg-liquidity-green/20 transition-colors">
                <Plus size={14} />
              </button>
            </div>
          </Field>

          <Field label="Disallowed Assets">
            <div className="flex flex-wrap gap-1 mb-2">
              {form.disallowed_assets.map((a, i) => (
                <span key={i} className="band-pill bg-risk-red/10 text-risk-red border border-risk-red/20 flex items-center gap-1">
                  {a}
                  <button type="button" onClick={() => removeFromList("disallowed_assets", i)} className="hover:text-paper-white transition-colors">
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                className="input-field text-xs flex-1"
                value={newDisallowed}
                onChange={(e) => setNewDisallowed(e.target.value)}
                placeholder="Add disallowed asset…"
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addToList("disallowed_assets", newDisallowed); setNewDisallowed(""); } }}
              />
              <button type="button" onClick={() => { addToList("disallowed_assets", newDisallowed); setNewDisallowed(""); }} className="p-2 bg-risk-red/10 border border-risk-red/30 rounded-lg text-risk-red hover:bg-risk-red/20 transition-colors">
                <Plus size={14} />
              </button>
            </div>
          </Field>
        </div>

        {/* Governance constraints */}
        <Field label="Governance Constraints">
          <textarea
            className="input-field resize-y"
            value={form.governance_constraints}
            onChange={(e) => set("governance_constraints", e.target.value)}
            placeholder="e.g. Avoid assets with unresolved governance attacks or unclear admin key risk."
          />
        </Field>

        {/* Evaluation weights */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-display font-semibold text-paper-white">Evaluation Weights</label>
            <span className={`text-xs font-mono ${weightsSum === 100 ? "text-liquidity-green" : "text-risk-red"}`}>
              Sum: {weightsSum} / 100
            </span>
          </div>
          {Object.entries(form.evaluation_weights).map(([key, value]) => (
            <div key={key} className="flex items-center gap-3">
              <span className="text-xs font-mono text-slate-grey w-44 capitalize">{key.replace(/_/g, " ")}</span>
              <input
                type="range" min={0} max={100} value={value}
                onChange={(e) => set("evaluation_weights", { ...form.evaluation_weights, [key]: Number(e.target.value) })}
                className="flex-1 accent-policy-gold"
              />
              <span className="text-xs font-mono text-policy-gold w-10 text-right">{value}%</span>
            </div>
          ))}
        </div>

        {/* Deadline */}
        <div className="grid grid-cols-2 gap-4">
          <Field label="Proposal Window (minutes)" hint="Min 5 — use 10 for testing">
            <input
              type="number"
              className="input-field"
              value={form.proposal_deadline_minutes}
              onChange={(e) => set("proposal_deadline_minutes", Number(e.target.value))}
              min={5} max={129600}
            />
          </Field>
          <Field label="Appeal Window (hours)" hint="Min 1 — use 1 for testing">
            <input
              type="number"
              className="input-field"
              value={form.appeal_window_hours}
              onChange={(e) => set("appeal_window_hours", Number(e.target.value))}
              min={1} max={720}
            />
          </Field>
        </div>

        {txHash && (
          <ExplorerLinkCard label="Committee creation transaction" hash={txHash} />
        )}

        <button
          type="submit"
          disabled={submitting || !address || weightsSum !== 100}
          className="w-full py-3.5 bg-committee-blue hover:bg-committee-blue/80 disabled:bg-committee-blue/30 disabled:cursor-not-allowed text-white font-display font-bold rounded-xl transition-all flex items-center justify-center gap-2"
        >
          {submitting ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Creating committee…
            </>
          ) : (
            "Create Investment Committee"
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
        .input-field::placeholder {
          color: #8B93A1;
        }
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
