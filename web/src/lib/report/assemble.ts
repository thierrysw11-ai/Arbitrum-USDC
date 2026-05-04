/**
 * Assembly helpers — convert raw runtime objects into the strongly-typed
 * `ReportData` shape that `<ReportPDF />` consumes.
 *
 * Kept pure (no React, no fetches) so the same helpers can be reused later
 * by a server-side PDF endpoint or by a CLI / test harness.
 *
 * Each `assembleX` returns the section or `null` if the input is too thin
 * to produce a meaningful page in the report. The PDF skips null sections.
 */

import {
  baseToUsd,
  ltToFraction,
  liquidationPriceForAsset,
  tokenToFloat,
  wadToFloat,
} from '@/lib/aave/math';
import {
  analyzeComposition,
  type CompositionAnalysis,
} from '@/lib/aave/composition';
import type { Portfolio } from '@/lib/aave/types';
import type {
  ReportAaveSection,
  ReportCompositionSection,
  ReportCorrelationSection,
  ReportData,
  ReportMeta,
  ReportMonteCarloSection,
} from './types';

// =========================================================================
// Aave V3 section
// =========================================================================

/**
 * Convert a `usePortfolio()` snapshot into the report's Aave section.
 * Returns null when the wallet has no live position (collateral and debt
 * both zero) — the PDF will skip the page.
 */
export function assembleAaveSection(
  portfolio: Portfolio,
  chainName: string
): ReportAaveSection | null {
  const { account, positions } = portfolio;
  if (account.totalCollateralBase === 0n && account.totalDebtBase === 0n) {
    return null;
  }

  const totalDebtBase = account.totalDebtBase;

  return {
    chainName,
    healthFactor: wadToFloat(account.healthFactor),
    totalCollateralUsd: baseToUsd(account.totalCollateralBase),
    totalDebtUsd: baseToUsd(account.totalDebtBase),
    liquidationThresholdPct:
      ltToFraction(account.currentLiquidationThreshold) * 100,
    maxLtvPct: ltToFraction(account.ltv) * 100,
    positions: positions.map((p) => {
      const supplied = tokenToFloat(p.aTokenBalance, p.decimals);
      const borrowed = tokenToFloat(p.variableDebtBalance, p.decimals);
      const priceUsd = baseToUsd(p.priceBase);
      const liqPriceBase = liquidationPriceForAsset(p, positions, totalDebtBase);
      return {
        symbol: p.symbol,
        suppliedUsd: supplied * priceUsd,
        borrowedUsd: borrowed * priceUsd,
        liquidationPriceUsd: liqPriceBase === null ? null : baseToUsd(liqPriceBase),
      };
    }),
  };
}

// =========================================================================
// Monte Carlo section
// =========================================================================

// Wire shape from /api/agent/monte-carlo (mirror of MonteCarloResponse in
// MonteCarloPanel — duplicated narrowly to keep this file independent).
type MaybeInf = number | 'INFINITY';

interface MonteCarloWire {
  simulation: {
    config: { paths: number; horizonDays: number; nonStableAssets: string[] };
    pLiquidation: number;
    percentiles: {
      p5: MaybeInf;
      p25: MaybeInf;
      p50: MaybeInf;
      p75: MaybeInf;
      p95: MaybeInf;
    };
    expectedTerminalHf: MaybeInf;
    riskAdjusted: {
      sharpeRatio: number;
      annualizedReturnMean: number;
      annualizedReturnVolatility: number;
      riskFreeRateAnnual: number;
    };
  };
  meta: { currentHealthFactor: number };
}

function unwrap(v: MaybeInf): number {
  return v === 'INFINITY' ? Number.POSITIVE_INFINITY : v;
}

/**
 * Convert the wire response from /api/agent/monte-carlo into the
 * report section. Re-runs the same plain-English `interpret()` used in
 * the live panel so the PDF text matches what the user just saw.
 */
export function assembleMonteCarloSection(
  wire: MonteCarloWire
): ReportMonteCarloSection {
  const sim = wire.simulation;
  const interp = interpret(
    sim.pLiquidation,
    unwrap(sim.percentiles.p5),
    unwrap(sim.percentiles.p50),
    unwrap(sim.percentiles.p95),
    sim.config.horizonDays,
    wire.meta.currentHealthFactor
  );

  return {
    paths: sim.config.paths,
    horizonDays: sim.config.horizonDays,
    pLiquidation: sim.pLiquidation,
    expectedHf: unwrap(sim.expectedTerminalHf),
    percentiles: {
      p5: unwrap(sim.percentiles.p5),
      p25: unwrap(sim.percentiles.p25),
      p50: unwrap(sim.percentiles.p50),
      p75: unwrap(sim.percentiles.p75),
      p95: unwrap(sim.percentiles.p95),
    },
    shockedAssets: sim.config.nonStableAssets,
    riskAdjusted: {
      sharpeRatio: sim.riskAdjusted.sharpeRatio,
      annualizedReturnMean: sim.riskAdjusted.annualizedReturnMean,
      annualizedReturnVolatility: sim.riskAdjusted.annualizedReturnVolatility,
      riskFreeRateAnnual: sim.riskAdjusted.riskFreeRateAnnual,
    },
    interpretation: interp,
  };
}

