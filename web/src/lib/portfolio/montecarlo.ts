/**
 * Portfolio Monte Carlo simulation — drawdown / value-at-risk for any
 * wallet (Aave position not required).
 *
 * Where the Aave-mode simulation tracks Health Factor for a leveraged
 * position, this one tracks total portfolio USD value over time. The
 * question changes from "P(liquidation)" to "P(loss >= X%) over 30 days."
 *
 * Key engineering difference from the Aave engine: this one uses
 * **correlated** GBM moves via Cholesky decomposition of the realized
 * correlation matrix. That captures the fact that ETH and BTC move
 * together — if you treated each independently, you'd over-estimate
 * diversification benefit and under-estimate tail risk.
 *
 * Pure function: takes holdings + price histories, returns the result.
 * No fetches, no state. Easy to test, easy to call from any route.
 */

// =========================================================================
// Inputs
// =========================================================================

export interface PortfolioHolding {
  symbol: string;
  usdValue: number;
  /** Identifier for matching to price history (lowercase contract address). */
  key: string;
}

export interface PriceHistoryPoint {
  timestamp: number;
  price: number;
}

export interface PortfolioMonteCarloInput {
  holdings: PortfolioHolding[];
  /** Price history per asset, keyed by `holdings[i].key`. */
  priceHistoryByKey: Record<string, PriceHistoryPoint[]>;
  paths?: number;
  horizonDays?: number;
  samplePaths?: number;
  /** Default per-symbol vol when no history is available. */
  fallbackVolBySymbol?: Record<string, number>;
  /** Annual risk-free rate, used for Sharpe. Default 4%. */
  riskFreeRateAnnual?: number;
  /**
   * Optional benchmark for beta / Jensen's alpha / Treynor / information
   * ratio. Crypto convention is to use BTC as the market benchmark.
   * Pass the same shape of price history as the asset feeds. If absent,
   * benchmark-relative metrics are returned as null.
   */
  benchmarkSymbol?: string;
  benchmarkPriceHistory?: PriceHistoryPoint[];
}

// =========================================================================
// Output
// =========================================================================

export interface PortfolioMonteCarloResult {
  config: {
    paths: number;
    horizonDays: number;
    /** Symbols that contributed to the simulation. */
    assetsAnalyzed: string[];
    /** Symbols dropped because we had no price history AND no fallback vol. */
    assetsSkipped: string[];
    /** USD value of holdings actually included in the simulation. */
    totalUsdAnalyzed: number;
    /** USD value of holdings dropped (e.g. unpriced or no-vol tokens). */
    totalUsdSkipped: number;
  };
  initialPortfolioUsd: number;

  /** Quantiles of TERMINAL portfolio USD value at day = horizonDays. */
  percentiles: {
    p5: number;
    p25: number;
    p50: number;
    p75: number;
    p95: number;
  };
  expectedTerminalUsd: number;
  worstTerminalUsd: number;
  bestTerminalUsd: number;

  /** Probability the portfolio loses at least X% by horizon. */
  pLossGte: {
    p10: number;
    p20: number;
    p30: number;
    p50: number;
  };

  /** 95% Value-at-Risk as a positive % loss (5% chance of losing this much). */
  var95Pct: number;
  /** Expected Shortfall — average loss in the worst 5% of paths. */
  cvar95Pct: number;

  /** Max drawdown experienced during simulation (peak-to-trough), median + 95th. */
  maxDrawdown: { p50Pct: number; p95Pct: number };

  /** Histogram of terminal portfolio value (USD), for the bar chart. */
  histogram: {
    bins: number[]; // upper edges, USD
    counts: number[];
  };

  /** Sample paths — array of daily portfolio values for the line chart. */
  samplePaths: Array<{
    pathId: number;
    daily: number[]; // length = horizonDays + 1
    terminal: number;
    breachedDrawdown: boolean; // hit drawdown >= 30% at any point
  }>;

  /** Realized volatilities per asset (annualized) — for transparency. */
  computedVolatilities: Record<string, number>;
  /** Realized pairwise correlations (used for the GBM coupling). */
  correlationSymbols: string[];
  correlationMatrix: number[][];

  /** Risk-adjusted return — mirrors Aave engine for parity in the PDF. */
  riskAdjusted: {
    initialNetWorthUsd: number;
    annualizedReturnMean: number;
    annualizedReturnVolatility: number;
    sharpeRatio: number;
    riskFreeRateAnnual: number;
  };

