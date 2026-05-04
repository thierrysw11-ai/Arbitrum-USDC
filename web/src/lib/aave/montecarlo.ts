/**
 * Monte Carlo simulation for Aave V3 health-factor risk.
 *
 * For each non-stable collateral asset, sample N future price paths via
 * geometric Brownian motion, compute the resulting health factor at each
 * day, and aggregate into:
 *   - terminal HF distribution (histogram + percentiles)
 *   - probability of liquidation (HF < 1.0 at any point during horizon)
 *   - sample paths for plotting (subset)
 *
 * Inputs (positions + prices) come from `getServerPortfolio`, so this is a
 * pure function of an existing `Portfolio` snapshot. No on-chain reads.
 */

import type { PositionRow, UserAccountData } from './types';

// Default annualized volatilities for common Aave V3 reserves.
// Sources: realized 90-day vol from major data providers, rounded.
// Anything not in the table falls back to DEFAULT_VOL_UNKNOWN.
const VOLATILITIES: Record<string, number> = {
  WETH: 0.75,
  ETH: 0.75,
  WBTC: 0.7,
  cbBTC: 0.7,
  ARB: 1.2,
  OP: 1.2,
  LINK: 1.0,
  AAVE: 1.05,
  GMX: 1.4,
  rETH: 0.78, // mostly tracks ETH
  wstETH: 0.78,
  cbETH: 0.78,
  weETH: 0.78,
};
const DEFAULT_VOL_UNKNOWN = 1.0;

const STABLES = new Set([
  'USDC',
  'USDC.e',
  'USDCn',
  'USDT',
  'DAI',
  'FRAX',
  'GHO',
  'LUSD',
  'sUSDe',
]);

function isStable(symbol: string): boolean {
  return STABLES.has(symbol.toUpperCase()) || STABLES.has(symbol);
}

function volFor(symbol: string): number {
  return VOLATILITIES[symbol.toUpperCase()] ?? VOLATILITIES[symbol] ?? DEFAULT_VOL_UNKNOWN;
}

/**
 * Box-Muller transform — sample one standard normal from two uniforms.
 * `Math.random()` is fine for risk-modeling Monte Carlo at this scale; a
 * cryptographic RNG would just be slower without changing the output
 * distribution meaningfully.
 */
