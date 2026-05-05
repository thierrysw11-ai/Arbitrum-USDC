'use client';

import React, { Suspense, useEffect, useMemo, useState } from 'react';
import { useAccount } from 'wagmi';
import { useRouter, useSearchParams } from 'next/navigation';
import { Eye, X } from 'lucide-react';
import AaveRiskGauge from '@/components/AaveRiskGauge';
import AaveMarketsOverview from '@/components/AaveMarketsOverview';
import LiquidityFlow from '@/components/LiquidityFlow';
import LiquidationFeed from '@/components/LiquidationFeed';
import GlassCard from '@/components/GlassCard';
import { PremiumAnalysisButton } from '@/components/PremiumAnalysisButton';

/**
 * Sanity check on a hex address. Strict 40-hex-char check; we don't
 * resolve ENS here (that would need a separate hook + RPC call).
 */
function isValidAddress(s: string | null | undefined): s is `0x${string}` {
  return !!s && /^0x[a-fA-F0-9]{40}$/.test(s);
}

/**
 * Top-level export wraps the body in Suspense — required by Next.js 14
 * App Router for `useSearchParams()`. Without it, the URL-driven spectator
 * mode causes a hydration mismatch (server renders without the param,
 * client immediately knows it). Suspense lets Next.js handle the
 * client-side render boundary cleanly.
 */
export default function SentinelPortfolioPage() {
  return (
    <Suspense fallback={<PortfolioPageSkeleton />}>
      <SentinelPortfolioPageInner />
    </Suspense>
  );
}

function PortfolioPageSkeleton() {
  return (
    <div className="min-h-screen bg-[#050505] text-zinc-100">
      <main className="max-w-7xl mx-auto px-6 py-10">
        <div className="h-72 rounded-[2.5rem] border border-white/5 bg-gradient-to-b from-zinc-900 to-black animate-pulse" />
      </main>
    </div>
  );
}