  /**
   * Wealth-manager-grade quant metrics. Centralizes everything a TradFi
   * client would expect on a portfolio review:
   *   - Distribution moments (variance, stddev, skewness, excess kurtosis)
   *   - Downside metrics (downside deviation, Sortino)
   *   - Tail risk at two confidence levels (95% + 99%)
   *   - Benchmark-relative metrics (Beta, Jensen's Alpha, Treynor, Info Ratio)
   *
   * All annualized unless noted. Benchmark block is null when no
   * benchmark price history was supplied.
   */
  quant: {
    /** Sample mean of annualized portfolio returns from the simulation. */
    meanReturnAnnual: number;
    /** Variance of annualized portfolio returns (= stddev²). */
    varianceAnnual: number;
    /** Stddev = annualized return volatility. */
    stddevAnnual: number;
    /** 3rd standardized moment of simulated annualized returns. */
    skewness: number;
    /** Excess kurtosis (subtract 3) — heavy tails => positive. */
    excessKurtosis: number;
    /** Annualized downside deviation (only neg returns vs target). */
    downsideDeviationAnnual: number;
    /** Sortino: (mean - rf) / downside deviation. Both annualized. */
    sortinoRatio: number;
    /** 95% Value-at-Risk (positive % loss). */
    var95Pct: number;
    /** 99% Value-at-Risk (positive % loss). Tail-extreme. */
    var99Pct: number;
    /** Conditional VaR / expected shortfall (95). */
    cvar95Pct: number;
    /** Conditional VaR / expected shortfall (99). */
    cvar99Pct: number;
    /** Realized portfolio mean (annualized) from historical daily returns. */
    realizedMeanAnnual: number;
    /** Realized portfolio stddev (annualized) from historical daily returns. */
    realizedStddevAnnual: number;
    /** Benchmark-relative metrics. Null when no benchmark provided. */
    benchmark: {
      symbol: string;
      /** Portfolio's beta against the benchmark. */
      beta: number;
      /** Jensen's alpha (annualized). Excess return after accounting for beta. */
      jensenAlphaAnnual: number;
      /** Treynor: (R_p - R_f) / β, annualized. */
      treynorRatio: number;
      /** Information Ratio: (R_p - R_b) / TE, annualized. */
      informationRatio: number;
      /** Daily-return correlation between portfolio and benchmark. */
      correlation: number;
      /** R²: how much of portfolio variance is explained by benchmark. */
      rSquared: number;
    } | null;
  };

  /** Plain-English interpretation. */
  interpretation: {
    level: 'safe' | 'caution' | 'risky' | 'critical';
    headline: string;
    details: string[];
    recommendation: string;
  };
}

// =========================================================================
// Defaults
// =========================================================================

const DEFAULT_VOL_UNKNOWN = 0.9;

/** Reasonable per-symbol fallbacks when no price history is supplied. */
const DEFAULT_VOL_BY_SYMBOL: Record<string, number> = {
  WETH: 0.75,
  ETH: 0.75,
  WBTC: 0.7,
  cbBTC: 0.7,
  ARB: 1.2,
  OP: 1.2,
  POL: 1.2,
  MATIC: 1.2,
  LINK: 1.0,
  AAVE: 1.05,
  GMX: 1.4,
  rETH: 0.78,
  wstETH: 0.78,
  cbETH: 0.78,
  weETH: 0.78,
  // Stables — near-zero realized vol; we still simulate them with a small
  // residual for de-peg risk.
  USDC: 0.02,
  'USDC.E': 0.02,
  USDCN: 0.02,
  USDT: 0.03,
  DAI: 0.02,
  FRAX: 0.04,
  GHO: 0.04,
  LUSD: 0.04,
  sUSDe: 0.05,
};

const STABLE_SYMBOLS = new Set([
  'USDC',
  'USDC.E',
  'USDCN',
  'USDT',
  'DAI',
  'FRAX',
  'GHO',
  'LUSD',
  'sUSDe',
  'PYUSD',
  'crvUSD',
]);

function defaultVolFor(symbol: string): number {
  const k = symbol.toUpperCase();
  return DEFAULT_VOL_BY_SYMBOL[k] ?? DEFAULT_VOL_BY_SYMBOL[symbol] ?? DEFAULT_VOL_UNKNOWN;
}

// =========================================================================
// RNG — Box-Muller standard normal
// =========================================================================