function sampleNormal(): number {
  let u1 = Math.random();
  while (u1 === 0) u1 = Math.random(); // log(0) safety
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

export interface MonteCarloInput {
  positions: PositionRow[];
  account: UserAccountData;
  /** Number of simulated paths. 1000 is plenty for percentile stability. */
  paths?: number;
  /** Horizon in days. */
  horizonDays?: number;
  /** Number of paths to keep daily-resolution data for (visualization). */
  samplePaths?: number;
}

export interface MonteCarloResult {
  config: {
    paths: number;
    horizonDays: number;
    volatilities: Record<string, number>;
    nonStableAssets: string[];
  };
  /** P(min HF over horizon < 1.0) — i.e. liquidation occurred at any time. */
  pLiquidation: number;
  /** Quantiles of the *terminal* HF (day = horizonDays). */
  percentiles: {
    p5: number;
    p25: number;
    p50: number;
    p75: number;
    p95: number;
  };
  expectedTerminalHf: number;
  worstTerminalHf: number;
  bestTerminalHf: number;
  /** Histogram of terminal HF for visualization. */
  histogram: {
    bins: number[]; // bin upper edges
    counts: number[];
  };
  /** Sample of full daily HF paths for the line chart. */
  samplePaths: Array<{
    pathId: number;
    daily: Array<{ day: number; hf: number }>;
    minHf: number;
    terminalHf: number;
    liquidated: boolean;
  }>;
  /**
   * Risk-adjusted return metrics, all annualized.
   *   - returnMean: expected annualized return on net worth (collateral - debt)
   *   - returnVolatility: annualized stddev of returns
   *   - sharpeRatio: (returnMean - rf) / returnVolatility, with rf = 4%/yr default
   *
   * Computed across all simulated paths. Includes per-asset supply yield and
   * borrow cost as well as the GBM price moves, so a 100%-stable position
   * with no debt shows a small positive return + ~zero vol (just supply yield).
   */
  riskAdjusted: {
    initialNetWorthUsd: number;
    annualizedReturnMean: number;
    annualizedReturnVolatility: number;
    sharpeRatio: number;
    riskFreeRateAnnual: number;
  };
}

/** Convert ray (1e27 scaled APR) to plain APR float. */
function rayToApr(ray: bigint): number {
  return Number(ray) / 1e27;
}

interface SnapshotMetrics {
  hf: number;
  collateralUsd: number;
  debtUsd: number;
  netWorthUsd: number;
}

/**
 * Compute HF + collateral + debt + net worth for a snapshot of positions
 * after applying:
 *   - priceMultiplier per symbol (price shock)
 *   - balanceMultiplier per symbol (yield accrual over t days, separate
 *     factors for supply vs debt sides)
 *
 * Stables have priceMultiplier = 1.0 always; balance multipliers apply
 * regardless of stability since yield accrues on all positions.
 *
 * HF = sum(collateral_i * price_i * liqThreshold_i) / sum(debt_i * price_i)
 * Returns hf = Infinity when debt is zero (matches Aave).
 */
function snapshotMetrics(
  positions: PositionRow[],
  priceMultiplierBySymbol: Map<string, number>,
  supplyBalanceMultiplierBySymbol: Map<string, number>,
  debtBalanceMultiplierBySymbol: Map<string, number>
): SnapshotMetrics {
  let collateralWeighted = 0;
  let collateralUsd = 0;
  let debtUsd = 0;
  for (const p of positions) {
    const priceMult = priceMultiplierBySymbol.get(p.symbol) ?? 1.0;
    const priceUsd = (Number(p.priceBase) / 1e8) * priceMult;
    if (p.aTokenBalance > 0n) {
      const supplyMult = supplyBalanceMultiplierBySymbol.get(p.symbol) ?? 1.0;
      const supplied =
        (Number(p.aTokenBalance) / 10 ** p.decimals) * supplyMult;
      const valueUsd = supplied * priceUsd;
      collateralUsd += valueUsd;
      if (p.usageAsCollateralEnabled) {
        const lt = Number(p.liquidationThreshold) / 10000;
        collateralWeighted += valueUsd * lt;
      }
    }
    if (p.variableDebtBalance > 0n) {
      const debtMult = debtBalanceMultiplierBySymbol.get(p.symbol) ?? 1.0;
      const borrowed =
        (Number(p.variableDebtBalance) / 10 ** p.decimals) * debtMult;
      debtUsd += borrowed * priceUsd;
    }
  }
  const hf = debtUsd <= 0 ? Infinity : collateralWeighted / debtUsd;
  return { hf, collateralUsd, debtUsd, netWorthUsd: collateralUsd - debtUsd };
}

/** Backward-compat wrapper for the simpler price-only HF calc. */
function hfWithMultipliers(
  positions: PositionRow[],
  priceMultiplierBySymbol: Map<string, number>
): number {
  const noYield = new Map<string, number>();
  return snapshotMetrics(
    positions,
    priceMultiplierBySymbol,
    noYield,
    noYield
  ).hf;
}

/**
 * Run the simulation. CPU-bound, runs in milliseconds for 1000 paths × 30
 * days on a few-asset position. No async needed; caller wraps in a route
 * handler.
 */
export function runMonteCarlo(input: MonteCarloInput): MonteCarloResult {
  const paths = input.paths ?? 1000;
  const horizonDays = input.horizonDays ?? 30;
  const samplePaths = Math.min(input.samplePaths ?? 50, paths);
  const dt = 1 / 365; // one day in years

  // Identify non-stable, collateral-bearing assets to shock.
  const nonStableAssets = Array.from(
    new Set(
      input.positions
        .filter(
          (p) =>
            (p.aTokenBalance > 0n || p.variableDebtBalance > 0n) &&
            !isStable(p.symbol)
        )
        .map((p) => p.symbol)
    )
  );

  const vols: Record<string, number> = {};
  for (const sym of nonStableAssets) vols[sym] = volFor(sym);

  // Yield accrual factors over the full horizon. Compounded daily —
  // (1 + APR×dt)^N — but we collapse to (1 + APR×T) for clarity since
  // for 30-day horizons the difference is negligible.
  const horizonYears = horizonDays / 365;
  const supplyAccrualBySymbol = new Map<string, number>();
  const debtAccrualBySymbol = new Map<string, number>();
  for (const p of input.positions) {
    if (!supplyAccrualBySymbol.has(p.symbol) && p.aTokenBalance > 0n) {
      const apr = rayToApr(p.liquidityRate);
      supplyAccrualBySymbol.set(p.symbol, 1 + apr * horizonYears);
    }
    if (!debtAccrualBySymbol.has(p.symbol) && p.variableDebtBalance > 0n) {
      const apr = rayToApr(p.variableBorrowRate);
      debtAccrualBySymbol.set(p.symbol, 1 + apr * horizonYears);
    }
  }

  // Initial net worth — the baseline for return calculations. Uses no
  // shocks and no yield (T=0 snapshot).
  const noMult = new Map<string, number>();
  const initial = snapshotMetrics(input.positions, noMult, noMult, noMult);
  const initialNetWorthUsd = initial.netWorthUsd;

  // Pre-compute per-day stochastic increment factors per asset.
  // Using a single scalar shock per asset across the wallet is the
  // standard simplification — in reality assets are correlated, but we
  // don't have a covariance matrix and a 1-factor shock is honest about
  // the uncertainty rather than overstating diversification.
  const terminalHfs: number[] = new Array(paths);
  const minHfs: number[] = new Array(paths);
  const terminalReturns: number[] = new Array(paths); // % change in NW vs initial
  const samples: MonteCarloResult['samplePaths'] = [];

  for (let i = 0; i < paths; i++) {
    // Multiplier per asset that we'll evolve day-by-day.
    const multipliers = new Map<string, number>();
    for (const sym of nonStableAssets) multipliers.set(sym, 1.0);

    let pathMinHf = Infinity;
    const dailyCapture: Array<{ day: number; hf: number }> = [];
    if (i < samplePaths) dailyCapture.push({ day: 0, hf: hfWithMultipliers(input.positions, multipliers) });

    for (let d = 1; d <= horizonDays; d++) {
      // Apply daily GBM step to each non-stable asset.
      for (const sym of nonStableAssets) {
        const sigma = vols[sym];
        const z = sampleNormal();
        const stepReturn = -0.5 * sigma * sigma * dt + sigma * Math.sqrt(dt) * z;
        const m = multipliers.get(sym)!;
        multipliers.set(sym, m * Math.exp(stepReturn));
      }
      const hf = hfWithMultipliers(input.positions, multipliers);
      if (hf < pathMinHf) pathMinHf = hf;
      if (i < samplePaths) dailyCapture.push({ day: d, hf });
    }

    // Terminal snapshot WITH yield accrual for return calculation.
    const terminal = snapshotMetrics(
      input.positions,
      multipliers,
      supplyAccrualBySymbol,
      debtAccrualBySymbol
    );
    terminalHfs[i] = terminal.hf;
    minHfs[i] = pathMinHf;
    terminalReturns[i] =
      initialNetWorthUsd > 0
        ? (terminal.netWorthUsd - initialNetWorthUsd) / initialNetWorthUsd
        : 0;

    if (i < samplePaths) {
      samples.push({
        pathId: i,
        daily: dailyCapture,
        minHf: pathMinHf,
        terminalHf: terminal.hf,
        liquidated: pathMinHf < 1.0,
      });
    }
  }

  // ─── Stats ──────────────────────────────────────────────────────────
  const finiteTerminals = terminalHfs.filter((x) => Number.isFinite(x));
  const sorted = [...finiteTerminals].sort((a, b) => a - b);
  const pct = (p: number): number => {
    if (sorted.length === 0) return Infinity;
    const idx = Math.min(
      sorted.length - 1,
      Math.max(0, Math.floor((p / 100) * sorted.length))
    );
    return sorted[idx];
  };
  const liquidatedCount = minHfs.filter((x) => x < 1.0).length;
  const pLiquidation = paths > 0 ? liquidatedCount / paths : 0;
  const expectedTerminal =
    finiteTerminals.length > 0
      ? finiteTerminals.reduce((a, b) => a + b, 0) / finiteTerminals.length
      : Infinity;

  // ─── Histogram ──────────────────────────────────────────────────────
  // Bin edges chosen to surface risk: tight bins below 1.5, looser above.
  const binEdges = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0, 4.0, 5.0];
  const counts = new Array(binEdges.length).fill(0);
  for (const hf of finiteTerminals) {
    let placed = false;
    for (let i = 0; i < binEdges.length; i++) {
      if (hf <= binEdges[i]) {
        counts[i]++;
        placed = true;
        break;
      }
    }
    if (!placed) counts[counts.length - 1]++;
  }

  // ─── Risk-adjusted return (annualized Sharpe) ───────────────────────
  // Annualize from horizon-period returns. Standard square-root-of-time
  // scaling for vol; linear for mean.
  const RISK_FREE_RATE_ANNUAL = 0.04; // 4%/yr — roughly USDC supply on Aave
  const horizonsPerYear = 365 / horizonDays;
  const meanHorizonReturn =
    terminalReturns.length > 0
      ? terminalReturns.reduce((a, b) => a + b, 0) / terminalReturns.length
      : 0;
  const variance =
    terminalReturns.length > 0
      ? terminalReturns.reduce(
          (acc, r) => acc + (r - meanHorizonReturn) ** 2,
          0
        ) / terminalReturns.length
      : 0;
  const horizonStd = Math.sqrt(variance);
  const annualizedReturn = meanHorizonReturn * horizonsPerYear;
  const annualizedVol = horizonStd * Math.sqrt(horizonsPerYear);
  // Sharpe is undefined for zero-vol portfolios; surface NaN→0 so JSON
  // doesn't choke and the consumer can render a clear "—".
  const sharpeRatio =
    annualizedVol > 1e-9
      ? (annualizedReturn - RISK_FREE_RATE_ANNUAL) / annualizedVol
      : 0;

  return {
    config: {
      paths,
      horizonDays,
      volatilities: vols,
      nonStableAssets,
    },
    pLiquidation,
    percentiles: {
      p5: pct(5),
      p25: pct(25),
      p50: pct(50),
      p75: pct(75),
      p95: pct(95),
    },
    expectedTerminalHf: expectedTerminal,
    worstTerminalHf: sorted[0] ?? Infinity,
    bestTerminalHf: sorted[sorted.length - 1] ?? Infinity,
    histogram: {
      bins: binEdges,
      counts,
    },
    samplePaths: samples,
    riskAdjusted: {
      initialNetWorthUsd,
      annualizedReturnMean: annualizedReturn,
      annualizedReturnVolatility: annualizedVol,
      sharpeRatio,
      riskFreeRateAnnual: RISK_FREE_RATE_ANNUAL,
    },
  };
}

