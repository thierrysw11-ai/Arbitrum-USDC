'use client';

import React from 'react';
import AaveRiskGauge from '@/components/AaveRiskGauge';
import AaveMarketsOverview from '@/components/AaveMarketsOverview';
import LiquidityFlow from '@/components/LiquidityFlow';
import WhaleFeed from '@/components/WhaleFeed';
import GlassCard from '@/components/GlassCard';

export default function SentinelDashboard() {
  return (
    <div className="min-h-screen bg-[#050505] text-zinc-100 selection:bg-purple-500/30">
      {/* Removed the extra header block that was causing repetition */}
      
      <main className="max-w-7xl mx-auto px-6 py-10 space-y-8">
        {/* Top Tier: Risk & Volume */}
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

        {/* Bottom Tier: Markets & Whale Activity */}
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