// Re-implementation of MonteCarloPanel's `interpret()` — kept here so the
// assembly module is self-contained (no UI imports).
function interpret(
  pLiq: number,
  p5: number,
  p50: number,
  p95: number,
  horizon: number,
  currentHf: number
): ReportMonteCarloSection['interpretation'] {
  const pctFmt = (p: number) => `${(p * 100).toFixed(2)}%`;
  const fmtHf = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : '∞');

  const dropFromCurrent = (target: number) => {
    if (!Number.isFinite(currentHf) || !Number.isFinite(target)) return null;
    if (currentHf <= 0) return null;
    return ((currentHf - target) / currentHf) * 100;
  };
  const p5DropPct = dropFromCurrent(p5);
  const dropLine =
    p5DropPct !== null
      ? `That's a ${p5DropPct.toFixed(0)}% drop from your current HF of ${currentHf.toFixed(2)}.`
      : `Current HF: ${Number.isFinite(currentHf) ? currentHf.toFixed(2) : '∞'}.`;

  if (pLiq < 0.005) {
    return {
      level: 'safe',
      headline: `Robust. Liquidation extremely unlikely over ${horizon} days.`,
      details: [
        `Probability of liquidation in the next ${horizon} days: ${pctFmt(pLiq)} — under half a percent.`,
        `Even in the worst 5% of simulated futures, your HF stays at ${fmtHf(p5)}. ${dropLine}`,
        `Median outcome: HF lands near ${fmtHf(p50)}. Top 5% of paths: HF ≥ ${fmtHf(p95)}.`,
      ],
      recommendation:
        'No defensive action needed. You have headroom for additional borrowing if you want — your safety buffer is generous.',
    };
  }
  if (pLiq < 0.02) {
    return {
      level: 'safe',
      headline: `Healthy. Liquidation risk is low but non-zero.`,
      details: [
        `Probability of liquidation: ${pctFmt(pLiq)} — about 1 in ${Math.round(1 / pLiq)} simulated paths.`,
        `Worst 5% of scenarios bring HF to ${fmtHf(p5)}. ${dropLine}`,
        `Median outcome: HF ${fmtHf(p50)}. Best 5%: HF ≥ ${fmtHf(p95)}.`,
      ],
      recommendation:
        "You're in a comfortable zone. Consider keeping at least your current collateral buffer — you have room to ride through normal market volatility without action.",
    };
  }
  if (pLiq < 0.05) {
    return {
      level: 'caution',
      headline: `Moderate risk. About 1 in ${Math.round(1 / pLiq)} ${horizon}-day futures liquidate you.`,
      details: [
        `Probability of liquidation: ${pctFmt(pLiq)}.`,
        `In the worst 5% of scenarios, HF drops to ${fmtHf(p5)} — close to liquidation territory. ${dropLine}`,
        `Median outcome is still healthy at HF ${fmtHf(p50)}, but the left tail is real.`,
      ],
      recommendation:
        'Worth de-risking. Consider reducing variable debt or adding stablecoin collateral to push the 5th-percentile HF further above 1.0.',
    };
  }
  if (pLiq < 0.15) {
    return {
      level: 'risky',
      headline: `Elevated liquidation risk over ${horizon} days.`,
      details: [
        `Probability of liquidation: ${pctFmt(pLiq)} — roughly 1 in ${Math.round(1 / pLiq)} ${horizon}-day paths.`,
        `Worst 5% of scenarios: HF ${fmtHf(p5)}. ${dropLine}`,
        `Even the median outcome lands at ${fmtHf(p50)}, leaving little headroom.`,
      ],
      recommendation:
        'Defensive action recommended. The simplest mitigations: partial debt repayment, or supplementing collateral with stablecoin assets to raise the weighted liquidation threshold.',
    };
  }
  return {
    level: 'critical',
    headline: `High liquidation probability — review urgently.`,
    details: [
      `Probability of liquidation: ${pctFmt(pLiq)}. Roughly ${Math.round(pLiq * 100)} out of every 100 simulated 30-day paths cross the 1.0 threshold.`,
      `5th-percentile HF: ${fmtHf(p5)}. Median: ${fmtHf(p50)}. ${dropLine}`,
      `This level of risk persists across volatility regimes — it's a structural debt-vs-collateral imbalance, not just bad-luck tail risk.`,
    ],
    recommendation:
      'Strongly consider unwinding part of the position. Either reduce debt directly or switch to lower-volatility collateral. Continuing without action exposes you to a meaningful chance of a forced liquidation event.',
  };
}

// =========================================================================
// Composition section — wraps wallet-holdings → analyzeComposition()
// =========================================================================