function sampleNormal(): number {
  let u1 = Math.random();
  while (u1 === 0) u1 = Math.random();
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

// =========================================================================
// Statistics helpers
// =========================================================================

function logReturns(prices: PriceHistoryPoint[]): number[] {
  if (prices.length < 2) return [];
  const out: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    const a = prices[i - 1].price;
    const b = prices[i].price;
    if (a > 0 && b > 0) out.push(Math.log(b / a));
  }
  return out;
}

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

function stddev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  let s = 0;
  for (const x of xs) {
    const d = x - m;
    s += d * d;
  }
  return Math.sqrt(s / (xs.length - 1));
}

function percentile(sortedXs: number[], p: number): number {
  if (sortedXs.length === 0) return 0;
  const idx = Math.min(
    sortedXs.length - 1,
    Math.max(0, Math.floor(p * sortedXs.length))
  );
  return sortedXs[idx];
}

function pearson(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  const ma = mean(a.slice(0, n));
  const mb = mean(b.slice(0, n));
  let num = 0;
  let da2 = 0;
  let db2 = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - ma;
    const db = b[i] - mb;
    num += da * db;
    da2 += da * da;
    db2 += db * db;
  }
  const denom = Math.sqrt(da2 * db2);
  return denom === 0 ? 0 : num / denom;
}

/** Sample skewness — third standardized moment, bias-corrected for sample size. */
function skewness(xs: number[]): number {
  const n = xs.length;
  if (n < 3) return 0;
  const m = mean(xs);
  let m2 = 0;
  let m3 = 0;
  for (const x of xs) {
    const d = x - m;
    const d2 = d * d;
    m2 += d2;
    m3 += d2 * d;
  }
  m2 /= n;
  m3 /= n;
  const sd = Math.sqrt(m2);
  if (sd === 0) return 0;
  // bias correction (Fisher-Pearson)
  const g1 = m3 / (sd * sd * sd);
  return (Math.sqrt(n * (n - 1)) / (n - 2)) * g1;
}

/** Sample excess kurtosis — fourth standardized moment minus 3. */
function excessKurtosis(xs: number[]): number {
  const n = xs.length;
  if (n < 4) return 0;
  const m = mean(xs);
  let m2 = 0;
  let m4 = 0;
  for (const x of xs) {
    const d = x - m;
    const d2 = d * d;
    m2 += d2;
    m4 += d2 * d2;
  }
  m2 /= n;
  m4 /= n;
  if (m2 === 0) return 0;
  // bias-corrected sample excess kurtosis
  return ((n + 1) * n) / ((n - 1) * (n - 2) * (n - 3)) *
    ((n * m4) / (m2 * m2)) -
    (3 * (n - 1) * (n - 1)) / ((n - 2) * (n - 3));
}

/** Annualized downside deviation — only counts returns below `target`. */
function downsideDeviation(dailyReturns: number[], targetDaily: number): number {
  if (dailyReturns.length === 0) return 0;
  let sumSq = 0;
  for (const r of dailyReturns) {
    const dev = Math.min(0, r - targetDaily);
    sumSq += dev * dev;
  }
  const dailyDD = Math.sqrt(sumSq / dailyReturns.length);
  return dailyDD * Math.sqrt(365);
}

/** Cov(a, b) using sample (n-1) denominator. */
function covariance(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  const ma = mean(a.slice(0, n));
  const mb = mean(b.slice(0, n));
  let s = 0;
  for (let i = 0; i < n; i++) s += (a[i] - ma) * (b[i] - mb);
  return s / (n - 1);
}

function variance(xs: number[]): number {
  const sd = stddev(xs);
  return sd * sd;
}

// =========================================================================
// Cholesky decomposition with jitter fallback
// =========================================================================

/**
 * Compute the lower-triangular Cholesky factor L such that L*L^T = A.
 * Throws if A is not positive definite.
 */
function cholesky(A: number[][]): number[][] {
  const n = A.length;
  const L: number[][] = Array.from({ length: n }, () =>
    new Array(n).fill(0)
  );
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = 0;
      for (let k = 0; k < j; k++) sum += L[i][k] * L[j][k];
      if (i === j) {
        const diag = A[i][i] - sum;
        if (diag <= 0) throw new Error('not-positive-definite');
        L[i][j] = Math.sqrt(diag);
      } else {
        L[i][j] = (A[i][j] - sum) / L[j][j];
      }
    }
  }
  return L;
}

/**
 * Cholesky with jitter — adds tiny diagonal increments until decomposition
 * succeeds. Realized correlation matrices from short return windows are
 * frequently slightly indefinite due to numerical noise; this is the
 * standard fix.
 */
