'use client';

/**
 * "Run Sentinel Elite Analysis" — modal-launcher button on /portfolio.
 *
 * Two layers in the modal:
 *   1. Visuals (instant) — HF gauge, key stats, shock waterfall (-10/-30/-50),
 *      collateral composition bar. All driven client-side off `usePortfolio`,
 *      using the same Aave math as the rest of the dApp. No round-trip.
 *   2. Narrative (~10–20s) — calls the FREE Sentinel agent (`/api/agent`)
 *      with a structured prompt that orchestrates `get_portfolio` +
 *      `simulate_price_shock` × 2 + `get_wallet_holdings`. The model writes
 *      a multi-section risk assessment with concrete numbers.
 *
 * The visuals appear the moment the modal opens — no waiting on Anthropic
 * for the user to see what their position looks like. The agent's prose
 * narrative streams in below as it's ready.
 *
 * Note: the paid `/api/agent/premium-analysis` endpoint still exists as
 * the *agentic-payments demo* — it's meant to be called by Sentinel's own
 * agent wallet via x402, not by user clicks. This button uses the free
 * agent path because forcing every user to sign EIP-3009 to read their
 * own portfolio doesn't make sense.
 */

import React, { useState } from 'react';
import { X, Zap, Shield, Loader2 } from 'lucide-react';
import { useAccount } from 'wagmi';

import { usePortfolio } from '@/lib/aave/usePortfolio';
import { getChain, DEFAULT_CHAIN } from '@/lib/chains';
import { SentinelAnalysisVisuals } from './SentinelAnalysisVisuals';
import { MonteCarloPanel } from './MonteCarloPanel';
import { AssetMomentumPanel } from './AssetMomentumPanel';

interface AssistantBlock {
  type: 'text' | 'tool_use';
  text?: string;
}

interface WireMessage {
  role: 'user' | 'assistant' | 'tool';
  content?: string | AssistantBlock[];
}

