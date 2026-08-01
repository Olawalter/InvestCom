"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useWallet } from "@/context/WalletContext";
import { getAllCommittees, getCommitteeProposals } from "@/lib/genlayer";
import type { InvestmentCommittee, InvestmentProposal } from "@/lib/types";
import { statusLabel, statusColor, formatDate, formatAddress, truncate } from "@/lib/utils";
import { Loader2, Wallet, Building2, FileText, ArrowRight, Activity } from "lucide-react";

export default function ProfilePage() {
  const { client, address, connect, connecting } = useWallet();

  const [committees, setCommittees] = useState<InvestmentCommittee[]>([]);
  const [proposals, setProposals] = useState<InvestmentProposal[]>([]);
  const [allCommittees, setAllCommittees] = useState<InvestmentCommittee[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const all = (await getAllCommittees(null as any)) as unknown as InvestmentCommittee[];
        setAllCommittees(all);

        if (address) {
          // Compare addresses in a format-agnostic way: strip 0x prefix and lowercase both sides.
          const norm = (a: string) => a.toLowerCase().replace(/^0x/, "");
          const myAddr = norm(address);

          setCommittees(all.filter((c) => norm(c.dao ?? "") === myAddr));

          // Fetch proposals from every committee in parallel; filter by proposer client-side.
          const propArrays = await Promise.all(
            all.map((c) =>
              getCommitteeProposals(null as any, c.committee_id)
                .then((p) => p as unknown as InvestmentProposal[])
                .catch(() => [] as InvestmentProposal[])
            )
          );
          setProposals(propArrays.flat().filter((p) => norm(p.proposer ?? "") === myAddr));
        }
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [address]);

  if (!address) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-10 space-y-10">
        {/* Connect prompt */}
        <div className="panel p-10 text-center space-y-5">
          <div className="w-16 h-16 rounded-2xl bg-committee-blue/10 border border-committee-blue/30 flex items-center justify-center mx-auto">
            <Wallet size={28} className="text-committee-blue" />
          </div>
          <h1 className="font-display text-3xl font-bold text-paper-white">DAO & Proposer Dashboard</h1>
          <p className="text-slate-grey max-w-sm mx-auto">Connect your wallet to see committees you&apos;ve created and proposals you&apos;ve submitted.</p>
          <button
            onClick={() => connect()}
            disabled={connecting}
            className="px-6 py-3 bg-committee-blue hover:bg-committee-blue/80 text-white font-display font-semibold rounded-xl transition-all disabled:opacity-50 flex items-center gap-2 mx-auto"
          >
            {connecting ? <Loader2 size={16} className="animate-spin" /> : <Wallet size={16} />}
            Connect Wallet
          </button>
        </div>

        {/* Protocol activity visible to everyone */}
        <div className="space-y-4">
          <h2 className="font-display text-xl font-bold text-paper-white flex items-center gap-2">
            <Activity size={18} className="text-signal-cyan" />
            Recent Protocol Activity
          </h2>
          {loading && (
            <div className="flex items-center gap-3 text-slate-grey">
              <Loader2 className="animate-spin" size={16} />
              <span>Loading…</span>
            </div>
          )}
          {!loading && allCommittees.length === 0 && (
            <div className="panel p-6 text-center text-slate-grey text-sm">No committees found on-chain yet.</div>
          )}
          <div className="space-y-3">
            {allCommittees.slice().reverse().map((c) => (
              <Link
                key={c.committee_id}
                href={`/committees/${c.committee_id}`}
                className="panel p-4 flex items-center justify-between gap-4 hover:border-committee-blue/40 transition-all group"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-display font-semibold text-paper-white text-sm group-hover:text-signal-cyan transition-colors">
                    {c.dao_name}
                  </p>
                  <p className="text-xs text-slate-grey mt-0.5">Committee #{c.committee_id}</p>
                </div>
                <span className={`band-pill border bg-transparent ${statusColor(c.status)} border-current flex-shrink-0`}>
                  {statusLabel(c.status)}
                </span>
                <ArrowRight size={14} className="text-slate-grey group-hover:text-signal-cyan transition-colors flex-shrink-0" />
              </Link>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-10">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold text-paper-white">My Dashboard</h1>
          <div className="flex items-center gap-2 mt-1">
            <div className="w-2 h-2 rounded-full bg-liquidity-green animate-pulse" />
            <span className="font-mono text-sm text-slate-grey">{formatAddress(address)}</span>
          </div>
        </div>
        <div className="flex items-center gap-4 text-center">
          <div className="panel px-4 py-3">
            <p className="text-2xl font-display font-bold text-paper-white">{committees.length}</p>
            <p className="text-xs text-slate-grey mt-1">Committees</p>
          </div>
          <div className="panel px-4 py-3">
            <p className="text-2xl font-display font-bold text-paper-white">{proposals.length}</p>
            <p className="text-xs text-slate-grey mt-1">Proposals</p>
          </div>
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-3 text-slate-grey">
          <Loader2 className="animate-spin" size={16} />
          <span>Loading your activity…</span>
        </div>
      )}

      {/* DAO Committees */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-bold text-paper-white flex items-center gap-2">
            <Building2 size={18} className="text-committee-blue" />
            My Committees
          </h2>
          <Link href="/committees/create" className="text-sm text-committee-blue hover:text-signal-cyan transition-colors">
            + Create new
          </Link>
        </div>

        {!loading && committees.length === 0 && (
          <div className="panel p-8 text-center space-y-3">
            <p className="text-slate-grey">No committees created from this address.</p>
            <p className="text-xs text-slate-grey/60">Committees created by this wallet will appear here. Connect a wallet that has called <span className="font-mono">create_committee</span> on the contract to see its history.</p>
            <Link href="/committees/create" className="text-sm text-committee-blue hover:text-signal-cyan transition-colors">
              Create your first committee →
            </Link>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {committees.map((c) => (
            <Link
              key={c.committee_id}
              href={`/committees/${c.committee_id}`}
              className="panel p-5 space-y-3 hover:border-committee-blue/40 transition-all group"
            >
              <div className="flex items-start justify-between">
                <h3 className="font-display font-semibold text-paper-white group-hover:text-signal-cyan transition-colors">
                  {c.dao_name}
                </h3>
                <span className={`band-pill border bg-transparent ${statusColor(c.status)} border-current`}>
                  {statusLabel(c.status)}
                </span>
              </div>
              <p className="text-xs text-slate-grey">{truncate(c.treasury_objective, 100)}</p>
              <div className="flex items-center justify-between text-xs text-slate-grey border-t border-white/5 pt-2">
                <span>{formatDate(c.proposal_deadline)}</span>
                <ArrowRight size={12} className="group-hover:text-signal-cyan transition-colors" />
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* My Proposals */}
      <div className="space-y-4">
        <h2 className="font-display text-xl font-bold text-paper-white flex items-center gap-2">
          <FileText size={18} className="text-policy-gold" />
          My Proposals
        </h2>

        {!loading && proposals.length === 0 && (
          <div className="panel p-8 text-center space-y-2">
            <p className="text-slate-grey">No proposals submitted from this address.</p>
            <p className="text-xs text-slate-grey/60">Proposals submitted by this wallet across all committees appear here.</p>
            <Link href="/committees" className="text-sm text-committee-blue hover:text-signal-cyan transition-colors">
              Browse open committees →
            </Link>
          </div>
        )}

        <div className="space-y-3">
          {proposals.map((p) => (
            <Link
              key={p.proposal_id}
              href={`/committees/${p.committee_id}`}
              className="panel p-4 flex items-start justify-between gap-4 hover:border-committee-blue/40 transition-all group"
            >
              <div className="min-w-0 flex-1">
                <p className="font-display font-semibold text-paper-white text-sm group-hover:text-signal-cyan transition-colors">
                  {p.title}
                </p>
                <p className="text-xs text-slate-grey mt-1">
                  Committee #{p.committee_id} · {p.asset_or_strategy} · {formatDate(p.submitted_at)}
                </p>
              </div>
              <ArrowRight size={14} className="text-slate-grey group-hover:text-signal-cyan transition-colors flex-shrink-0 mt-1" />
            </Link>
          ))}
        </div>
      </div>

      {/* All protocol committees — visible regardless of wallet */}
      {allCommittees.length > committees.length && (
        <div className="space-y-4">
          <h2 className="font-display text-xl font-bold text-paper-white flex items-center gap-2">
            <Activity size={18} className="text-signal-cyan" />
            All Protocol Committees
          </h2>
          <div className="space-y-3">
            {allCommittees.slice().reverse().map((c) => (
              <Link
                key={c.committee_id}
                href={`/committees/${c.committee_id}`}
                className="panel p-4 flex items-center justify-between gap-4 hover:border-committee-blue/40 transition-all group"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-display font-semibold text-paper-white text-sm group-hover:text-signal-cyan transition-colors">
                    {c.dao_name}
                  </p>
                  <p className="text-xs text-slate-grey mt-0.5">Committee #{c.committee_id}</p>
                </div>
                <span className={`band-pill border bg-transparent ${statusColor(c.status)} border-current flex-shrink-0`}>
                  {statusLabel(c.status)}
                </span>
                <ArrowRight size={14} className="text-slate-grey group-hover:text-signal-cyan transition-colors flex-shrink-0" />
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
