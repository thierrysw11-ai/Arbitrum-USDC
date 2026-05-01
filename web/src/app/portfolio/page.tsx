'use client';

import React from 'react';
import { useAccount, useReadContract } from 'wagmi';
import { arbitrum } from 'wagmi/chains';
import type { UserAccountData } from "@/lib/aave/types";
import AaveRiskGauge from '@/components/AaveRiskGauge';
import AaveMarketsOverview from '@/components/AaveMarketsOverview';
import LiquidityFlow from '@/components/LiquidityFlow';
import WhaleFeed from '@/components/WhaleFeed';
import GlassCard from '@/components/GlassCard';
import { PremiumAnalysisButton } from '@/components/PremiumAnalysisButton';

// Contract Constants from your Risk Gauge
const AAVE_V3_POOL = '0x794a61358D6845594F94dc1DB02A252b5b4814aD' as const;
const AAVE_V3_POOL_ABI = [
  {
    name: 'getUserAccountData',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [
      { name: 'totalCollateralBase', type: 'uint256' },
      { name: 'totalDebtBase', type: 'uint256' },
      { name: 'availableBorrowsBase', type: 'uint256' },
      { name: 'currentLiquidationThreshold', type: 'uint256' },
      { name: 'ltv', type: 'uint256' },
      { name: 'healthFactor', type: 'uint256' },
    ],
  },
] as const;

export default function SentinelPortfolioPage() {
  const { address, isConnected } = useAccount();

  // Fetch data directly from the contract
  const { data } = useReadContract({
    address: AAVE_V3_POOL,
    abi: AAVE_V3_POOL_ABI,
    functionName: 'getUserAccountData',
    chainId: arbitrum.id,
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address) },
  });

  // Map the raw contract array to the UserAccountData object type
  const account: UserAccountData | undefined = data ? {
    totalCollateralBase: data[0],
    totalDebtBase: data[1],
    availableBorrowsBase: data[2],
    currentLiquidationThreshold: data[3],
    ltv: data[4],
    healthFactor: data[5],
  } : undefined;

  return (
    <div className="min-h-screen bg-[#050505] text-zinc-100">
      <main className="max-w-7xl mx-auto px-6 py-10 space-y-12">
        
        {/* SECTION 1: HERO & PREMIUM ACCESS */}
        <section className="relative overflow-hidden rounded-[2.5rem] border border-white/5 bg-gradient-to-b from-zinc-900 to-black p-8 md:p-12 shadow-2xl">
          <div className="relative z-10 flex flex-col lg:flex-row items-start justify-between gap-12">
            <div className="max-w-2xl space-y-6">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-black uppercase tracking-widest">
                System Live: Arbitrum One Node Active
              </div>
              
              <h1 className="text-5xl md:text-7xl font-black tracking-tighter leading-[0.9] uppercase italic">
                Sentinel <span className="text-zinc-500">Elite</span> <br />
                Dashboard.
              </h1>
              
              <p className="text-zinc-400 text-lg leading-relaxed max-w-xl">
                Real-time risk monitoring for USDC positions. Access deep-dive impact 
                assessments and yield benchmarking via agentic x402 settlement.
              </p>

              {!isConnected && (
                <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400 text-xs font-bold uppercase tracking-tight">
                  Connect wallet to view portfolio-specific risk parameters
                </div>
              )}
            </div>

            {/* Premium Analysis Trigger */}
            <div className="w-full lg:w-auto self-center lg:self-start">
               {/* Only show button if we have successfully mapped the account object */}
               {isConnected && account ? (
                 <PremiumAnalysisButton address={address} account={account} />
               ) : (
                 <div className="h-14 w-64 bg-white/5 animate-pulse rounded-full border border-white/10 flex items-center justify-center">
                    <span className="text-[10px] text-zinc-600 uppercase font-bold tracking-widest">
                        {isConnected ? "Syncing Contract..." : "Wallet Not Connected"}
                    </span>
                 </div>
               )}
            </div>
          </div>

          <div className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/4 w-96 h-96 bg-purple-600/10 blur-[120px] pointer-events-none" />
        </section>

        {/* ... Rest of your sections remain exactly the same */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-5">
                <GlassCard title="Security Sentinel Analysis">
                    <div className="p-2">
                        <AaveRiskGauge />
                    </div>
                </GlassCard>
            </div>
            {/* ... */}
        </div>
      </main>
    </div>
  );
}