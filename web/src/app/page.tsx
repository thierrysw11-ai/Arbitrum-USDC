'use client';

import React from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  FileText,
  ShieldCheck,
  Layers,
  Network,
  Sparkles,
  Check,
} from 'lucide-react';
import AaveRiskGauge from '@/components/AaveRiskGauge';
import AaveMarketsOverview from '@/components/AaveMarketsOverview';
import LiquidityFlow from '@/components/LiquidityFlow';
import LiquidationFeed from '@/components/LiquidationFeed';
import GlassCard from '@/components/GlassCard';

/**
 * Landing page — restructured around a single value proposition:
 *   "Wealth-manager-grade portfolio reports for your DeFi holdings."
 *
 * Above-the-fold = one sentence + one CTA. No feature list, no
 * jargon. Sample-report preview below shows what the user gets without
 * making them connect first. Existing market widgets demoted to a
 * "Markets at a glance" section near the bottom — they're useful
 * context but they're not the product.
 */
export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#050505] text-zinc-100 selection:bg-purple-500/30">
      <main className="max-w-7xl mx-auto px-6 py-10 space-y-16">
        {/* =================================================================
            HERO — single sentence + single CTA
            ================================================================= */}
        <section className="relative overflow-hidden rounded-[2.5rem] border border-white/5 bg-gradient-to-b from-zinc-900 to-black p-8 md:p-16 shadow-2xl">
          <div className="relative z-10 max-w-3xl mx-auto text-center space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-300 text-[10px] font-black uppercase tracking-widest">
              <FileText size={10} />
              Wealth-Manager-Grade DeFi Reports
            </div>

            <h1 className="text-4xl md:text-6xl font-black tracking-tighter leading-[0.95]">
              Get a TradFi-quality portfolio report
              <br />
              <span className="text-zinc-500">on your on-chain holdings.</span>
            </h1>

            <p className="text-zinc-400 text-lg max-w-2xl mx-auto leading-relaxed">
              Sector allocation, concentration risk, Monte Carlo simulation,
              correlation matrix, action recommendations. The kind of report
              your stockbroker emails you — but for your wallet, across all 5
              major EVM chains.
            </p>

            <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
              <Link
                href="/portfolio"
                className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-purple-600 to-violet-600 rounded-2xl font-semibold text-base text-white transition-all active:scale-95 shadow-lg shadow-purple-500/30"
              >
                Connect &amp; Generate Free Preview
                <ArrowRight className="w-4 h-4" />
              </Link>
              <a
                href="#what-you-get"
                className="inline-flex items-center gap-2 px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl text-sm font-semibold text-zinc-200 transition-colors"
              >
                See what&apos;s in a report
              </a>
            </div>

            <p className="text-zinc-600 text-xs pt-2">
              Free preview · No signup · Full report 5 USDC, settled on-chain
              via x402
            </p>
          </div>

          {/* Decorative accent */}
          <div className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/4 w-[500px] h-[500px] bg-purple-600/10 blur-[140px] pointer-events-none" />
          <div className="absolute bottom-0 left-0 translate-y-1/2 -translate-x-1/4 w-[400px] h-[400px] bg-violet-600/10 blur-[140px] pointer-events-none" />
        </section>

        {/* =================================================================
            WHAT'S IN THE REPORT — sample sections, drives the value prop
            ================================================================= */}
        <section id="what-you-get" className="space-y-8">
          <div className="text-center max-w-2xl mx-auto">
            <p className="text-[11px] uppercase tracking-widest text-purple-300 font-bold mb-2">
              What&apos;s inside
            </p>
            <h2 className="text-3xl md:text-4xl font-black tracking-tighter">
              Five sections, one report.
            </h2>
            <p className="text-zinc-400 mt-3">
              Each generated from your actual on-chain positions and live
              market data. No mocks. No mock numbers.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            <FeatureCard
              icon={<Layers size={18} />}
              accent="#a855f7"
              title="Asset Allocation"
              copy="Sector breakdown (stables / smart-contract platforms / Bitcoin / LSTs / DeFi / etc.), market-cap distribution, and concentration metrics — HHI, top-3 share, effective N. The same X-ray analysis your equity broker runs."
            />
            <FeatureCard
              icon={<ShieldCheck size={18} />}
              accent="#22c55e"
              title="Aave V3 Risk Profile"
              copy="Live health factor, weighted liquidation threshold, per-asset liquidation prices. Plus deterministic shock scenarios at -10%, -30%, -50% across all non-stable collateral."
            />
            <FeatureCard
              icon={<Sparkles size={18} />}
              accent="#fbbf24"
              title="Monte Carlo Simulation"
              copy="1,000 GBM-simulated price paths over 30 days using realized asset volatilities. Returns probability of liquidation, terminal HF distribution, sample paths chart, and plain-English interpretation."
            />
            <FeatureCard
              icon={<Network size={18} />}
              accent="#06b6d4"
              title="Correlation &amp; Sharpe"
              copy="Pairwise Pearson correlation heatmap of 14d daily log returns. Annualized Sharpe ratio with quality verdict. Efficient frontier sweep showing whether your current leverage is well-tuned."
            />
            <FeatureCard
              icon={<FileText size={18} />}
              accent="#ec4899"
              title="Multi-Chain Wallet Scan"
              copy="Every priced ERC-20 across Ethereum, Arbitrum, Base, Optimism, and Polygon. Spam detection (Minereum-style airdrops flagged and excluded from real totals). Per-chain breakdown."
            />
            <FeatureCard
              icon={<ArrowRight size={18} />}
              accent="#3b82f6"
              title="Action Recommendations"
              copy="Categorical guidance derived from the analysis: deleverage / add stablecoin collateral / rebalance / no action needed. Generated by the Sentinel AI agent grounded in the report's numbers — never hallucinated."
            />
          </div>
        </section>

        {/* =================================================================
            PRICING — clear tiers, real numbers
            ================================================================= */}
        <section className="space-y-8">
          <div className="text-center max-w-2xl mx-auto">
            <p className="text-[11px] uppercase tracking-widest text-purple-300 font-bold mb-2">
              Pricing
            </p>
            <h2 className="text-3xl md:text-4xl font-black tracking-tighter">
              Pay for the report, not the dashboard.
            </h2>
            <p className="text-zinc-400 mt-3">
              All payments settled on-chain via x402 — no subscriptions in
              fiat, no credit-card form, no signup. Your wallet is your
              account.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-5xl mx-auto">
            <PricingCard
              tier="Free Preview"
              price="0 USDC"
              tagline="Get a feel for it."
              features={[
                'Total wallet value across 5 chains',
                'Top holdings list',
                'Asset class pie chart',
                'AI chat (5 questions/day)',
              ]}
              ctaLabel="Connect wallet"
              ctaHref="/portfolio"
              cta="ghost"
            />
            <PricingCard
              tier="Single Report"
              price="5 USDC"
              tagline="One full report. Valid 30 days."
              features={[
                'Everything in Free, plus:',
                'Monte Carlo simulation',
                'Sharpe ratio + efficient frontier',
                'Correlation matrix',
                'AI action recommendations',
                'Downloadable PDF (coming soon)',
              ]}
              ctaLabel="Generate report"
              ctaHref="/portfolio"
              cta="primary"
              featured
            />
            <PricingCard
              tier="Monthly"
              price="25 USDC/mo"
              tagline="Continuous monitoring."
              features={[
                'Unlimited reports',
                'Liquidation-risk alerts (HF threshold)',
                'AI chat (unlimited)',
                'Multi-wallet aggregation',
                'Telegram / email alerts',
              ]}
              ctaLabel="Coming soon"
              ctaHref="#"
              cta="ghost"
              disabled
            />
          </div>

          <p className="text-center text-[11px] text-zinc-600 max-w-xl mx-auto">
            Demo prices for portfolio launch — real production rates will
            track value delivered. Existing 0.01 USDC dev pricing remains
            available so you can verify the x402 rails before committing
            real money.
          </p>
        </section>

        {/* =================================================================
            MARKETS — demoted from hero, kept as context
            ================================================================= */}
        <section className="space-y-6">
          <div className="text-center max-w-2xl mx-auto">
            <p className="text-[11px] uppercase tracking-widest text-zinc-500 font-bold mb-2">
              Markets at a glance
            </p>
            <h2 className="text-2xl md:text-3xl font-black tracking-tighter text-zinc-300">
              Live data, free for everyone.
            </h2>
            <p className="text-zinc-500 mt-2 text-sm">
              The same indexers and on-chain reads that power your report.
            </p>
          </div>

          {/* Markets grid — this was the hero before; demoted to context */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-4">
              <GlassCard title="Aave V3 Risk Profile">
                <AaveRiskGauge />
              </GlassCard>
            </div>
            <div className="lg:col-span-8">
              <GlassCard title="USDC Liquidity Flow (Arbitrum)">
                <LiquidityFlow />
              </GlassCard>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-8">
              <GlassCard title="Aave V3 Markets · Arbitrum">
                <AaveMarketsOverview />
              </GlassCard>
            </div>
            <div className="lg:col-span-4">
              <GlassCard title="Liquidation Watch · Aave V3 Arbitrum">
                <LiquidationFeed />
              </GlassCard>
            </div>
          </div>
        </section>

        {/* =================================================================
            FOOTER CTA — last call to convert
            ================================================================= */}
        <section className="text-center py-12 border-t border-white/5">
          <h3 className="text-2xl md:text-3xl font-black tracking-tighter mb-3">
            Ready to see your portfolio properly?
          </h3>
          <p className="text-zinc-500 max-w-md mx-auto mb-6">
            Connect a wallet for a free preview. Generate the full report when
            you&apos;re ready.
          </p>
          <Link
            href="/portfolio"
            className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-purple-600 to-violet-600 rounded-2xl font-semibold text-base text-white shadow-lg shadow-purple-500/30 active:scale-95 transition-transform"
          >
            Get my free preview
            <ArrowRight className="w-4 h-4" />
          </Link>
        </section>
      </main>
    </div>
  );
}

