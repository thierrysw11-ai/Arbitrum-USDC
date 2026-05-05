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
  applyPriceShock,
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
  ReportFrontierPoint,
  ReportMeta,
  ReportMonteCarloSection,
  ReportNarrativeSection,
  ReportPortfolioMcSection,
  ReportSamplePath,
  ReportShockResult,
  ReportWalletChain,
  ReportWalletSection,
} from './types';

// =========================================================================
// Aave V3 section
// =========================================================================

/**
 * Convert a `usePortfolio()` snapshot into the report's Aave section.
 * Returns null when the wallet has no live position (collateral and debt
 * both zero) — the PDF will skip the page.
 *
 * Includes a 3-scenario shock waterfall (-10/-30/-50% on all non-stable
 * assets) so the PDF can render the same stress-test bars the live UI
 * shows in the Risk Profile tab.
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

  // Three standard market-wide shocks. Mirror the simulate_price_shock tool
  // and the live UI's "stress waterfall".
  const shocks: ReportShockResult[] = [-10, -30, -50].map((pctChange) => {
    const out = applyPriceShock(positions, {
      assetSymbol: 'ALL_NON_STABLE',
      pctChange,
    });
    return {
      pctChange,
      hf: wadToFloat(out.shockedHealthFactor),
      collateralUsd: baseToUsd(out.shockedCollateralBase),
      debtUsd: baseToUsd(out.shockedDebtBase),
      liquidatable: out.liquidatable,
    };
  });

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
    shocks,
  };
}

// =========================================================================
// Monte Carlo section
// =========================================================================

// Wire shape from /api/agent/monte-carlo (mirror of MonteCarloResponse in
// MonteCarloPanel — duplicated narrowly to keep this file independent).
type MaybeInf = number | 'INFINITY';

interface MonteCarloFrontierPointWire {
  leverageScale: number;
  scaledDebtUsd: number;
  annualizedReturn: number;
  annualizedVolatility: number;
  sharpeRatio: number;
  pLiquidation: number;
  expectedTerminalHf: MaybeInf;
  initialHf: MaybeInf;
  isCurrent: boolean;
}

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
    histogram: { bins: number[]; counts: number[] };
    samplePaths: Array<{
      pathId: number;
      daily: Array<{ day: number; hf: number }>;
      terminalHf: number;
      liquidated: boolean;
    }>;
    riskAdjusted: {
      sharpeRatio: number;
      annualizedReturnMean: number;
      annualizedReturnVolatility: number;
      riskFreeRateAnnual: number;
    };
  };
  efficientFrontier: {
    points: MonteCarloFrontierPointWire[];
    riskFreeRateAnnual: number;
    currentIndex: number;
    optimalIndex: number;
  };
  meta: { currentHealthFactor: number };
}

function unwrap(v: MaybeInf): number {
  return v === 'INFINITY' ? Number.POSITIVE_INFINITY : v;
}

/**
 * Convert the wire response from /api/agent/monte-carlo into the
 * report section. Re-runs the same plain-English `interpret()` used in
 * the live panel so the PDF text matches what the user just saw, and
 * carries through the histogram, sample paths, and frontier points so
 * the PDF can render the same charts.
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

  // Compact sample paths into pure number arrays — much smaller than the
  // wire shape, sufficient for the PDF sparkline.
  const samplePaths: ReportSamplePath[] = sim.samplePaths.map((p) => {
    // Dense day-indexed array. Cap HF at 5 so a single very-healthy path
    // doesn't squash the visual scale.
    const daily: number[] = new Array(sim.config.horizonDays + 1);
    for (const point of p.daily) {
      daily[point.day] = Number.isFinite(point.hf) ? Math.min(point.hf, 5) : 5;
    }
    // Forward-fill any holes so the line is continuous.
    let last = daily[0] ?? 0;
    for (let i = 0; i <= sim.config.horizonDays; i++) {
      if (typeof daily[i] === 'number') last = daily[i];
      else daily[i] = last;
    }
    return { daily, liquidated: p.liquidated };
  });

  // Efficient frontier points + verdict. Same logic as the live panel.
  const points: ReportFrontierPoint[] = wire.efficientFrontier.points.map((p, i) => {
    const initialHf = unwrap(p.initialHf);
    const feasible = p.pLiquidation < 0.05 && Number.isFinite(initialHf) && initialHf > 1.0;
    return {
      leverageScale: p.leverageScale,
      annualizedReturn: p.annualizedReturn,
      annualizedVolatility: p.annualizedVolatility,
      sharpeRatio: p.sharpeRatio,
      pLiquidation: p.pLiquidation,
      initialHf,
      isCurrent: p.isCurrent,
      isOptimal: i === wire.efficientFrontier.optimalIndex,
      feasible,
    };
  });
  const current = points[wire.efficientFrontier.currentIndex];
  const optimal = points[wire.efficientFrontier.optimalIndex];
  const sameLeverage = wire.efficientFrontier.currentIndex === wire.efficientFrontier.optimalIndex;
  const verdict = sameLeverage
    ? 'Your current leverage is already on the efficient frontier — well-tuned for risk-adjusted return.'
    : optimal && current
      ? `Switching to ${optimal.leverageScale.toFixed(2)}× of your current debt would improve Sharpe from ${current.sharpeRatio.toFixed(2)} to ${optimal.sharpeRatio.toFixed(2)}, while keeping P(liq) ${optimal.pLiquidation < 0.01 ? 'below 1%' : `at ${(optimal.pLiquidation * 100).toFixed(1)}%`}.`
      : 'Frontier sweep complete.';

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
    histogram: sim.histogram,
    samplePaths,
    efficientFrontier: { points, verdict },
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
        `Median outcome: HF lands near ${fmtHf(p50)}. Top 5% of paths: HF >= ${fmtHf(p95)}.`,
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
        `Median outcome: HF ${fmtHf(p50)}. Best 5%: HF >= ${fmtHf(p95)}.`,
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
// Portfolio-mode Monte Carlo section
// =========================================================================

// Mirror of the wire shape from /api/agent/portfolio-monte-carlo —
// duplicated narrowly so this module doesn't import the engine type
// (engine lives under lib/portfolio, this file is generic).
interface PortfolioMcWire {
  simulation: {
    config: {
      paths: number;
      horizonDays: number;
      assetsAnalyzed: string[];
      assetsSkipped: string[];
      totalUsdSkipped: number;
    };
    initialPortfolioUsd: number;
    percentiles: {
      p5: number;
      p25: number;
      p50: number;
      p75: number;
      p95: number;
    };
    expectedTerminalUsd: number;
    pLossGte: { p10: number; p20: number; p30: number; p50: number };
    var95Pct: number;
    cvar95Pct: number;
    maxDrawdown: { p50Pct: number; p95Pct: number };
    histogram: { bins: number[]; counts: number[] };
    samplePaths: Array<{
      pathId: number;
      daily: number[];
      terminal: number;
      breachedDrawdown: boolean;
    }>;
    riskAdjusted: {
      sharpeRatio: number;
      annualizedReturnMean: number;
      annualizedReturnVolatility: number;
      riskFreeRateAnnual: number;
    };
    interpretation: ReportPortfolioMcSection['interpretation'];
    quant: ReportPortfolioMcSection['quant'];
  };
}

export function assemblePortfolioMcSection(
  wire: PortfolioMcWire
): ReportPortfolioMcSection {
  const sim = wire.simulation;
  return {
    paths: sim.config.paths,
    horizonDays: sim.config.horizonDays,
    initialPortfolioUsd: sim.initialPortfolioUsd,
    percentiles: { ...sim.percentiles },
    expectedTerminalUsd: sim.expectedTerminalUsd,
    pLossGte: { ...sim.pLossGte },
    var95Pct: sim.var95Pct,
    cvar95Pct: sim.cvar95Pct,
    maxDrawdown: { ...sim.maxDrawdown },
    histogram: sim.histogram,
    samplePaths: sim.samplePaths.map((p) => ({
      daily: p.daily,
      breachedDrawdown: p.breachedDrawdown,
    })),
    riskAdjusted: { ...sim.riskAdjusted },
    interpretation: sim.interpretation,
    assetsAnalyzed: sim.config.assetsAnalyzed,
    assetsSkipped: sim.config.assetsSkipped,
    totalUsdSkipped: sim.config.totalUsdSkipped,
    quant: sim.quant,
  };
}

// =========================================================================
// Composition + Wallet sections — both fed by /api/wallet-holdings
// =========================================================================

interface WalletErc20Wire {
  contract: string;
  symbol: string;
  name: string | null;
  balanceFormatted?: number;
  priceUsd: number | null;
  usdValue: number | null;
  isSpam: boolean;
}

interface WalletChainWire {
  chainSlug: string;
  chainName: string;
  nativeBalance: {
    symbol: string;
    balanceFormatted: number;
    usdValue: number | null;
  };
  erc20: WalletErc20Wire[];
  legitimateUsd: number;
  spamUsd: number;
  totalUsd?: number;
  error?: string;
}

interface WalletHoldingsWire {
  chains: WalletChainWire[];
  legitimateUsd: number;
  spamUsd: number;
  totalUsd: number;
  error?: string;
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

/**
 * Build the per-chain Wallet Holdings section from a wallet-holdings wire
 * response. Reproduces the WalletHoldingsPanel data: native balance + ERC-20
 * list per chain, with spam flagged. Returns null if every chain errored
 * or the wallet is empty.
 */