// =========================================================================
// Efficient frontier — sweep leverage, plot risk vs return per scenario
// =========================================================================

export interface FrontierPoint {
  /** Multiplier applied to current debt. 0 = no debt, 1 = current, >1 = more leverage. */
  leverageScale: number;
  /** Resulting debt USD value at this scale (relative to initial collateral). */
  scaledDebtUsd: number;
  annualizedReturn: number;
  annualizedVolatility: number;
  sharpeRatio: number;
  pLiquidation: number;
  expectedTerminalHf: number;
  /** Initial HF at this leverage — useful to flag scales that start under-water. */
  initialHf: number;
  /** True for the user's current position. */
  isCurrent: boolean;
}

export interface EfficientFrontierResult {
  points: FrontierPoint[];
  riskFreeRateAnnual: number;
  /** Index in `points` of the user's current position. */
  currentIndex: number;
  /** Index of the maximum-Sharpe portfolio among feasible points (P(liq) < 5%). */
  optimalIndex: number;
}

/**
 * Run a smaller Monte Carlo at each of several leverage scales, then map
 * the (volatility, return) plane. Lets the user see whether their current
 * leverage is optimal, under-leveraged (giving up return), or over-leveraged
 * (paying volatility for diminishing return).
 *
 * Implementation: scale every position's `variableDebtBalance` by the scale,
 * leave collateral unchanged. Scale = 0 → no debt → pure-collateral portfolio.
 * Scale > 1 = more debt than the user currently has.
 *
 * Each point uses fewer paths than the headline simulation (default 250)
 * to keep the sweep fast — 7 points × 250 paths = ~1750 sims.
 */
