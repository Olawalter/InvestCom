import Link from "next/link";
import { ArrowRight, Shield, Zap, Scale, FileText } from "lucide-react";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-navy">
      {/* Hero */}
      <section className="relative overflow-hidden px-6 pt-24 pb-20 text-center">
        {/* Background grid */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(37,99,235,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(37,99,235,0.03)_1px,transparent_1px)] bg-[size:64px_64px] pointer-events-none" />
        {/* Radial glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-committee-blue/5 rounded-full blur-3xl pointer-events-none" />

        <div className="relative max-w-4xl mx-auto space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-committee-blue/30 bg-committee-blue/10 text-xs font-mono text-signal-cyan mb-4">
            <div className="w-1.5 h-1.5 rounded-full bg-liquidity-green animate-pulse" />
            GenLayer StudioNet · Intelligent Contracts
          </div>

          <h1 className="font-accent text-5xl sm:text-6xl lg:text-7xl text-paper-white leading-none tracking-tight">
            Do not ask<br />
            <span className="gradient-text">what to buy.</span>
          </h1>
          <p className="font-display text-2xl sm:text-3xl text-paper-white/80">
            Ask what fits the policy.
          </p>

          <p className="text-slate-grey text-lg max-w-2xl mx-auto leading-relaxed mt-4">
            Investment Committee uses GenLayer validators to compare DAO treasury proposals
            by risk, liquidity, fundamentals, governance, and treasury objectives, then
            produces a consensus-backed recommendation.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-4">
            <Link
              href="/committees/create"
              className="flex items-center gap-2 px-6 py-3 bg-committee-blue hover:bg-committee-blue/80 text-white font-display font-semibold rounded-xl transition-all glow-blue"
            >
              Create Committee
              <ArrowRight size={16} />
            </Link>
            <Link
              href="/committees"
              className="flex items-center gap-2 px-6 py-3 border border-committee-blue/40 hover:border-committee-blue text-paper-white font-display font-semibold rounded-xl transition-all"
            >
              View Committees
            </Link>
          </div>
        </div>
      </section>

      {/* Positioning copy */}
      <section className="px-6 py-12 text-center border-y border-committee-blue/10 bg-graphite/30">
        <div className="max-w-3xl mx-auto space-y-4">
          <p className="font-display text-xl text-paper-white/90">Treasury decisions are not price predictions.</p>
          <p className="text-slate-grey text-lg">They are policy decisions under risk.</p>
          <p className="gradient-text-gold font-display text-xl font-semibold">
            GenLayer turns that judgement into consensus.
          </p>
        </div>
      </section>

      {/* Features */}
      <section className="px-6 py-20">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-xs font-mono text-slate-grey uppercase tracking-widest mb-3">Why GenLayer</p>
            <h2 className="font-display text-3xl text-paper-white">
              What a normal contract <span className="text-risk-red">cannot</span> do
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[
              {
                icon: <Shield className="text-policy-gold" size={20} />,
                title: "Policy Interpretation",
                desc: "Validators interpret natural-language DAO investment policies — risk appetite, liquidity constraints, governance requirements — and score each proposal against them.",
              },
              {
                icon: <Scale className="text-signal-cyan" size={20} />,
                title: "Equivalence Principle",
                desc: "Validators may phrase analysis differently but agree on the same verdict, band labels, and recommended proposal. Only canonical fields are compared — not prose.",
              },
              {
                icon: <Zap className="text-liquidity-green" size={20} />,
                title: "Live Evidence Evaluation",
                desc: "Each proposal submits evidence URLs. Validators can fetch and read public data to assess claims around liquidity, risk, and fundamentals.",
              },
              {
                icon: <FileText className="text-governance-purple" size={20} />,
                title: "Structured Appeal Flow",
                desc: "Structured appeal bases — new risk evidence, liquidity misread, governance misread — trigger a second round of non-deterministic review with full re-evaluation.",
              },
            ].map((f) => (
              <div key={f.title} className="panel p-6 space-y-3 hover:border-committee-blue/40 transition-colors">
                <div className="w-9 h-9 rounded-lg bg-graphite flex items-center justify-center border border-white/10">
                  {f.icon}
                </div>
                <h3 className="font-display font-semibold text-paper-white">{f.title}</h3>
                <p className="text-sm text-slate-grey leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Flow */}
      <section className="px-6 py-16 bg-graphite/20">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-xs font-mono text-slate-grey uppercase tracking-widest mb-3">How it works</p>
            <h2 className="font-display text-3xl text-paper-white">Committee Lifecycle</h2>
          </div>
          <div className="flex flex-col gap-3">
            {[
              "DAO defines investment policy",
              "Proposal window opens",
              "Delegates submit investment proposals",
              "Proposal window closes",
              "GenLayer validators compare proposals",
              "Canonical recommendation is stored",
              "Appeal window opens",
              "Final recommendation is published",
              "DAO uses recommendation for governance",
            ].map((step, i) => (
              <div key={i} className="flex items-center gap-4">
                <span className="w-7 h-7 rounded-full bg-committee-blue/20 border border-committee-blue/40 flex items-center justify-center text-xs font-mono text-signal-cyan flex-shrink-0">
                  {i + 1}
                </span>
                <span className="text-paper-white/80 text-sm">{step}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Use cases */}
      <section className="px-6 py-16">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="font-display text-3xl text-paper-white">Example Use Cases</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {[
              "Stablecoin deployment",
              "Treasury diversification",
              "Liquidity provisioning",
              "Ecosystem token allocation",
              "Strategic partner investment",
              "Treasury runway preservation",
              "Grant pool management",
              "RWA yield allocation",
              "Market maker allocation",
              "DAO-owned liquidity",
            ].map((uc) => (
              <div key={uc} className="panel p-3 text-center text-xs text-slate-grey hover:text-paper-white hover:border-committee-blue/30 transition-colors">
                {uc}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Disclaimer */}
      <section className="px-6 py-10 border-t border-white/5">
        <div className="max-w-2xl mx-auto text-center">
          <p className="text-xs text-slate-grey leading-relaxed">
            Investment Committee is not financial advice. It is a consensus-based policy evaluation tool.
            The protocol does not guarantee profit. The final decision remains with the DAO or governance process.
          </p>
        </div>
      </section>
    </div>
  );
}
