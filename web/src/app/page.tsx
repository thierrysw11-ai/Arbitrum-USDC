'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight, Send } from 'lucide-react';
import AaveRiskGauge from '@/components/AaveRiskGauge';
import AaveMarketsOverview from '@/components/AaveMarketsOverview';
import LiquidityFlow from '@/components/LiquidityFlow';
import WhaleFeed from '@/components/WhaleFeed';
import GlassCard from '@/components/GlassCard';

export default function SentinelDashboard() {
  return (
    <div className="min-h-screen bg-[#050505] text-zinc-100 selection:bg-purple-500/30">
      <main className="max-w-7xl mx-auto px-6 py-10 space-y-12">
        {/* SECTION 1: HERO — matches the portfolio page's hero treatment */}
        <section className="relative overflow-hidden rounded-[2.5rem] border border-white/5 bg-gradient-to-b from-zinc-900 to-black p-8 md:p-12 shadow-2xl">
          <div className="relative z-10 flex flex-col lg:flex-row items-start justify-between gap-12">
            <div className="max-w-2xl space-y-6">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400 text-[10px] font-black uppercase tracking-widest">
                Multi-Chain · Aave V3 · USDC Intelligence
              </div>

              <h1 className="text-5xl md:text-7xl font-black tracking-tighter leading-[0.9] uppercase italic">
                Real-Time. <br />
                <span className="text-zinc-500">On-Chain.</span> <br />
                Sentinel.
              </h1>

              <p className="text-zinc-400 text-lg leading-relaxed max-w-xl">
                USDC Guardian indexes Aave V3 risk and USDC flows across
                Arbitrum, Base, Optimism, and Polygon — live, via custom
                subgraphs. The Sentinel agent reasons over the same data,
                grounded in <span className="font-mono text-zinc-200">viem</span> RPC reads.
              </p>

              <div className="flex flex-wrap items-center gap-4">
                <Link
                  href="/portfolio"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-violet-600 rounded-2xl font-semibold text-white transition-all active:scale-95 shadow-lg shadow-purple-500/30"
                >
                  Open Portfolio
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <Link
                  href="/send"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl font-semibold text-zinc-200 transition-colors"
                >
                  <Send className="w-4 h-4" />
                  Send USDC
                </Link>
              </div>
            </div>

            {/* Right rail: at-a-glance stats. Static labels, but the values
                that matter are pulled live by the cards below the hero. */}
            <div className="w-full lg:w-auto grid grid-cols-2 lg:grid-cols-1 gap-3 lg:min-w-[260px]">
              <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">
                  Aave V3 Reserves
                </p>
                <p className="text-3xl font-black tracking-tight mt-1">20+</p>
                <p className="text-[10px] text-zinc-500 mt-1">indexed on Arbitrum</p>
              </div>
              <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">
                  USDC Subgraph
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                  </span>
                  <p className="text-3xl font-black tracking-tight text-emerald-400">LIVE</p>
                </div>
                <p className="text-[10px] text-zinc-500 mt-1">my own deployment</p>
              </div>
            </div>
          </div>

          {/* Decorative purple blur — same accent as the portfolio hero. */}
          <div className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/4 w-96 h-96 bg-purple-600/10 blur-[120px] pointer-events-none" />
        </section>

        {/* SECTION 2: RISK & VOLUME */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-4">
            <GlassCard title="Security Sentinel Analysis">
              <AaveRiskGauge />
            </GlassCard>
          </div>
          <div className="lg:col-span-8">
            <GlassCard title="Network Liquidity Flow">
              <LiquidityFlow />
            </GlassCard>
          </div>
        </div>

        {/* SECTION 3: MARKETS & WHALE ACTIVITY */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-8">
            <GlassCard title="Aave V3 Market Intelligence">
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