function SentinelPortfolioPageInner() {
  const { isConnected } = useAccount();
  const router = useRouter();
  const searchParams = useSearchParams();

  // wagmi's connection state differs between server (always false) and
  // client (true once WalletConnect resolves). Gate any UI that reads
  // `isConnected` behind this `mounted` flag so the first paint always
  // matches the server-rendered HTML.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  const safeIsConnected = mounted && isConnected;

  // ?as=0x… in the URL is the source of truth. Local input + presets just
  // push to the URL via router.replace so links remain shareable.
  const asParam = searchParams.get('as');
  const viewAddress = isValidAddress(asParam) ? asParam : undefined;

  const setViewAddress = (next: `0x${string}` | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next) params.set('as', next);
    else params.delete('as');
    const qs = params.toString();
    router.replace(qs ? `/portfolio?${qs}` : '/portfolio', { scroll: false });
  };

  return (
    <div className="min-h-screen bg-[#050505] text-zinc-100">
      <main className="max-w-7xl mx-auto px-6 py-10 space-y-12">

        {/* SPECTATOR BANNER — only when ?as= is set. Compact, dismissible
            via the X. Visually distinct so the user never forgets they're
            looking at someone else's wallet. */}
        {viewAddress && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 text-amber-200">
            <Eye size={16} className="flex-shrink-0" />
            <p className="text-sm flex-1">
              <span className="font-bold">Spectator mode</span> — analyzing{' '}
              <code className="font-mono text-amber-100">
                {viewAddress.slice(0, 6)}…{viewAddress.slice(-4)}
              </code>
              . Reads on this page target this address; if you run the paid
              analysis, you pay 0.01 USDC from your own connected wallet.
            </p>
            <button
              onClick={() => setViewAddress(null)}
              className="text-amber-300 hover:text-amber-100 transition-colors"
              aria-label="Exit spectator mode"
            >
              <X size={16} />
            </button>
          </div>
        )}

        {/* SECTION 1: HERO & PREMIUM ACCESS */}
        <section className="relative overflow-hidden rounded-[2.5rem] border border-white/5 bg-gradient-to-b from-zinc-900 to-black p-8 md:p-12 shadow-2xl">
          <div className="relative z-10 flex flex-col lg:flex-row items-start justify-between gap-12">
            <div className="max-w-2xl space-y-6">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-black uppercase tracking-widest">
                {viewAddress
                  ? `Viewing as ${viewAddress.slice(0, 6)}…${viewAddress.slice(-4)}`
                  : safeIsConnected
                    ? 'Wallet connected · ready to generate'
                    : 'Free preview · no signup'}
              </div>

              <h1 className="text-5xl md:text-7xl font-black tracking-tighter leading-[0.9] uppercase italic">
                {viewAddress ? (
                  <>
                    Their <br />
                    <span className="text-zinc-500">portfolio</span> report.
                  </>
                ) : (
                  <>
                    Your DeFi <br />
                    <span className="text-zinc-500">portfolio</span> report.
                  </>
                )}
              </h1>

              <p className="text-zinc-400 text-lg leading-relaxed max-w-xl">
                Sector allocation, concentration risk, Monte Carlo simulation,
                correlation matrix, action recommendations — across all 5 EVM
                chains, generated from{' '}
                {viewAddress ? "the spectator address's" : 'your'} live on-chain
                positions. Free preview below; full report for{' '}
                <span className="font-mono text-zinc-200">5 USDC</span>{' '}
                settled on-chain via x402.
              </p>

              {mounted && !safeIsConnected && !viewAddress && (
                <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400 text-xs font-bold uppercase tracking-tight">
                  Connect a wallet to populate your free preview
                </div>
              )}

              {/* "View any wallet" controls — paste an address or pick a
                  preset. Lives in the hero so it's always discoverable. */}
              <SpectatorControls
                current={viewAddress}
                onChange={setViewAddress}
              />
            </div>

            {/* Primary conversion action — opens the full-report modal */}
            <div className="w-full lg:w-auto self-center lg:self-start">
              <PremiumAnalysisButton viewAddress={viewAddress} />
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
            <GlassCard title="Liquidation Watch · Aave V3 Arbitrum">
              <LiquidationFeed />
            </GlassCard>
          </div>
        </div>
      </main>
    </div>
  );
}

// =========================================================================
// SpectatorControls — paste-an-address input + preset chips
// =========================================================================

function SpectatorControls({
  current,
  onChange,
}: {
  current: `0x${string}` | undefined;
  onChange: (next: `0x${string}` | null) => void;
}) {
  const [draft, setDraft] = useState(current ?? '');
  // Re-sync the input when the URL changes from elsewhere (preset click,
  // back button, etc).
  useEffect(() => {
    setDraft(current ?? '');
  }, [current]);

  const trimmed = draft.trim();
  const isValid = useMemo(() => isValidAddress(trimmed), [trimmed]);
  const isCurrent = trimmed.toLowerCase() === (current ?? '').toLowerCase();

  return (
    <div className="space-y-2">
      <div className="flex flex-col sm:flex-row gap-2 items-stretch">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="View any wallet — paste a 0x… address"
          spellCheck={false}
          className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-zinc-900/80 border border-zinc-800 focus:border-purple-500/50 focus:outline-none text-sm font-mono text-zinc-100 placeholder:text-zinc-600"
        />
        <button
          onClick={() => isValid && !isCurrent && onChange(trimmed as `0x${string}`)}
          disabled={!isValid || isCurrent}
          className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white text-sm font-bold transition-colors whitespace-nowrap"
        >
          {isCurrent ? 'Viewing' : 'View'}
        </button>
      </div>
      {current && (
        <div className="flex flex-wrap gap-1.5 items-center">
          <button
            onClick={() => onChange(null)}
            className="text-[11px] px-2.5 py-1 rounded-full border border-zinc-800 hover:border-zinc-700 text-zinc-500 hover:text-zinc-300"
          >
            Use my wallet
          </button>
        </div>
      )}
    </div>
  );
}