function safeCholesky(corr: number[][]): number[][] {
  let jitter = 0;
  for (let attempt = 0; attempt < 8; attempt++) {
    const A = corr.map((row, i) =>
      row.map((v, j) => (i === j ? v + jitter : v))
    );
    try {
      return cholesky(A);
    } catch {
      jitter = jitter === 0 ? 1e-8 : jitter * 10;
    }
  }
  // Fallback: identity. Means the simulation will treat assets as independent —
  // worse risk model but safer than crashing.
  const n = corr.length;
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))
  );
}

// =========================================================================
// Main engine
// =========================================================================

export function runPortfolioMonteCarlo(
  input: PortfolioMonteCarloInput
): PortfolioMonteCarloResult {
  const paths = input.paths ?? 1000;
  const horizonDays = input.horizonDays ?? 30;
  const samplePathsCount = Math.min(input.samplePaths ?? 50, paths);
  const riskFreeRate = input.riskFreeRateAnnual ?? 0.04;

  // -------------------------------------------------------------------------
  // 1. Filter holdings to those we can simulate.
  //
  // Need either a price history (preferred — gives realized vol) or a
  // fallback vol. Drop the rest into `assetsSkipped`.
  // -------------------------------------------------------------------------

  const fallbackVolMap = {
    ...DEFAULT_VOL_BY_SYMBOL,
    ...(input.fallbackVolBySymbol ?? {}),
  };

  const usable: Array<{
    holding: PortfolioHolding;
    history: PriceHistoryPoint[];
    logReturns: number[];
    vol: number;
  }> = [];
  const skipped: string[] = [];
  let skippedUsd = 0;

  for (const h of input.holdings) {
    if (h.usdValue <= 0) continue;
    const hist = input.priceHistoryByKey[h.key] ?? [];
    const lr = logReturns(hist);

    // Prefer realized vol when we have enough history.
    let vol: number | null = null;
    if (lr.length >= 5) {
      // Annualize from daily log-return stddev.
      vol = stddev(lr) * Math.sqrt(365);
      // Sanity floor — extremely flat windows can produce ~0 vol that's
      // not predictive of future risk.
      if (!Number.isFinite(vol) || vol < 0.001) vol = null;
    }
    if (vol === null) {
      const fallback = fallbackVolMap[h.symbol.toUpperCase()] ?? fallbackVolMap[h.symbol];
      vol = fallback ?? defaultVolFor(h.symbol);
    }
    if (vol === null || !Number.isFinite(vol)) {
      skipped.push(h.symbol);
      skippedUsd += h.usdValue;
      continue;
    }
    usable.push({ holding: h, history: hist, logReturns: lr, vol });
  }

  const initialPortfolioUsd = usable.reduce(
    (acc, u) => acc + u.holding.usdValue,
    0
  );
  // If everything was skipped, return a degenerate result so callers don't crash.
  if (usable.length === 0 || initialPortfolioUsd === 0) {
    return makeEmptyResult({
      paths,
      horizonDays,
      assetsSkipped: skipped,
      skippedUsd,
      riskFreeRate,
    });
  }

  const n = usable.length;
  const symbols = usable.map((u) => u.holding.symbol);
  const computedVolatilities: Record<string, number> = {};
  for (const u of usable) computedVolatilities[u.holding.symbol] = u.vol;

  // -------------------------------------------------------------------------
  // 2. Build correlation matrix from log returns.
  //
  // For assets without sufficient history, fall back to 0 cross-correlation
  // (treat as independent — conservative for diversification benefit).
  // -------------------------------------------------------------------------

  const corr: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    corr[i][i] = 1;
    for (let j = i + 1; j < n; j++) {
      const a = usable[i].logReturns;
      const b = usable[j].logReturns;
      if (a.length >= 3 && b.length >= 3) {
        const r = pearson(a, b);
        corr[i][j] = corr[j][i] = Number.isFinite(r) ? r : 0;
      }
    }
  }

  const L = safeCholesky(corr);

  // -------------------------------------------------------------------------
  // 3. Run paths. For each path:
  //      - each day, sample independent z[i], multiply by L → correlated z
  //      - apply GBM update per asset
  //      - track portfolio USD value daily
  //      - record terminal value, max drawdown, optional sample for chart
  // -------------------------------------------------------------------------

  const dt = 1 / 365;
  const sqrtDt = Math.sqrt(dt);
  // Drift: assume zero risk-neutral drift (no edge baked in). Users
  // who want a market-implied drift can layer it on later.
  const drift = new Array(n).fill(0);
  const sigmas = usable.map((u) => u.vol);
  const usdShares = usable.map((u) => u.holding.usdValue / initialPortfolioUsd);

  const terminalUsds: number[] = [];
  const maxDrawdownsPct: number[] = [];
  const samplePathOutputs: PortfolioMonteCarloResult['samplePaths'] = [];

  // Pre-compute log-return mean per step for Sharpe later
  const annualReturns: number[] = [];

  for (let p = 0; p < paths; p++) {
    // State: log-prices relative to start (start at 0). Portfolio value
    // recovered as initialUsd * Σ share_i * exp(logPrice_i).
    const logPrices = new Array(n).fill(0);
    let peak = initialPortfolioUsd;
    let maxDd = 0;
    let breached30 = false;
    const dailyValues: number[] | null =
      p < samplePathsCount ? new Array(horizonDays + 1) : null;
    if (dailyValues) dailyValues[0] = initialPortfolioUsd;

    for (let day = 1; day <= horizonDays; day++) {
      // Independent N(0,1) shocks
      const z = new Array(n);
      for (let i = 0; i < n; i++) z[i] = sampleNormal();
      // Correlate via L: zCorr = L * z
      const zCorr = new Array(n).fill(0);
      for (let i = 0; i < n; i++) {
        let s = 0;
        for (let k = 0; k <= i; k++) s += L[i][k] * z[k];
        zCorr[i] = s;
      }
      // Update each asset
      for (let i = 0; i < n; i++) {
        const sigma = sigmas[i];
        const driftI = drift[i];
        // Standard GBM log-step
        logPrices[i] += (driftI - 0.5 * sigma * sigma) * dt + sigma * sqrtDt * zCorr[i];
      }
      // Portfolio value today
      let v = 0;
      for (let i = 0; i < n; i++) {
        v += initialPortfolioUsd * usdShares[i] * Math.exp(logPrices[i]);
      }
      if (v > peak) peak = v;
      const dd = (peak - v) / peak;
      if (dd > maxDd) maxDd = dd;
      if (dd >= 0.30) breached30 = true;
      if (dailyValues) dailyValues[day] = v;
    }

    // Final value
    let terminal = 0;
    for (let i = 0; i < n; i++) {
      terminal += initialPortfolioUsd * usdShares[i] * Math.exp(logPrices[i]);
    }
    terminalUsds.push(terminal);
    maxDrawdownsPct.push(maxDd * 100);
    // Annualized log-return for Sharpe
    const r = Math.log(terminal / initialPortfolioUsd) * (365 / horizonDays);
    annualReturns.push(r);

    if (dailyValues) {
      samplePathOutputs.push({
        pathId: p,
        daily: dailyValues,
        terminal,
        breachedDrawdown: breached30,
      });
    }
  }

  // -------------------------------------------------------------------------
  // 4. Aggregate stats
  // -------------------------------------------------------------------------

  const sortedTerm = [...terminalUsds].sort((a, b) => a - b);
  const sortedDd = [...maxDrawdownsPct].sort((a, b) => a - b);

  const expectedTerminalUsd = mean(terminalUsds);
  const worstTerminalUsd = sortedTerm[0];
  const bestTerminalUsd = sortedTerm[sortedTerm.length - 1];

  // P(loss >= X%) — count paths where terminal < (1-X) * initial
  const fracLossGte = (frac: number): number => {
    const cutoff = initialPortfolioUsd * (1 - frac);
    let count = 0;
    for (const t of terminalUsds) if (t <= cutoff) count++;
    return count / terminalUsds.length;
  };
  const pLossGte = {
    p10: fracLossGte(0.1),
    p20: fracLossGte(0.2),
    p30: fracLossGte(0.3),
    p50: fracLossGte(0.5),
  };

  // VaR95 / CVaR95: 5th percentile loss + average loss in the worst 5%.
  const p5Term = percentile(sortedTerm, 0.05);
  const var95Pct = ((initialPortfolioUsd - p5Term) / initialPortfolioUsd) * 100;
  const worst5 = sortedTerm.slice(0, Math.max(1, Math.floor(0.05 * sortedTerm.length)));
  const cvar95Pct = ((initialPortfolioUsd - mean(worst5)) / initialPortfolioUsd) * 100;

  // VaR99 / CVaR99 — extreme tail. Counts the worst 1% of paths.
  const p1Term = percentile(sortedTerm, 0.01);
  const var99Pct = ((initialPortfolioUsd - p1Term) / initialPortfolioUsd) * 100;
  const worst1 = sortedTerm.slice(0, Math.max(1, Math.floor(0.01 * sortedTerm.length)));
  const cvar99Pct = ((initialPortfolioUsd - mean(worst1)) / initialPortfolioUsd) * 100;

  // Histogram bins from min to max terminal value, 24 buckets
  const histogram = buildHistogram(terminalUsds, 24);

  // Risk-adjusted return — annualized log-return mean / vol over paths
  const annReturnMean = mean(annualReturns);
  const annReturnVol = stddev(annualReturns);
  const sharpe =
    annReturnVol === 0 ? 0 : (annReturnMean - riskFreeRate) / annReturnVol;

  // -------------------------------------------------------------------------
  // 5. Quant block
  //
  // Higher-moment statistics (skewness, kurtosis) come from the simulated
  // distribution. Realized portfolio metrics (mean / stddev / Sortino) and
  // benchmark-relative metrics (Beta, Jensen's Alpha, Treynor, Info Ratio)
  // are computed from the historical return series — that's the standard
  // TradFi convention and matches what brokerage statements report.
  // -------------------------------------------------------------------------

  // Realized daily portfolio returns (USD-weighted across held assets).
  // Align by index from the END of each asset's history so the most-recent
  // bars overlap even when histories have different start dates.
  const minLen = Math.min(...usable.map((u) => u.history.length));
  const realizedDailyReturns: number[] = [];
  if (minLen >= 2) {
    const realizedDailyValue: number[] = new Array(minLen).fill(0);
    for (let t = 0; t < minLen; t++) {
      for (const u of usable) {
        const off = u.history.length - minLen;
        const Pt = u.history[t + off]?.price;
        const P0 = u.history[off]?.price;
        if (Pt && P0 && P0 > 0) {
          realizedDailyValue[t] +=
            (u.holding.usdValue / initialPortfolioUsd) * (Pt / P0);
        }
      }
    }
    for (let t = 1; t < minLen; t++) {
      const a = realizedDailyValue[t - 1];
      const b = realizedDailyValue[t];
      if (a > 0 && b > 0) realizedDailyReturns.push(Math.log(b / a));
    }
  }
  const realizedMeanAnnual = mean(realizedDailyReturns) * 365;
  const realizedStddevAnnual = stddev(realizedDailyReturns) * Math.sqrt(365);

  // Sortino: downside-only deviation from the daily risk-free rate as target.
  const rfDaily = riskFreeRate / 365;
  const downsideDevAnnual = downsideDeviation(realizedDailyReturns, rfDaily);
  const sortino =
    downsideDevAnnual === 0
      ? 0
      : (realizedMeanAnnual - riskFreeRate) / downsideDevAnnual;

  // Distribution moments from the simulation.
  const skew = skewness(annualReturns);
  const kurt = excessKurtosis(annualReturns);

  // Benchmark-relative metrics (Beta, Jensen's Alpha, Treynor, Info Ratio).
  // Computed from REALIZED portfolio + benchmark daily returns, aligned
  // by index from the end of each series.
  let benchmarkBlock: PortfolioMonteCarloResult['quant']['benchmark'] = null;
  if (
    input.benchmarkPriceHistory &&
    input.benchmarkPriceHistory.length >= 3 &&
    realizedDailyReturns.length >= 3
  ) {
    const bLogReturns = logReturns(input.benchmarkPriceHistory);
    const align = Math.min(bLogReturns.length, realizedDailyReturns.length);
    if (align >= 3) {
      const p = realizedDailyReturns.slice(-align);
      const b = bLogReturns.slice(-align);
      const varB = variance(b);
      const beta = varB === 0 ? 0 : covariance(p, b) / varB;
      const meanPAnn = mean(p) * 365;
      const meanBAnn = mean(b) * 365;
      // Jensen's alpha = Rp - [Rf + β(Rm - Rf)], all annualized.
      const jensenAlphaAnnual = meanPAnn - (riskFreeRate + beta * (meanBAnn - riskFreeRate));
      // Treynor = (Rp - Rf) / β
      const treynorRatio = beta === 0 ? 0 : (meanPAnn - riskFreeRate) / beta;
      // Information ratio = (Rp - Rb) / tracking-error, annualized
      const diff: number[] = new Array(align);
      for (let i = 0; i < align; i++) diff[i] = p[i] - b[i];
      const trackingErrorAnn = stddev(diff) * Math.sqrt(365);
      const informationRatio = trackingErrorAnn === 0 ? 0 : (meanPAnn - meanBAnn) / trackingErrorAnn;
      const correlation = pearson(p, b);
      benchmarkBlock = {
        symbol: input.benchmarkSymbol ?? 'BTC',
        beta,
        jensenAlphaAnnual,
        treynorRatio,
        informationRatio,
        correlation,
        rSquared: correlation * correlation,
      };
    }
  }

  const quant: PortfolioMonteCarloResult['quant'] = {
    meanReturnAnnual: annReturnMean,
    varianceAnnual: annReturnVol * annReturnVol,
    stddevAnnual: annReturnVol,
    skewness: skew,
    excessKurtosis: kurt,
    downsideDeviationAnnual: downsideDevAnnual,
    sortinoRatio: sortino,
    var95Pct,
    var99Pct,
    cvar95Pct,
    cvar99Pct,
    realizedMeanAnnual,
    realizedStddevAnnual,
    benchmark: benchmarkBlock,
  };

  // Interpretation
  const interp = interpret({
    pLoss20: pLossGte.p20,
    pLoss30: pLossGte.p30,
    var95Pct,
    cvar95Pct,
    medianMaxDd: percentile(sortedDd, 0.5),
    horizonDays,
    n,
  });

  return {
    config: {
      paths,
      horizonDays,
      assetsAnalyzed: symbols,
      assetsSkipped: skipped,
      totalUsdAnalyzed: initialPortfolioUsd,
      totalUsdSkipped: skippedUsd,
    },
    initialPortfolioUsd,
    percentiles: {
      p5: percentile(sortedTerm, 0.05),
      p25: percentile(sortedTerm, 0.25),
      p50: percentile(sortedTerm, 0.5),
      p75: percentile(sortedTerm, 0.75),
      p95: percentile(sortedTerm, 0.95),
    },
    expectedTerminalUsd,
    worstTerminalUsd,
    bestTerminalUsd,
    pLossGte,
    var95Pct,
    cvar95Pct,
    maxDrawdown: {
      p50Pct: percentile(sortedDd, 0.5),
      p95Pct: percentile(sortedDd, 0.95),
    },
    histogram,
    samplePaths: samplePathOutputs,
    computedVolatilities,
    correlationSymbols: symbols,
    correlationMatrix: corr,
    riskAdjusted: {
      initialNetWorthUsd: initialPortfolioUsd,
      annualizedReturnMean: annReturnMean,
      annualizedReturnVolatility: annReturnVol,
      sharpeRatio: sharpe,
      riskFreeRateAnnual: riskFreeRate,
    },
    interpretation: interp,
    quant,
  };
}