// =========================================================================
// Sub-components
// =========================================================================

function FeatureCard({
  icon,
  title,
  copy,
  accent,
}: {
  icon: React.ReactNode;
  title: string;
  copy: string;
  accent: string;
}) {
  return (
    <div className="bg-zinc-900/50 border border-white/5 rounded-2xl p-5 hover:border-white/10 transition-colors">
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center mb-3"
        style={{ backgroundColor: `${accent}15`, color: accent }}
      >
        {icon}
      </div>
      <h3 className="text-base font-bold text-zinc-100 mb-1.5">{title}</h3>
      <p className="text-[13px] text-zinc-400 leading-relaxed">{copy}</p>
    </div>
  );
}

function PricingCard({
  tier,
  price,
  tagline,
  features,
  ctaLabel,
  ctaHref,
  cta,
  featured = false,
  disabled = false,
}: {
  tier: string;
  price: string;
  tagline: string;
  features: string[];
  ctaLabel: string;
  ctaHref: string;
  cta: 'primary' | 'ghost';
  featured?: boolean;
  disabled?: boolean;
}) {
  return (
    <div
      className={`relative rounded-2xl p-6 flex flex-col ${
        featured
          ? 'bg-gradient-to-b from-purple-950/40 to-zinc-900/60 border-2 border-purple-500/40 shadow-2xl shadow-purple-500/10'
          : 'bg-zinc-900/50 border border-white/5'
      }`}
    >
      {featured && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-purple-500 text-white text-[10px] font-black uppercase tracking-widest">
          Most useful
        </div>
      )}
      <div className="mb-1">
        <p className="text-[11px] uppercase tracking-widest font-bold text-zinc-400">
          {tier}
        </p>
        <p className="text-3xl font-black tracking-tight mt-1">{price}</p>
        <p className="text-[12px] text-zinc-500 mt-1">{tagline}</p>
      </div>
      <ul className="space-y-2 my-5 flex-1">
        {features.map((f, i) => (
          <li key={i} className="flex items-start gap-2 text-[13px] text-zinc-300">
            <Check size={14} className="text-emerald-400 flex-shrink-0 mt-0.5" />
            <span>{f}</span>
          </li>
        ))}
      </ul>
      {disabled ? (
        <div className="px-4 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-500 text-sm font-semibold text-center">
          {ctaLabel}
        </div>
      ) : (
        <Link
          href={ctaHref}
          className={`px-4 py-2.5 rounded-xl text-sm font-semibold text-center transition-colors ${
            cta === 'primary'
              ? 'bg-gradient-to-r from-purple-600 to-violet-600 text-white shadow-lg shadow-purple-500/20'
              : 'bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-200'
          }`}
        >
          {ctaLabel}
        </Link>
      )}
    </div>
  );
}