export function assembleWalletSection(
  wire: WalletHoldingsWire
): ReportWalletSection | null {
  const chains: ReportWalletChain[] = wire.chains.map((c) => {
    const chainTotal =
      typeof c.totalUsd === 'number'
        ? c.totalUsd
        : c.legitimateUsd + c.spamUsd;
    const erc20Sorted = [...c.erc20].sort((a, b) => {
      const av = a.usdValue ?? 0;
      const bv = b.usdValue ?? 0;
      return bv - av;
    });
    return {
      chainSlug: c.chainSlug,
      chainName: c.chainName,
      totalUsd: chainTotal,
      legitimateUsd: c.legitimateUsd,
      spamUsd: c.spamUsd,
      native: {
        symbol: c.nativeBalance.symbol,
        balance: c.nativeBalance.balanceFormatted,
        usdValue: c.nativeBalance.usdValue,
      },
      erc20: erc20Sorted.map((t) => ({
        symbol: t.symbol,
        name: t.name,
        balance: typeof t.balanceFormatted === 'number' ? t.balanceFormatted : null,
        usdValue: t.usdValue,
        isSpam: t.isSpam,
      })),
      error: c.error,
    };
  });
  // Drop chains that errored AND have no useful data.
  const useful = chains.filter(
    (c) => !c.error || c.totalUsd > 0 || c.erc20.length > 0
  );
  if (useful.length === 0) return null;
  return {
    chains: useful,
    legitimateUsd: wire.legitimateUsd,
    spamUsd: wire.spamUsd,
    totalUsd: wire.totalUsd,
  };
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
// Narrative section — wraps an already-fetched AI prose string
// =========================================================================

export function assembleNarrativeSection(
  text: string | null
): ReportNarrativeSection | null {
  if (!text) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  return { text: trimmed };
}

// =========================================================================
// Top-level assembler
// =========================================================================

/**
 * Bundle every section into a `ReportData`. Any input may be null, in
 * which case the corresponding section is null and the PDF skips it.
 */
export function assembleReport(args: {
  meta: ReportMeta;
  aave: ReportAaveSection | null;
  monteCarlo: ReportMonteCarloSection | null;
  portfolioMc: ReportPortfolioMcSection | null;
  composition: ReportCompositionSection | null;
  correlation: ReportCorrelationSection | null;
  wallet: ReportWalletSection | null;
  narrative: ReportNarrativeSection | null;
}): ReportData {
  return {
    meta: args.meta,
    aave: args.aave,
    monteCarlo: args.monteCarlo,
    portfolioMc: args.portfolioMc,
    composition: args.composition,
    correlation: args.correlation,
    wallet: args.wallet,
    narrative: args.narrative,
  };
}
