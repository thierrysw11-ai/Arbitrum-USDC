/**
 * Type definitions for the downloadable PDF report.
 *
 * The PDF aggregates data already computed by the Sentinel Elite Analysis
 * modal (Aave V3 position, Monte Carlo simulation, portfolio composition,
 * asset correlation, wallet holdings, AI narrative). Building the report
 * client-side: caller assembles the data, the PDF component renders it.
 *
 * No optional fields here — the report is "all or nothing" per section.
 * If a section's data isn't available, the caller passes null for that
 * section and the PDF skips the page entirely.
 */

import type { CompositionAnalysis } from '@/lib/aave/composition';

export interface ReportMeta {
  walletAddress: string;
  generatedAt: Date;
  /** True if the user paid for the premium analysis to generate this. */
  isPremium: boolean;
  /** x402 settlement tx hash, if available. */
  settlementTxHash?: string;
  settlementChain?: 'arbitrum-one' | 'base';
}

/** Result of one stress-test scenario (e.g. "all non-stable assets -30%"). */
export interface ReportShockResult {
  /** Negative pct change applied to non-stable assets (-10, -30, -50). */
  pctChange: number;
  /** Resulting health factor under the shock. */
  hf: number;
  /** Resulting collateral USD under the shock. */
  collateralUsd: number;
  /** Resulting debt USD (changes if debt asset is non-stable too). */
  debtUsd: number;
  /** True if HF dropped below 1.0. */
  liquidatable: boolean;
}

export interface ReportAaveSection {
  chainName: string;
  healthFactor: number;
  totalCollateralUsd: number;
  totalDebtUsd: number;
  liquidationThresholdPct: number;
  maxLtvPct: number;
  positions: Array<{
    symbol: string;
    suppliedUsd: number;
    borrowedUsd: number;
    liquidationPriceUsd: number | null;
  }>;
  /**
   * Stress-test waterfall — three standard market-wide shocks
   * (-10%, -30%, -50%) applied to all non-stable assets. Empty array if
   * the position has no non-stable collateral.
   */
  shocks: ReportShockResult[];
}

/** Single point on the efficient-frontier scatter plot. */
export interface ReportFrontierPoint {
  leverageScale: number;
  annualizedReturn: number;
  annualizedVolatility: number;
  sharpeRatio: number;
  pLiquidation: number;
  initialHf: number;
  isCurrent: boolean;
  isOptimal: boolean;
  /** True if pLiq < 5% AND initialHf > 1.0 — same definition as the live panel. */
  feasible: boolean;
}

/** Compact representation of one Monte Carlo path for the sparkline chart. */
export interface ReportSamplePath {
  /** HF value for each day, day 0..horizonDays. Capped at 5 for display. */
  daily: number[];
  liquidated: boolean;
}

export interface ReportMonteCarloSection {
  paths: number;
  horizonDays: number;
  pLiquidation: number;
  expectedHf: number;
  percentiles: {
    p5: number;
    p25: number;
    p50: number;
    p75: number;
    p95: number;
  };
  shockedAssets: string[];
  riskAdjusted: {
    sharpeRatio: number;
    annualizedReturnMean: number;
    annualizedReturnVolatility: number;
    riskFreeRateAnnual: number;
  };
  /** Plain-English interpretation already computed by the panel. */
  interpretation: {
    level: 'safe' | 'caution' | 'risky' | 'critical';
    headline: string;
    details: string[];
    recommendation: string;
  };
  /** Histogram of terminal HFs — bins are upper-bounds, counts is the number of paths in each bucket. */
  histogram: { bins: number[]; counts: number[] };
  /** Up to 50 sample paths for the sparkline visualization. */
  samplePaths: ReportSamplePath[];
  /** Efficient-frontier sweep across leverage scales. */
  efficientFrontier: {
    points: ReportFrontierPoint[];
    /** Plain-English verdict (sentence) about whether the user's leverage is on the frontier. */
    verdict: string;
  };
}

export interface ReportCompositionSection {
  /** The full composition output from analyzeComposition(). */
  composition: CompositionAnalysis;
  /** Whether X-ray (look-through aTokens) was applied. */
  xrayApplied: boolean;
}

export interface ReportCorrelationSection {
  /** Asset symbols in the order they appear on the matrix. */
  symbols: string[];
  /** Pairwise correlation matrix (square, symbols.length × symbols.length). */
  matrix: number[][];
  /** Average off-diagonal correlation (single-number summary). */
  averagePairwise: number;
}

/** Per-chain entry in the wallet-holdings page. */
export interface ReportWalletChain {
  chainSlug: string;
  chainName: string;
  totalUsd: number;
  legitimateUsd: number;
  spamUsd: number;
  native: {
    symbol: string;
    balance: number;
    usdValue: number | null;
  };
  erc20: Array<{
    symbol: string;
    name: string | null;
    balance: number | null;
    usdValue: number | null;
    isSpam: boolean;
  }>;
  error?: string;
}

export interface ReportWalletSection {
  chains: ReportWalletChain[];
  legitimateUsd: number;
  spamUsd: number;
  totalUsd: number;
}

export interface ReportNarrativeSection {
  /** The AI-generated multi-section risk assessment from the Sentinel agent. */
  text: string;
}

export interface ReportData {
  meta: ReportMeta;
  /** Aave V3 risk profile. Null if no active position. */
  aave: ReportAaveSection | null;
  /** Monte Carlo result. Null if user didn't run premium analysis. */
  monteCarlo: ReportMonteCarloSection | null;
  /** Composition analysis. Null if wallet scan unavailable. */
  composition: ReportCompositionSection | null;
  /** Asset correlation matrix. Null if insufficient price history. */
  correlation: ReportCorrelationSection | null;
  /** Per-chain wallet holdings (raw). Null if scan failed. */
  wallet: ReportWalletSection | null;
  /** AI narrative from the Sentinel agent. Null if the user didn't run it. */
  narrative: ReportNarrativeSection | null;
}