// =========================================================================
// Histogram + interpretation helpers
// =========================================================================

function buildHistogram(
  values: number[],
  bucketCount: number
): { bins: number[]; counts: number[] } {
  if (values.length === 0) return { bins: [], counts: [] };
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  if (lo === hi) return { bins: [hi], counts: [values.length] };
  const step = (hi - lo) / bucketCount;
  const bins: number[] = [];
  const counts: number[] = new Array(bucketCount).fill(0);
  for (let b = 0; b < bucketCount; b++) bins.push(lo + step * (b + 1));
  for (const v of values) {
    let bIdx = Math.floor((v - lo) / step);
    if (bIdx >= bucketCount) bIdx = bucketCount - 1;
    if (bIdx < 0) bIdx = 0;
    counts[bIdx]++;
  }
  return { bins, counts };
}

function interpret(args: {
  pLoss20: number;
  pLoss30: number;
  var95Pct: number;
  cvar95Pct: number;
  medianMaxDd: number;
  horizonDays: number;
  n: number;
}): PortfolioMonteCarloResult['interpretation'] {
  const { pLoss20, pLoss30, var95Pct, cvar95Pct, medianMaxDd, horizonDays, n } = args;
  const pctFmt = (p: number) => `${(p * 100).toFixed(2)}%`;

  // Risk classification — uses both VaR and the probability of a 30%
  // drawdown. A 30% drawdown is a real, market-relevant pain threshold.
  let level: PortfolioMonteCarloResult['interpretation']['level'];
  if (var95Pct < 5 && pLoss30 < 0.005) level = 'safe';
  else if (var95Pct < 15 && pLoss30 < 0.05) level = 'caution';
  else if (var95Pct < 30 && pLoss30 < 0.20) level = 'risky';
  else level = 'critical';

  const headlineByLevel: Record<typeof level, string> = {
    safe: `Conservatively positioned. Limited downside over the next ${horizonDays} days.`,
    caution: `Moderate market risk over ${horizonDays} days — keep an eye on concentration.`,
    risky: `Elevated drawdown risk — meaningful chance of a painful pullback.`,
    critical: `High-conviction risk profile — large losses are well within range.`,
  };

  const details: string[] = [
    `5th-percentile outcome: portfolio loses ${var95Pct.toFixed(1)}% (Value-at-Risk, 95% confidence). Conditional expected loss in the worst 5%: ${cvar95Pct.toFixed(1)}%.`,
    `Probability of dropping ≥20% in ${horizonDays} days: ${pctFmt(pLoss20)}. Probability of ≥30% drawdown at any point: ${pctFmt(pLoss30)}.`,
    `Median peak-to-trough drawdown across simulated paths: ${medianMaxDd.toFixed(1)}%.`,
    n < 3
      ? `Note: only ${n} asset analyzed — diversification benefit cannot be measured at this scale.`
      : `Simulation incorporates pairwise asset correlation across ${n} holdings — assets that move together amplify portfolio variance, captured here.`,
  ];

  let recommendation: string;
  if (level === 'safe') {
    recommendation =
      'No defensive action needed. The current allocation is well-suited to ride out normal market volatility. Consider whether you have room to take more risk if your goals call for it.';
  } else if (level === 'caution') {
    recommendation =
      'Worth reviewing concentration. If a single token represents a large share of the portfolio, partial trimming into stables or lower-correlation assets would meaningfully reduce tail risk.';
  } else if (level === 'risky') {
    recommendation =
      'Consider trimming the highest-volatility positions or rebalancing into lower-correlation assets. A 30% drawdown takes ~43% gain to recover from — preventing it is cheaper than recovering from it.';
  } else {
    recommendation =
      'Strongly consider reducing exposure to the most volatile holdings. Adding stablecoin allocation or lower-vol assets (BTC, blue-chip ETH derivatives) would improve risk-adjusted return materially.';
  }
  return { level, headline: headlineByLevel[level], details, recommendation };
}

