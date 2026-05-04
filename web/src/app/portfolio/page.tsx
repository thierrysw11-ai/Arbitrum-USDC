'use client';

import React from 'react';
import { useAccount } from 'wagmi';
import AaveRiskGauge from '@/components/AaveRiskGauge';
import AaveMarketsOverview from '@/components/AaveMarketsOverview';
import LiquidityFlow from '@/components/LiquidityFlow';
import WhaleFeed from '@/components/WhaleFeed';
import GlassCard from '@/components/GlassCard';
import { PremiumAnalysisButton } from '@/components/PremiumAnalysisButton';

export default function SentinelPortfolioPage() {
  const { isConnected } = useAccount();

  return (
    <div className="min-h-screen bg-[#050505] text-zinc-100">
      <main className="max-w-7xl mx-auto px-6 py-10 space-y-12">
        
        {/* SECTION 1: HERO & PREMIUM ACCESS — re-aligned to the new
            "wealth-manager-grade DeFi reports" positioning. The Run-
            analysis button on the right is the conversion target. */}
        <section className="relative overflow-hidden rounded-[2.5rem] border border-white/5 bg-gradient-to-b from-zinc-900 to-black p-8 md:p-12 shadow-2xl">
          <div className="relative z-10 flex flex-col lg:flex-row items-start justify-between gap-12">
            <div className="max-w-2xl space-y-6">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-black uppercase tracking-widest">
                {isConnected
                  ? 'Wallet connected · ready to generate'
                  : 'Free preview · no signup'}
              </div>

              <h1 className="text-5xl md:text-7xl font-black tracking-tighter leading-[0.9] uppercase italic">
                Your DeFi <br />
                <span className="text-zinc-500">portfolio</span> report.
              </h1>

              <p className="text-zinc-400 text-lg leading-relaxed max-w-xl">
                Sector allocation, concentration risk, Monte Carlo simulation,
                correlation matrix, action recommendations — across all 5 EVM
                chains, generated from your live on-chain positions. Free
                preview below; full report for{' '}
                <span className="font-mono text-zinc-200">5 USDC</span>{' '}
                settled on-chain via x402.
              </p>

              {!isConnected && (
                <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400 text-xs font-bold uppercase tracking-tight">
                  Connect a wallet to populate your free preview
                </div>
              )}
            </div>

            {/* Primary conversion action — opens the full-report modal */}
            <div className="w-full lg:w-auto self-center lg:self-start">
              <PremiumAnalysisButton />
            </div>
          </div>

          <div className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/4 w-96 h-96 bg-purple-600/10 blur-[120px] pointer-events-none" />
        </section>

        {/* SECTION 2: CORE RISK METRICS */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-5">
            <GlassCard title="Security Sentinel Analysis">
              <div className="p-2">
                <AaveRiskGauge />
                {/*
                  "Liquidation Point: 1.00 HF" is true universally — Aave V3
                  liquidates whenever HF crosses 1.00. The companion card was
                  previously a hardcoded "+14.2%" buffer figure; that's
                  derivable from the live HF but the formula varies depending
                  on which collateral is at risk. Removed for now to avoid
                  showing a fabricated number — the gauge above already
                  conveys the actual buffer visually.
                */}
                <div className="mt-4 grid grid-cols-1 gap-4 text-center">
                  <div className="p-3 bg-white/5 rounded-xl border border-white/5">
                    <p className="text-[10px] text-zinc-500 uppercase font-bold">Liquidation Point</p>
                    <p className="text-xl font-mono font-black text-red-400">1.00 HF</p>
                    <p className="text-[10px] text-zinc-500 mt-1">
                      Aave V3 liquidates positions when health factor crosses 1.00.
                    </p>
                  </div>
                </div>
              </div>
            </GlassCard>
          </div>

          <div className="lg:col-span-7">
            <GlassCard title="Global Liquidity Flow (Arbitrum One)">
              <div className="h-[320px] w-full">
                <LiquidityFlow />
              </div>
            </GlassCard>
          </div>
        </div>

        {/* SECTION 3: MARKET INTELLIGENCE */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-8">
            <GlassCard title="Aave V3 Market Benchmarks">
              <AaveMarketsOverview />
            </GlassCard>
          </div>

          <div className="lg:col-span-4">
            <GlassCard title="Sentinel Whale Watch">
              <WhaleFeed />
            </GlassCard>
          </div>
        </div>
      </main>
    </div>
  );
}
