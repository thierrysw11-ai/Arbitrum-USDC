/**
 * Type definitions for the downloadable PDF report.
 *
 * The PDF aggregates data already computed by the Sentinel Elite Analysis
 * modal (Aave V3 position, Monte Carlo simulation, portfolio composition,
 * asset correlation). Building the report client-side: caller assembles
 * the data, the PDF component renders it.
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
}