export function runEfficientFrontier(input: {
  positions: PositionRow[];
  account: UserAccountData;
  paths?: number;
  horizonDays?: number;
  scales?: number[];
}): EfficientFrontierResult {
  const paths = input.paths ?? 250;
  const horizonDays = input.horizonDays ?? 30;
  const scales = input.scales ?? [0, 0.25, 0.5, 0.75, 1.0, 1.25, 1.5];

  const scalePositions = (scale: number): PositionRow[] =>
    input.positions.map((p) => ({
      ...p,
      variableDebtBalance:
        scale === 1
          ? p.variableDebtBalance
          : BigInt(Math.round(Number(p.variableDebtBalance) * scale)),
    }));

  const points: FrontierPoint[] = scales.map((scale) => {
    const scaled = scalePositions(scale);
    const scaledTotalDebtBase = BigInt(
      Math.round(Number(input.account.totalDebtBase) * scale)
    );
    const sim = runMonteCarlo({
      positions: scaled,
      account: { ...input.account, totalDebtBase: scaledTotalDebtBase },
      paths,
      horizonDays,
      samplePaths: 0, // no per-path capture needed for frontier sweep
    });
    const noMult = new Map<string, number>();
    const initial = snapshotMetrics(scaled, noMult, noMult, noMult);
    return {
      leverageScale: scale,
      scaledDebtUsd: initial.debtUsd,
      annualizedReturn: sim.riskAdjusted.annualizedReturnMean,
      annualizedVolatility: sim.riskAdjusted.annualizedReturnVolatility,
      sharpeRatio: sim.riskAdjusted.sharpeRatio,
      pLiquidation: sim.pLiquidation,
      expectedTerminalHf: sim.expectedTerminalHf,
      initialHf: initial.hf,
      isCurrent: scale === 1.0,
    };
  });

  const currentIndex = points.findIndex((p) => p.isCurrent);
  // Optimal = max Sharpe among "feasible" points (P(liq) < 5% — anything
  // above that isn't really an "investable" portfolio for a sane user).
  const feasible = points
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p.pLiquidation < 0.05 && p.initialHf > 1.0);
  const optimalEntry = feasible.length
    ? feasible.reduce((best, x) =>
        x.p.sharpeRatio > best.p.sharpeRatio ? x : best
      )
    : { p: points[currentIndex], i: currentIndex };

  return {
    points,
    riskFreeRateAnnual: 0.04,
    currentIndex,
    optimalIndex: optimalEntry.i,
  };
}
