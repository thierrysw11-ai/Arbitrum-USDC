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
import {
  assembleAaveSection,
  assembleMonteCarloSection,
} from '@/lib/report/assemble';
import {
  SentinelAnalysisVisuals,
  WalletHoldingsPanel,
} from './SentinelAnalysisVisuals';
import { MonteCarloPanel, type MonteCarloResponse } from './MonteCarloPanel';
import { AssetMomentumPanel } from './AssetMomentumPanel';
import { PortfolioCompositionPanel } from './PortfolioCompositionPanel';
import { AssetCorrelationPanel } from './AssetCorrelationPanel';
import { EtherfiInsightsPanel } from './EtherfiInsightsPanel';
import { DownloadReportButton } from './DownloadReportButton';

interface AssistantBlock {
  type: 'text' | 'tool_use';
  text?: string;
}

interface WireMessage {
  role: 'user' | 'assistant' | 'tool';
  content?: string | AssistantBlock[];
}

// Tab IDs used by the modal body. Order here = left-to-right visual order.
type TabId = 'risk' | 'wallet' | 'momentum' | 'premium' | 'ai';

interface TabSpec {
  id: TabId;
  label: string;
  badge?: string;
}

const TABS: TabSpec[] = [
  { id: 'risk', label: 'Risk Profile' },
  { id: 'wallet', label: 'Wallet' },
  { id: 'momentum', label: 'Momentum' },
  { id: 'premium', label: 'Premium', badge: 'PAID' },
  { id: 'ai', label: 'AI Narrative' },
];

function TabNav({
  active,
  onChange,
}: {
  active: TabId;
  onChange: (id: TabId) => void;
}) {
  return (
    <div className="flex border-b border-zinc-800 mb-5 -mx-1 px-1 overflow-x-auto">
      {TABS.map((t) => {
        const isActive = active === t.id;
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className={`px-4 py-2.5 text-[11px] font-bold uppercase tracking-widest border-b-2 transition-colors whitespace-nowrap inline-flex items-center gap-1.5 ${
              isActive
                ? 'text-purple-300 border-purple-500'
                : 'text-zinc-500 border-transparent hover:text-zinc-300 hover:border-zinc-700'
            }`}
            aria-pressed={isActive}
          >
            {t.label}
            {t.badge && (
              <span className="text-[8px] uppercase tracking-widest text-purple-400/80 border border-purple-500/30 px-1.5 py-0.5 rounded">
                {t.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function PremiumAnalysisButton() {
  const { address, isConnected } = useAccount();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('risk');
  // Lifted Monte Carlo result so the DownloadReportButton can package the
  // same numbers the user just saw into the PDF deliverable.
  const [monteCarloResult, setMonteCarloResult] = useState<{
    data: MonteCarloResponse;
    payment: { txHash?: string; network?: string } | null;
  } | null>(null);

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
            <div className="p-6 md:p-8 overflow-y-auto flex-1">
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
                  <TabNav active={activeTab} onChange={setActiveTab} />

                  {/* RISK PROFILE TAB */}
                  {activeTab === 'risk' && (
                    <SentinelAnalysisVisuals
                      portfolio={portfolio}
                      loading={portfolio.loading}
                    />
                  )}

                  {/* WALLET TAB — multi-chain holdings (always renders, even
                      without an Aave position) + ether.fi protocol insights
                      from the user's published subgraphs. */}
                  {activeTab === 'wallet' && address && (
                    <>
                      <WalletHoldingsPanel address={address} />
                      <EtherfiInsightsPanel walletAddress={address} />
                    </>
                  )}

                  {/* MOMENTUM TAB — velocity + force, auto-discovers wallet. */}
                  {activeTab === 'momentum' && (
                    <AssetMomentumPanel
                      positions={portfolio.positions}
                      walletAddress={address}
                    />
                  )}

                  {/* PREMIUM TAB — paid x402 unlocks the full suite:
                      Monte Carlo (with Sharpe + efficient frontier inline),
                      Portfolio Composition (sector/market-cap/concentration —
                      DeFi mirror of TradFi wealth-manager reports),
                      Asset Correlation matrix.

                      The DownloadReportButton appears at the bottom once the
                      Monte Carlo run has completed — that's the "deliverable"
                      the user paid for. */}
                  {activeTab === 'premium' && (
                    <>
                      <MonteCarloPanel
                        hasPosition={visualsReady}
                        onResult={setMonteCarloResult}
                      />
                      {address && (
                        <>
                          <PortfolioCompositionPanel walletAddress={address} />
                          <AssetCorrelationPanel
                            positions={portfolio.positions}
                            walletAddress={address}
                          />
                          {monteCarloResult && (
                            <DownloadReportButton
                              walletAddress={address}
                              aave={assembleAaveSection(
                                portfolio,
                                portfolio.chainName
                              )}
                              monteCarlo={assembleMonteCarloSection(
                                monteCarloResult.data
                              )}
                              payment={monteCarloResult.payment}
                              positions={portfolio.positions}
                              aiNarrative={analysis}
                            />
                          )}
                        </>
                      )}
                    </>
                  )}

                  {/* AI NARRATIVE TAB */}
                  {activeTab === 'ai' && (
                    <AINarrativeTab
                      analysis={analysis}
                      error={error}
                      isLoading={isLoading}
                      onRun={runAnalysis}
                      onRetry={() => {
                        reset();
                        runAnalysis();
                      }}
                      visualsReady={visualsReady}
                    />
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

// =========================================================================
// AI Narrative tab — extracted so the modal body stays clean.
// =========================================================================

function AINarrativeTab({
  analysis,
  error,
  isLoading,
  onRun,
  onRetry,
  visualsReady,
}: {
  analysis: string | null;
  error: string | null;
  isLoading: boolean;
  onRun: () => void;
  onRetry: () => void;
  visualsReady: boolean;
}) {
  if (!visualsReady) {
    return (
      <div className="bg-zinc-900/50 border border-white/5 rounded-2xl p-8 text-center text-zinc-500 text-sm">
        AI narrative needs an active Aave V3 position to analyze. Connect a
        wallet with a position, or open the Risk Profile tab to see what's
        currently being read.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[300px] text-center">
        <Loader2 className="w-10 h-10 text-purple-400 mb-4 animate-spin" />
        <p className="text-zinc-300 font-semibold">
          Reading position from Aave V3 Pool…
        </p>
        <p className="text-zinc-500 text-sm mt-1">
          Running shock simulations and wallet scan
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-3">
        <div className="bg-red-950 border border-red-800 rounded-2xl p-5 text-red-400 text-sm">
          {error}
        </div>
        <button
          onClick={onRetry}
          className="w-full px-6 py-3 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-zinc-200 font-semibold transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="text-center py-10">
        <button
          onClick={onRun}
          className="px-10 py-4 bg-gradient-to-r from-purple-600 to-violet-600 rounded-2xl font-semibold text-base inline-flex items-center gap-3 shadow-lg shadow-purple-500/30"
        >
          Generate AI Narrative
          <Zap className="w-5 h-5" />
        </button>
        <p className="text-zinc-500 text-xs mt-3 max-w-md mx-auto">
          Sentinel will run get_portfolio, two price-shock simulations, and a
          full wallet scan, then write a multi-section risk assessment.
        </p>
      </div>
    );
  }

  return (
    <div className="prose prose-invert max-w-none text-zinc-200 leading-relaxed whitespace-pre-wrap text-sm bg-zinc-900/30 border border-white/5 rounded-2xl p-6">
      {analysis}
    </div>
  );
}
