"use client";

import { ExternalLink } from "lucide-react";
import { explorerTxUrl, explorerContractUrl } from "@/lib/genlayer";

interface ExplorerLinkCardProps {
  label: string;
  hash?: string;
  isContract?: boolean;
}

export function ExplorerLinkCard({ label, hash, isContract }: ExplorerLinkCardProps) {
  const url = isContract ? explorerContractUrl() : hash ? explorerTxUrl(hash) : null;
  if (!url) return null;

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-2 px-3 py-2 bg-committee-blue/10 border border-committee-blue/30 rounded-lg hover:border-committee-blue/60 hover:bg-committee-blue/20 transition-all group text-sm"
    >
      <div className="w-6 h-6 rounded bg-committee-blue/20 flex items-center justify-center flex-shrink-0">
        <ExternalLink size={12} className="text-signal-cyan" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-slate-grey">{label}</p>
        <p className="text-xs font-mono text-paper-white/70 truncate group-hover:text-paper-white transition-colors">
          {hash ? `${hash.slice(0, 10)}…${hash.slice(-8)}` : "View on Explorer"}
        </p>
      </div>
      <ExternalLink size={12} className="text-slate-grey group-hover:text-signal-cyan transition-colors flex-shrink-0" />
    </a>
  );
}
