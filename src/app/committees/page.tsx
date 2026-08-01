"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useWallet } from "@/context/WalletContext";
import { getAllCommittees, getCommitteeCount } from "@/lib/genlayer";
import type { InvestmentCommittee } from "@/lib/types";
import { statusLabel, statusColor, formatDate, truncate } from "@/lib/utils";
import { Plus, Loader2, RefreshCw, ArrowRight } from "lucide-react";

export default function CommitteesPage() {
  const { client } = useWallet();
  const [committees, setCommittees] = useState<InvestmentCommittee[]>([]);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      // directRead doesn't need a connected wallet — pass null safely
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const [data, count] = await Promise.all([
        getAllCommittees(null as any),
        getCommitteeCount(),
      ]);
      setCommittees((data as unknown as InvestmentCommittee[]).reverse());
      setTotalCount(count as unknown as number);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load committees");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold text-paper-white">Committee Board</h1>
          <p className="text-slate-grey mt-1">
            DAO treasury investment committees on GenLayer
            {totalCount !== null && (
              <span className="ml-2 font-mono text-xs bg-white/5 border border-white/10 text-paper-white px-2 py-0.5 rounded-full">
                {totalCount} on-chain
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={load}
            disabled={loading}
            className="p-2 text-slate-grey hover:text-paper-white border border-white/10 rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
          <Link
            href="/committees/create"
            className="flex items-center gap-2 px-4 py-2 bg-committee-blue hover:bg-committee-blue/80 text-white font-display font-semibold text-sm rounded-xl transition-all"
          >
            <Plus size={16} />
            Create Committee
          </Link>
        </div>
      </div>

      {loading && !committees.length && (
        <div className="panel p-12 flex items-center justify-center gap-3 text-slate-grey">
          <Loader2 className="animate-spin" size={20} />
          <span>Loading committees from contract…</span>
        </div>
      )}

      {error && (
        <div className="panel border-risk-red/30 p-4 text-risk-red text-sm">{error}</div>
      )}

      {!loading && !error && committees.length === 0 && (
        <div className="panel p-12 text-center space-y-4">
          <p className="font-display text-lg text-paper-white">No committees yet</p>
          <p className="text-slate-grey text-sm">Be the first to create an investment committee for your DAO.</p>
          <Link href="/committees/create" className="inline-flex items-center gap-2 px-5 py-2.5 bg-committee-blue text-white font-display font-semibold text-sm rounded-xl hover:bg-committee-blue/80 transition-all mt-2">
            <Plus size={15} /> Create Committee
          </Link>
        </div>
      )}

      {committees.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {committees.map((c) => (
            <Link
              key={c.committee_id}
              href={`/committees/${c.committee_id}`}
              className="panel p-5 space-y-4 hover:border-committee-blue/40 hover:glow-blue transition-all group"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="font-display font-bold text-paper-white group-hover:text-signal-cyan transition-colors">
                    {c.dao_name}
                  </h2>
                  <p className="text-xs font-mono text-slate-grey mt-0.5">Committee #{c.committee_id}</p>
                </div>
                <span className={`band-pill border bg-transparent ${statusColor(c.status)} border-current`}>
                  {statusLabel(c.status)}
                </span>
              </div>

              <p className="text-sm text-slate-grey leading-relaxed">
                {truncate(c.treasury_objective, 120)}
              </p>

              <div className="flex items-center justify-between text-xs text-slate-grey border-t border-white/5 pt-3">
                <span>Deadline: {formatDate(c.proposal_deadline)}</span>
                <span className="flex items-center gap-1 group-hover:text-signal-cyan transition-colors">
                  View <ArrowRight size={12} />
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