interface WalletHoldingsWire {
  chains: Array<{
    nativeBalance: {
      symbol: string;
      balanceFormatted: number;
      usdValue: number | null;
    };
    erc20: Array<{
      symbol: string;
      usdValue: number | null;
      isSpam: boolean;
    }>;
  }>;
}

/**
 * Build the Composition section from a wallet-holdings wire response.
 * Mirrors the same flatten + analyzeComposition() call the live panel
 * does, so the PDF section reproduces what the user saw on screen.
 */
export function assembleCompositionSection(
  wire: WalletHoldingsWire,
  xray: boolean
): ReportCompositionSection | null {
  const holdings: Array<{ symbol: string; usdValue: number }> = [];
  for (const c of wire.chains) {
    if (
      c.nativeBalance.usdValue &&
      c.nativeBalance.usdValue > 0 &&
      c.nativeBalance.balanceFormatted > 0
    ) {
      holdings.push({
        symbol: c.nativeBalance.symbol,
        usdValue: c.nativeBalance.usdValue,
      });
    }
    for (const t of c.erc20) {
      if (t.isSpam) continue;
      if (t.usdValue === null || t.usdValue <= 0) continue;
      holdings.push({ symbol: t.symbol, usdValue: t.usdValue });
    }
  }
  if (holdings.length === 0) return null;
  const composition: CompositionAnalysis = analyzeComposition(holdings, { xray });
  if (composition.totalUsd === 0) return null;
  return { composition, xrayApplied: xray };
}

// =========================================================================
// Correlation section — pairwise Pearson on log returns
// =========================================================================

interface MomentumWire {
  results: Array<{
    symbol: string;
    contractAddress: string;
    priceHistory: Array<{ timestamp: number; price: number }>;
    error?: string;
  }>;
}

function pricesToLogReturns(
  prices: Array<{ timestamp: number; price: number }>
): number[] {
  if (prices.length < 2) return [];
  const out: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    const p0 = prices[i - 1].price;
    const p1 = prices[i].price;
    if (p0 > 0 && p1 > 0) out.push(Math.log(p1 / p0));
  }
  return out;
}

function pearson(a: number[], b: number[]): number | null {
  const n = Math.min(a.length, b.length);
  if (n < 2) return null;
  let sumA = 0;
  let sumB = 0;
  for (let i = 0; i < n; i++) {
    sumA += a[i];
    sumB += b[i];
  }
  const meanA = sumA / n;
  const meanB = sumB / n;
  let num = 0;
  let denomA = 0;
  let denomB = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    num += da * db;
    denomA += da * da;
    denomB += db * db;
  }
  const denom = Math.sqrt(denomA * denomB);
  if (denom === 0) return null;
  return num / denom;
}

/**
 * Build the Correlation section from /api/asset-momentum responses.
 * Returns null if fewer than 2 assets have enough overlapping price
 * history to compute a meaningful matrix.
 */
export function assembleCorrelationSection(
  wire: MomentumWire
): ReportCorrelationSection | null {
  const usable = wire.results.filter(
    (p) => !p.error && p.priceHistory.length >= 3
  );
  if (usable.length < 2) return null;

  const returnsBySym = new Map<string, number[]>();
  for (const p of usable) {
    returnsBySym.set(`${p.symbol}::${p.contractAddress}`, pricesToLogReturns(p.priceHistory));
  }
  const rows = usable.map((p) => ({
    key: `${p.symbol}::${p.contractAddress}`,
    symbol: p.symbol,
  }));
  const matrix: number[][] = rows.map((r) =>
    rows.map((c) => {
      if (r.key === c.key) return 1.0;
      const a = returnsBySym.get(r.key) ?? [];
      const b = returnsBySym.get(c.key) ?? [];
      const rho = pearson(a, b);
      return rho ?? 0; // fall back to 0 for the matrix display when undefined
    })
  );

  // Average off-diagonal — single-number summary used by the PDF verdict.
  let sum = 0;
  let count = 0;
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const v = matrix[i][j];
      if (Number.isFinite(v)) {
        sum += v;
        count++;
      }
    }
  }
  const averagePairwise = count > 0 ? sum / count : 0;

  return {
    symbols: rows.map((r) => r.symbol),
    matrix,
    averagePairwise,
  };
}

// =========================================================================
// Top-level assembler
// =========================================================================

/**
 * Bundle all four sections into a `ReportData`. Any input may be null,
 * in which case the corresponding section is null and the PDF skips it.
 */
export function assembleReport(args: {
  meta: ReportMeta;
  aave: ReportAaveSection | null;
  monteCarlo: ReportMonteCarloSection | null;
  composition: ReportCompositionSection | null;
  correlation: ReportCorrelationSection | null;
}): ReportData {
  return {
    meta: args.meta,
    aave: args.aave,
    monteCarlo: args.monteCarlo,
    composition: args.composition,
    correlation: args.correlation,
  };
}