export function PremiumAnalysisButton() {
  const { address, isConnected } = useAccount();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Pull the live portfolio whenever the modal is open. The hook honors the
  // currently-connected chain (post-Phase-A sub-task 6), so visuals reflect
  // whichever chain the wallet is on.
  const portfolio = usePortfolio(undefined, undefined);

  const runAnalysis = async () => {
    if (!address || !isConnected) {
      setError('Please connect your wallet first');
      return;
    }

    setIsLoading(true);
    setError(null);
    setAnalysis(null);

    try {
      const prompt = [
        `Run a complete Sentinel Elite Risk Assessment for my Aave V3 position at ${address}.`,
        ``,
        `Use these tools in sequence:`,
        `1. get_portfolio({ address: "${address}" }) — read live HF, collateral, debt, per-asset breakdown`,
        `2. simulate_price_shock({ address: "${address}", asset: "ALL_NON_STABLE", pctChange: -30 })`,
        `3. simulate_price_shock({ address: "${address}", asset: "ALL_NON_STABLE", pctChange: -50 })`,
        `4. get_wallet_holdings({ address: "${address}", chain: "arbitrum-one" }) — full ERC-20 scan beyond Aave`,
        ``,
        `Then write a structured assessment with these sections:`,
        `**Current Position** — HF, total collateral USD, total debt USD, weighted liquidation threshold`,
        `**Per-Asset Breakdown** — supplied, borrowed, USD value, liq price for each asset`,
        `**-30% Market Shock** — resulting HF, change, whether liquidatable`,
        `**-50% Stress Test** — resulting HF, change, whether liquidatable`,
        `**Wider Wallet** — what else you hold (flag any unfamiliar tokens as possible spam)`,
        `**Recommended Action Category** — describe the type of action without naming specific trades`,
        ``,
        `Be specific with numbers. Quote actual values, not "moderate risk".`,
      ].join('\n');

      const response = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: prompt }],
          activeAddress: address.toLowerCase(),
        }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(
          data.error || `Analysis failed (HTTP ${response.status})`
        );
      }

      const data = (await response.json()) as { messages: WireMessage[] };

      const reversed = [...data.messages].reverse();
      const lastAssistant = reversed.find((m) => m.role === 'assistant');
      let finalText = '';
      if (lastAssistant && Array.isArray(lastAssistant.content)) {
        finalText = lastAssistant.content
          .filter(
            (b): b is AssistantBlock & { text: string } =>
              b.type === 'text' && typeof b.text === 'string'
          )
          .map((b) => b.text)
          .join('\n\n');
      } else if (typeof lastAssistant?.content === 'string') {
        finalText = lastAssistant.content;
      }

      setAnalysis(finalText || 'The agent did not return any text content.');
    } catch (err) {
      setError((err as Error).message || 'Something went wrong');
    } finally {
      setIsLoading(false);
    }
  };

  const reset = () => {
    setAnalysis(null);
    setError(null);
  };

  const closeAndReset = () => {
    setIsOpen(false);
    reset();
  };

  // Whether we have enough position data to render meaningful visuals
  const visualsReady =
    isConnected &&
    !portfolio.loading &&
    !portfolio.isUnsupportedChain &&
    (portfolio.account.totalCollateralBase > 0n ||
      portfolio.account.totalDebtBase > 0n);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="group relative flex items-center gap-3 px-10 py-5 bg-gradient-to-r from-purple-600 to-violet-600 rounded-2xl font-semibold text-white transition-all active:scale-95 shadow-lg shadow-purple-500/30"
      >
        <Zap className="w-5 h-5" />
        Run Sentinel Elite Analysis
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl">
          <div className="relative w-full max-w-4xl max-h-[90vh] flex flex-col bg-zinc-950 border border-zinc-700 rounded-3xl overflow-hidden">
            {/* Header */}
            <div className="p-8 border-b border-zinc-800 flex justify-between items-start flex-shrink-0">
              <div>
                <div className="uppercase tracking-widest text-xs text-purple-400 font-bold mb-1">
                  SYSTEM INTELLIGENCE ACTIVE
                </div>
                <h2 className="text-3xl md:text-4xl font-black tracking-tighter">
                  SENTINEL ELITE ANALYSIS
                </h2>
                <p className="text-zinc-400 mt-2 text-sm">
                  Real-time risk modeling for your Aave V3 position
                  {portfolio.chainName ? ` on ${portfolio.chainName}` : ''}.
                </p>
              </div>
              <button
                onClick={closeAndReset}
                className="text-zinc-400 hover:text-white"
                aria-label="Close"
              >
                <X size={28} />
              </button>
            </div>

            {/* Body — scrollable */}
            <div className="p-8 overflow-y-auto flex-1 space-y-6">
              {/* VISUALS — render immediately from usePortfolio */}
              {!isConnected ? (
                <div className="bg-zinc-900/50 border border-white/5 rounded-2xl p-12 text-center">
                  <Shield className="w-16 h-16 text-purple-400 mx-auto mb-4" />
                  <p className="text-zinc-300 text-lg font-semibold mb-1">
                    Connect your wallet
                  </p>
                  <p className="text-zinc-500 text-sm">
                    Sentinel needs to read your Aave V3 position to run the
                    analysis.
                  </p>
                </div>
              ) : (
                <>
                  <SentinelAnalysisVisuals
                    portfolio={portfolio}
                    walletAddress={address}
                    walletChainSlug={
                      (getChain(portfolio.chainId) ?? DEFAULT_CHAIN).slug
                    }
                    loading={portfolio.loading}
                  />

                  {/* Asset Momentum & Force — free, derived from Alchemy
                      historical prices. With walletAddress passed in, it
                      auto-discovers every priced non-spam ERC-20 the wallet
                      holds across all 5 supported chains and analyzes the
                      top 15 by USD value, alongside the Aave positions and
                      a small market-context set. */}
                  {visualsReady && (
                    <AssetMomentumPanel
                      positions={portfolio.positions}
                      walletAddress={address}
                    />
                  )}

                  {/* Monte Carlo (paid via x402) — headline premium feature. */}
                  {visualsReady && (
                    <MonteCarloPanel hasPosition={visualsReady} />
                  )}
                </>
              )}

              {/* DIVIDER */}
              {visualsReady && (
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-zinc-800" />
                  <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">
                    AI Narrative
                  </p>
                  <div className="flex-1 h-px bg-zinc-800" />
                </div>
              )}

              {/* NARRATIVE (agent text) */}
              {visualsReady && (
                <>
                  {!analysis && !error && !isLoading && (
                    <div className="text-center py-6">
                      <button
                        onClick={runAnalysis}
                        className="px-10 py-4 bg-gradient-to-r from-purple-600 to-violet-600 rounded-2xl font-semibold text-base inline-flex items-center gap-3 shadow-lg shadow-purple-500/30"
                      >
                        Generate AI Narrative
                        <Zap className="w-5 h-5" />
                      </button>
                      <p className="text-zinc-500 text-xs mt-3">
                        Sentinel will run get_portfolio, two price-shock simulations, and a full wallet scan, then write a multi-section risk assessment.
                      </p>
                    </div>
                  )}

                  {isLoading && (
                    <div className="flex flex-col items-center justify-center min-h-[160px] text-center">
                      <Loader2 className="w-10 h-10 text-purple-400 mb-4 animate-spin" />
                      <p className="text-zinc-300 font-semibold">
                        Reading position from Aave V3 Pool…
                      </p>
                      <p className="text-zinc-500 text-sm mt-1">
                        Running shock simulations and wallet scan
                      </p>
                    </div>
                  )}

                  {error && (
                    <div className="space-y-3">
                      <div className="bg-red-950 border border-red-800 rounded-2xl p-5 text-red-400 text-sm">
                        {error}
                      </div>
                      <button
                        onClick={() => {
                          reset();
                          runAnalysis();
                        }}
                        className="w-full px-6 py-3 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-zinc-200 font-semibold transition-colors"
                      >
                        Retry
                      </button>
                    </div>
                  )}

                  {analysis && (
                    <div className="prose prose-invert max-w-none text-zinc-200 leading-relaxed whitespace-pre-wrap text-sm bg-zinc-900/30 border border-white/5 rounded-2xl p-6">
                      {analysis}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
