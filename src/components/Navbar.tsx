"use client";

import Link from "next/link";
import { useWallet } from "@/context/WalletContext";
import { explorerContractUrl } from "@/lib/genlayer";
import { formatAddress, cn } from "@/lib/utils";
import { Loader2, ExternalLink, Wallet, LogOut } from "lucide-react";

export function Navbar() {
  const { address, connecting, connect, disconnect } = useWallet();

  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-committee-blue/20 bg-navy/90 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-3 group">
          <div className="w-8 h-8 rounded-lg bg-committee-blue/20 border border-committee-blue/40 flex items-center justify-center group-hover:border-committee-blue transition-colors">
            <span className="text-signal-cyan font-mono text-xs font-bold">IC</span>
          </div>
          <div>
            <span className="font-display font-bold text-paper-white text-sm tracking-wide">
              Investment Committee
            </span>
            <div className="text-xs text-slate-grey font-mono hidden sm:block">GenLayer StudioNet</div>
          </div>
        </Link>

        {/* Nav links */}
        <nav className="hidden md:flex items-center gap-6 text-sm">
          <Link href="/committees" className="text-slate-grey hover:text-paper-white transition-colors">
            Committees
          </Link>
          <Link href="/committees/create" className="text-slate-grey hover:text-paper-white transition-colors">
            Create
          </Link>
          <Link href="/profile" className="text-slate-grey hover:text-paper-white transition-colors">
            Profile
          </Link>
          <a
            href={explorerContractUrl()}
            target="_blank"
            rel="noreferrer"
            className="text-slate-grey hover:text-signal-cyan transition-colors flex items-center gap-1"
          >
            Explorer
            <ExternalLink size={12} />
          </a>
        </nav>

        {/* Wallet button */}
        <div className="flex items-center gap-3">
          {address ? (
            <div className="flex items-center gap-1.5">
              <div className="flex items-center gap-2 bg-graphite/80 border border-committee-blue/20 rounded-xl px-3 py-1.5 hover:border-committee-blue/40 transition-colors">
                <div className="w-1.5 h-1.5 rounded-full bg-liquidity-green" />
                <span className="font-mono text-xs text-paper-white tracking-wide">{formatAddress(address)}</span>
              </div>
              <button
                onClick={disconnect}
                className="p-1.5 text-slate-grey hover:text-risk-red hover:bg-risk-red/10 rounded-lg transition-all"
                title="Disconnect wallet"
              >
                <LogOut size={14} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => connect()}
              disabled={connecting}
              className={cn(
                "relative flex items-center gap-2 px-4 py-2 rounded-xl font-display font-semibold text-sm transition-all overflow-hidden",
                "bg-committee-blue hover:bg-committee-blue/90 text-white",
                "border border-signal-cyan/20 hover:border-signal-cyan/50",
                "shadow-[0_0_16px_-4px_rgba(56,189,248,0.25)] hover:shadow-[0_0_20px_-2px_rgba(56,189,248,0.35)]",
                "disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
              )}
            >
              {connecting ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Wallet size={13} />
              )}
              <span>{connecting ? "Connecting…" : "Connect Wallet"}</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
