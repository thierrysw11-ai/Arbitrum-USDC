'use client';

/**
 * "Download PDF Report" — appears in the Premium tab after the Monte Carlo
 * simulation has completed. Bundles every premium section (Aave V3 risk,
 * Monte Carlo with Sharpe + interpretation, Composition with X-ray, Asset
 * Correlation matrix) into a multi-page branded PDF the user can save,
 * email, or share.
 *
 * Generation flow when the user clicks the button:
 *   1. POST /api/wallet-holdings → assemble Composition section
 *   2. Discover assets (Aave positions + non-spam wallet ERC-20s + market
 *      context) → POST /api/asset-momentum → assemble Correlation section
 *   3. Build the full ReportData
 *   4. @react-pdf/renderer pdf(<ReportPDF .../>).toBlob() → trigger download
 *
 * Keeps everything client-side so the marginal cost of the PDF is zero —
 * the user already paid 0.01 USDC for the Monte Carlo run, this is the
 * deliverable they paid for. The wallet-holdings + asset-momentum endpoints
 * are usually already warm in the browser cache from the live panels.
 */

import React, { useState } from 'react';
import { Download, Loader2, AlertTriangle, FileText } from 'lucide-react';

import type { Portfolio } from '@/lib/aave/types';
import type {
  ReportAaveSection,
  ReportMeta,
  ReportMonteCarloSection,
  ReportPortfolioMcSection,
} from '@/lib/report/types';
import {
  assembleCompositionSection,
  assembleCorrelationSection,
  assembleNarrativeSection,
  assembleReport,
  assembleWalletSection,
} from '@/lib/report/assemble';
import { ReportPDF } from './ReportPDF';

// Asset-discovery constants — duplicated narrowly from AssetCorrelationPanel
// so this component has no UI cross-imports.
const MAX_ASSETS = 10;
const MARKET_CONTEXT_ASSETS: AssetSpec[] = [
  {
    symbol: 'WETH',
    chainSlug: 'arbitrum-one',
    contractAddress: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
  },
  {
    symbol: 'WBTC',
    chainSlug: 'arbitrum-one',
    contractAddress: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f',
  },
  {
    symbol: 'ARB',
    chainSlug: 'arbitrum-one',
    contractAddress: '0x912CE59144191C1204E64559FE8253a0e49E6548',
  },
];

interface AssetSpec {
  chainSlug: string;
  contractAddress: string;
  symbol: string;
}

// =========================================================================
// Wire types — narrow shapes for the two endpoints we hit
// =========================================================================

interface WalletErc20 {
  contract: string;
  symbol: string;
  name: string | null;
  priceUsd: number | null;
  usdValue: number | null;
  isSpam: boolean;
}

interface ChainHoldings {
  chainSlug: string;
  chainName: string;
  nativeBalance: {
    symbol: string;
    balanceFormatted: number;
    usdValue: number | null;
  };
  erc20: WalletErc20[];
  legitimateUsd: number;
  spamUsd: number;
  error?: string;
}

interface WalletHoldingsResponse {
  chains: ChainHoldings[];
  legitimateUsd: number;
  spamUsd: number;
  totalUsd: number;
  error?: string;
}

interface MomentumResponse {
  results: Array<{
    symbol: string;
    chainSlug: string;
    contractAddress: string;
    priceHistory: Array<{ timestamp: number; price: number }>;
    error?: string;
  }>;
  error?: string;
}

// =========================================================================
// Component
// =========================================================================

interface Props {
  walletAddress: `0x${string}`;
  /** Pre-assembled Aave section. Null when the wallet has no live position. */
  aave: ReportAaveSection | null;
  /** Aave-mode Monte Carlo result. Null when user only ran portfolio MC. */
  monteCarlo: ReportMonteCarloSection | null;
  /** Portfolio-mode (drawdown / VaR) Monte Carlo. Null when user only ran Aave MC. */
  portfolioMc: ReportPortfolioMcSection | null;
  /** x402 settlement details, if available (shown on the cover page). */
  payment: { txHash?: string; network?: string } | null;
  /** Aave positions — used for correlation asset discovery. */
  positions: Portfolio['positions'];
  /**
   * Optional AI narrative text from the AI tab. When present, the PDF
   * appends a final page with the structured prose.
   */
  aiNarrative?: string | null;
}