function makeEmptyResult(args: {
  paths: number;
  horizonDays: number;
  assetsSkipped: string[];
  skippedUsd: number;
  riskFreeRate: number;
}): PortfolioMonteCarloResult {
  return {
    config: {
      paths: args.paths,
      horizonDays: args.horizonDays,
      assetsAnalyzed: [],
      assetsSkipped: args.assetsSkipped,
      totalUsdAnalyzed: 0,
      totalUsdSkipped: args.skippedUsd,
    },
    initialPortfolioUsd: 0,
    percentiles: { p5: 0, p25: 0, p50: 0, p75: 0, p95: 0 },
    expectedTerminalUsd: 0,
    worstTerminalUsd: 0,
    bestTerminalUsd: 0,
    pLossGte: { p10: 0, p20: 0, p30: 0, p50: 0 },
    var95Pct: 0,
    cvar95Pct: 0,
    maxDrawdown: { p50Pct: 0, p95Pct: 0 },
    histogram: { bins: [], counts: [] },
    samplePaths: [],
    computedVolatilities: {},
    correlationSymbols: [],
    correlationMatrix: [],
    riskAdjusted: {
      initialNetWorthUsd: 0,
      annualizedReturnMean: 0,
      annualizedReturnVolatility: 0,
      sharpeRatio: 0,
      riskFreeRateAnnual: args.riskFreeRate,
    },
    interpretation: {
      level: 'safe',
      headline: 'No analyzable holdings.',
      details: [
        'Portfolio either has no priced tokens or all tokens were skipped due to missing volatility data.',
      ],
      recommendation:
        'Add liquid, priced holdings (ETH, BTC, USDC, etc.) for a meaningful drawdown analysis.',
    },
    quant: {
      meanReturnAnnual: 0,
      varianceAnnual: 0,
      stddevAnnual: 0,
      skewness: 0,
      excessKurtosis: 0,
      downsideDeviationAnnual: 0,
      sortinoRatio: 0,
      var95Pct: 0,
      var99Pct: 0,
      cvar95Pct: 0,
      cvar99Pct: 0,
      realizedMeanAnnual: 0,
      realizedStddevAnnual: 0,
      benchmark: null,
    },
  };
}

export const STABLE_SYMBOLS_SET = STABLE_SYMBOLS;