export function DownloadReportButton({
  walletAddress,
  aave,
  monteCarlo,
  portfolioMc,
  payment,
  positions,
  aiNarrative,
}: Props) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    setIsGenerating(true);
    setError(null);
    try {
      // 1. Wallet holdings (powers the Composition section + correlation
      //    asset discovery from non-Aave wallet positions).
      const holdingsRes = await fetch('/api/wallet-holdings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: walletAddress }),
      });
      const holdings = (await holdingsRes.json()) as WalletHoldingsResponse;
      if (!holdingsRes.ok || holdings.error) {
        throw new Error(holdings.error || `wallet-holdings HTTP ${holdingsRes.status}`);
      }

      // Composition mirrors what the live panel renders (X-ray on by default
      // — same convention as the panel). Wallet section reuses the same
      // wire response so we don't double-fetch.
      const composition = assembleCompositionSection(holdings, true);
      const wallet = assembleWalletSection(holdings);

      // 2. Asset discovery for correlation: Aave positions + non-spam,
      //    priced wallet ERC-20s sorted by USD value + market context.
      const fromPositions: AssetSpec[] = positions
        .filter((p) => p.aTokenBalance > 0n || p.variableDebtBalance > 0n)
        .map((p) => ({
          symbol: p.symbol,
          chainSlug: 'arbitrum-one',
          contractAddress: p.asset,
        }));

      const fromWallet: Array<AssetSpec & { usdValue: number }> = [];
      for (const chain of holdings.chains) {
        for (const t of chain.erc20) {
          if (t.isSpam) continue;
          if (t.priceUsd === null) continue;
          if ((t.usdValue ?? 0) < 1) continue;
          fromWallet.push({
            chainSlug: chain.chainSlug,
            contractAddress: t.contract,
            symbol: t.symbol,
            usdValue: t.usdValue ?? 0,
          });
        }
      }
      fromWallet.sort((a, b) => b.usdValue - a.usdValue);

      const seen = new Set<string>();
      const merged: AssetSpec[] = [];
      const push = (a: AssetSpec) => {
        const key = `${a.chainSlug}:${a.contractAddress.toLowerCase()}`;
        if (seen.has(key)) return;
        seen.add(key);
        merged.push(a);
      };
      for (const a of fromPositions) push(a);
      for (const a of fromWallet) push(a);
      for (const a of MARKET_CONTEXT_ASSETS) push(a);

      const discoveredAssets = merged.slice(0, MAX_ASSETS);

      // 3. Asset-momentum (we only use priceHistory for correlation, but the
      //    endpoint returns the whole momentum payload).
      let correlation = null;
      if (discoveredAssets.length >= 2) {
        const momRes = await fetch('/api/asset-momentum', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ assets: discoveredAssets }),
        });
        const mom = (await momRes.json()) as MomentumResponse;
        if (momRes.ok && !mom.error) {
          correlation = assembleCorrelationSection(mom);
        }
        // Soft-fail: if momentum 500s, the PDF still ships without the page.
      }

      // 4. Build the full report.
      const meta: ReportMeta = {
        walletAddress,
        generatedAt: new Date(),
        isPremium: true,
        settlementTxHash: payment?.txHash,
        settlementChain:
          payment?.network === 'base'
            ? 'base'
            : payment?.network === 'arbitrum-one'
              ? 'arbitrum-one'
              : undefined,
      };
      const data = assembleReport({
        meta,
        aave,
        monteCarlo,
        portfolioMc,
        composition,
        correlation,
        wallet,
        narrative: assembleNarrativeSection(aiNarrative ?? null),
      });

      // 5. Generate the PDF blob and trigger download.
      // Dynamic import keeps @react-pdf/renderer out of the initial bundle —
      // it's only loaded when the user actually clicks the button.
      const { pdf } = await import('@react-pdf/renderer');
      const blob = await pdf(<ReportPDF data={data} />).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const stamp = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `usdc-guardian-report-${shortAddr(walletAddress)}-${stamp}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Revoke after a tick so Safari doesn't cancel the download.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setError((err as Error).message || 'PDF generation failed');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="bg-gradient-to-b from-purple-950/20 to-zinc-900/50 border border-purple-500/20 rounded-2xl p-5 mb-5">
      <div className="flex items-center gap-2 mb-3">
        <FileText size={14} className="text-purple-400" />
        <p className="text-[10px] uppercase tracking-widest text-purple-300 font-bold">
          Premium · Downloadable Report
        </p>
        <span className="ml-auto text-[10px] uppercase tracking-widest text-purple-400/70 font-bold border border-purple-500/20 px-2 py-0.5 rounded">
          PDF
        </span>
      </div>

      <p className="text-zinc-300 text-sm mb-4 leading-relaxed">
        Save the full Sentinel Elite Risk Assessment as a branded PDF —
        composition, sector breakdown, asset correlation, wallet holdings,
        and Monte Carlo distribution (when run) in one document you can
        email, archive, or feed to another tool.
      </p>
      {!monteCarlo && !portfolioMc && (
        <div className="text-[11px] text-amber-300/80 bg-amber-500/5 border border-amber-500/20 rounded-lg px-3 py-2 mb-3">
          Tip — run a Monte Carlo simulation above to include drawdown / VaR
          pages in the report. The PDF will still ship without them, but the
          quantitative pages will be missing.
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 text-red-300 rounded-xl p-3 mb-3 text-[12px]">
          <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <button
        onClick={generate}
        disabled={isGenerating}
        className="w-full px-6 py-3 bg-gradient-to-r from-purple-600 to-violet-600 rounded-2xl font-semibold text-white inline-flex items-center justify-center gap-2 shadow-lg shadow-purple-500/30 active:scale-[0.99] transition-transform disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {isGenerating ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            Building PDF…
          </>
        ) : (
          <>
            <Download size={16} />
            Download PDF Report
          </>
        )}
      </button>

      <p className="text-[10px] text-zinc-500 mt-2 text-center">
        Generated client-side · ~50–100 KB · no extra payment needed
      </p>
    </div>
  );
}

function shortAddr(addr: string): string {
  return `${addr.slice(2, 8)}-${addr.slice(-4)}`;
}
