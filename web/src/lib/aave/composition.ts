/**
 * Portfolio composition analysis — DeFi analogue of the supersector /
 * sector / market-cap breakdown shown in TradFi wealth-management reports.
 *
 * Inputs: a list of token holdings (symbol + USD value).
 * Outputs:
 *   - Sector allocation (supersector -> sector -> %)
 *   - Market-cap buckets (large / mid / small / micro / unknown)
 *   - Concentration metrics (top-3 share, HHI, effective N)
 *   - Ranked top holdings with sector tag
 *
 * All pure functions — no fetches, no side effects. Caller is responsible
 * for collecting holdings (typically from /api/wallet-holdings + Aave
 * positions).
 *
 * Token taxonomy: a hand-curated registry covering the ~50 most common
 * tokens a DeFi user is likely to hold. Anything not in the registry is
 * classified as "Other / Unclassified", market-cap "unknown" — honest
 * about what we know vs what we don't, just like the £50bn report's
 * "Unknown 20.4%" row.
 */

export type Supersector =
  | 'Stablecoins'
  | 'Smart Contract Platforms'
  | 'Bitcoin'
  | 'Liquid Staking'
  | 'Liquid Restaking'
  | 'DeFi'
  | 'Infrastructure'
  | 'Memecoins'
  | 'Governance'
  | 'Aave Receipt Tokens'
  | 'Other';

export type MarketCapBucket = 'large' | 'mid' | 'small' | 'micro' | 'unknown';

export interface TokenClassification {
  supersector: Supersector;
  sector: string;
  marketCapBucket: MarketCapBucket;
}

// ─── Token registry ────────────────────────────────────────────────────
// Symbol-keyed (uppercased on lookup). Not exhaustive — covers the high-
// frequency tokens. Long-tail tokens fall into "Other / Unclassified" via
// the default branch in classifyToken().

const TOKEN_REGISTRY: Record<string, TokenClassification> = {
  // Stablecoins
  USDC: { supersector: 'Stablecoins', sector: 'USD-Pegged (Centralized)', marketCapBucket: 'large' },
  'USDC.E': { supersector: 'Stablecoins', sector: 'USD-Pegged (Bridged)', marketCapBucket: 'large' },
  USDT: { supersector: 'Stablecoins', sector: 'USD-Pegged (Centralized)', marketCapBucket: 'large' },
  DAI: { supersector: 'Stablecoins', sector: 'USD-Pegged (Decentralized)', marketCapBucket: 'large' },
  FRAX: { supersector: 'Stablecoins', sector: 'USD-Pegged (Decentralized)', marketCapBucket: 'mid' },
  GHO: { supersector: 'Stablecoins', sector: 'USD-Pegged (Decentralized)', marketCapBucket: 'small' },
  LUSD: { supersector: 'Stablecoins', sector: 'USD-Pegged (Decentralized)', marketCapBucket: 'small' },
  SUSDE: { supersector: 'Stablecoins', sector: 'USD-Pegged (Yield-bearing)', marketCapBucket: 'mid' },
  USDE: { supersector: 'Stablecoins', sector: 'USD-Pegged (Synthetic)', marketCapBucket: 'mid' },
  PYUSD: { supersector: 'Stablecoins', sector: 'USD-Pegged (Centralized)', marketCapBucket: 'small' },
  TUSD: { supersector: 'Stablecoins', sector: 'USD-Pegged (Centralized)', marketCapBucket: 'small' },
  FDUSD: { supersector: 'Stablecoins', sector: 'USD-Pegged (Centralized)', marketCapBucket: 'small' },

  // Smart Contract Platforms — L1
  ETH: { supersector: 'Smart Contract Platforms', sector: 'L1 Native', marketCapBucket: 'large' },
  WETH: { supersector: 'Smart Contract Platforms', sector: 'L1 Native (Wrapped)', marketCapBucket: 'large' },
  BNB: { supersector: 'Smart Contract Platforms', sector: 'L1 Native', marketCapBucket: 'large' },
  SOL: { supersector: 'Smart Contract Platforms', sector: 'L1 Native', marketCapBucket: 'large' },
  AVAX: { supersector: 'Smart Contract Platforms', sector: 'L1 Native', marketCapBucket: 'mid' },
  ATOM: { supersector: 'Smart Contract Platforms', sector: 'L1 Native', marketCapBucket: 'mid' },

  // Smart Contract Platforms — L2
  ARB: { supersector: 'Smart Contract Platforms', sector: 'L2 Native', marketCapBucket: 'mid' },
  OP: { supersector: 'Smart Contract Platforms', sector: 'L2 Native', marketCapBucket: 'mid' },
  MATIC: { supersector: 'Smart Contract Platforms', sector: 'L2 Native', marketCapBucket: 'mid' },
  POL: { supersector: 'Smart Contract Platforms', sector: 'L2 Native', marketCapBucket: 'mid' },
  MNT: { supersector: 'Smart Contract Platforms', sector: 'L2 Native', marketCapBucket: 'mid' },

  // Bitcoin
  WBTC: { supersector: 'Bitcoin', sector: 'Wrapped BTC', marketCapBucket: 'large' },
  CBBTC: { supersector: 'Bitcoin', sector: 'Wrapped BTC', marketCapBucket: 'large' },
  TBTC: { supersector: 'Bitcoin', sector: 'Wrapped BTC', marketCapBucket: 'small' },

  // Liquid Staking (ETH)
  STETH: { supersector: 'Liquid Staking', sector: 'ETH LST', marketCapBucket: 'large' },
  WSTETH: { supersector: 'Liquid Staking', sector: 'ETH LST', marketCapBucket: 'large' },
  RETH: { supersector: 'Liquid Staking', sector: 'ETH LST', marketCapBucket: 'mid' },
  CBETH: { supersector: 'Liquid Staking', sector: 'ETH LST', marketCapBucket: 'mid' },
  SFRXETH: { supersector: 'Liquid Staking', sector: 'ETH LST', marketCapBucket: 'small' },
  ANKRETH: { supersector: 'Liquid Staking', sector: 'ETH LST', marketCapBucket: 'small' },
  STMATIC: { supersector: 'Liquid Staking', sector: 'MATIC LST', marketCapBucket: 'small' },

  // Liquid Restaking
  WEETH: { supersector: 'Liquid Restaking', sector: 'EigenLayer LRT', marketCapBucket: 'mid' },
  EZETH: { supersector: 'Liquid Restaking', sector: 'EigenLayer LRT', marketCapBucket: 'mid' },
  RSETH: { supersector: 'Liquid Restaking', sector: 'EigenLayer LRT', marketCapBucket: 'small' },
  PUFETH: { supersector: 'Liquid Restaking', sector: 'EigenLayer LRT', marketCapBucket: 'small' },

  // DeFi blue chips
  AAVE: { supersector: 'DeFi', sector: 'Lending', marketCapBucket: 'mid' },
  COMP: { supersector: 'DeFi', sector: 'Lending', marketCapBucket: 'mid' },
  MKR: { supersector: 'DeFi', sector: 'Lending / RWA', marketCapBucket: 'mid' },
  UNI: { supersector: 'DeFi', sector: 'DEX', marketCapBucket: 'large' },
  CRV: { supersector: 'DeFi', sector: 'DEX', marketCapBucket: 'mid' },
  BAL: { supersector: 'DeFi', sector: 'DEX', marketCapBucket: 'small' },
  CAKE: { supersector: 'DeFi', sector: 'DEX', marketCapBucket: 'small' },
  SUSHI: { supersector: 'DeFi', sector: 'DEX', marketCapBucket: 'small' },
  GMX: { supersector: 'DeFi', sector: 'Derivatives', marketCapBucket: 'small' },
  GNS: { supersector: 'DeFi', sector: 'Derivatives', marketCapBucket: 'small' },
  DYDX: { supersector: 'DeFi', sector: 'Derivatives', marketCapBucket: 'small' },
  CVX: { supersector: 'DeFi', sector: 'Yield Aggregator', marketCapBucket: 'small' },
  YFI: { supersector: 'DeFi', sector: 'Yield Aggregator', marketCapBucket: 'small' },
  FXS: { supersector: 'DeFi', sector: 'Yield Aggregator', marketCapBucket: 'small' },
  RDNT: { supersector: 'DeFi', sector: 'Lending', marketCapBucket: 'micro' },
  ONDO: { supersector: 'DeFi', sector: 'Real-World Assets', marketCapBucket: 'mid' },

  // Infrastructure
  LINK: { supersector: 'Infrastructure', sector: 'Oracle', marketCapBucket: 'large' },
  BAND: { supersector: 'Infrastructure', sector: 'Oracle', marketCapBucket: 'small' },
  PYTH: { supersector: 'Infrastructure', sector: 'Oracle', marketCapBucket: 'mid' },
  GRT: { supersector: 'Infrastructure', sector: 'Indexing', marketCapBucket: 'small' },

  // Governance
  ENS: { supersector: 'Governance', sector: 'Naming', marketCapBucket: 'small' },
  LDO: { supersector: 'Governance', sector: 'LST Governance', marketCapBucket: 'mid' },
  GTC: { supersector: 'Governance', sector: 'Public Goods', marketCapBucket: 'micro' },

  // Memecoins
  PEPE: { supersector: 'Memecoins', sector: 'Memecoin', marketCapBucket: 'mid' },
  SHIB: { supersector: 'Memecoins', sector: 'Memecoin', marketCapBucket: 'mid' },
  DOGE: { supersector: 'Memecoins', sector: 'Memecoin', marketCapBucket: 'large' },
  FLOKI: { supersector: 'Memecoins', sector: 'Memecoin', marketCapBucket: 'small' },
  WIF: { supersector: 'Memecoins', sector: 'Memecoin', marketCapBucket: 'small' },
  BONK: { supersector: 'Memecoins', sector: 'Memecoin', marketCapBucket: 'small' },
};

// Aave aTokens follow predictable patterns — match by prefix and re-classify
// to "Aave Receipt Tokens" supersector but preserve the underlying.
const A_TOKEN_PATTERNS: Array<{ regex: RegExp; underlyingExtractor: (s: string) => string }> = [
  // aArbUSDCn, aBaseUSDC, aOptUSDC, aPolUSDC, etc.
  { regex: /^a(Arb|Base|Opt|Pol|Eth)([A-Z0-9.]+?)(n|v3)?$/i, underlyingExtractor: (s) => s.replace(/^a(Arb|Base|Opt|Pol|Eth)/i, '').replace(/(n|v3)$/i, '') },
];

function isAaveReceiptToken(symbol: string): { isAToken: boolean; underlying?: string } {
  for (const { regex, underlyingExtractor } of A_TOKEN_PATTERNS) {
    if (regex.test(symbol)) {
      return { isAToken: true, underlying: underlyingExtractor(symbol).toUpperCase() };
    }
  }
  return { isAToken: false };
}

/**
 * Classify a token by symbol.
 *
 * @param symbol  — token symbol (case-insensitive)
 * @param opts.xray — if true, looks through wrapper tokens (aTokens, possibly
 *   LP tokens in future) to their underlying classification. Mirrors the
 *   TradFi "X-ray" convention where a fund is decomposed into its
 *   constituent equities for the purposes of asset-class analysis.
 *   Default: false (treat wrappers as their own supersector).
 */
export function classifyToken(
  symbol: string,
  opts: { xray?: boolean } = {}
): TokenClassification {
  const upper = symbol.toUpperCase();
  // Direct registry hit
  const direct = TOKEN_REGISTRY[upper];
  if (direct) return direct;

  // Aave receipt token? Either reclassify-with-underlying-tag (default) or
  // fully look through to the underlying (xray mode).
  const aave = isAaveReceiptToken(symbol);
  if (aave.isAToken && aave.underlying) {
    const underlyingCls = TOKEN_REGISTRY[aave.underlying];
    if (opts.xray && underlyingCls) {
      // X-ray: pretend the user holds the underlying directly. Treats
      // an aArbUSDCn position as USDC for asset-class analysis.
      return underlyingCls;
    }
    return {
      supersector: 'Aave Receipt Tokens',
      sector: underlyingCls
        ? `Aave ${underlyingCls.sector}`
        : `Aave (${aave.underlying})`,
      marketCapBucket: underlyingCls?.marketCapBucket ?? 'unknown',
    };
  }

  // Default — honest about not knowing
  return {
    supersector: 'Other',
    sector: 'Unclassified',
    marketCapBucket: 'unknown',
  };
}

// ─── Aggregation ──────────────────────────────────────────────────────

export interface HoldingInput {
  symbol: string;
  usdValue: number;
}

export interface SupersectorRow {
  supersector: Supersector;
  usd: number;
  pct: number;
  count: number; // how many distinct tokens
}

export interface SectorRow {
  supersector: Supersector;
  sector: string;
  usd: number;
  pct: number;
  count: number;
}

export interface MarketCapRow {
  bucket: MarketCapBucket;
  label: string;
  usd: number;
  pct: number;
  count: number;
}

export interface TopHoldingRow {
  symbol: string;
  usd: number;
  pct: number;
  supersector: Supersector;
  sector: string;
}

export interface ConcentrationStats {
  /** Sum of % held in the top 3 positions. 100% = entirely concentrated. */
  topThreePct: number;
  /** Herfindahl-Hirschman Index, 0-10000 scale (sum of squared % shares). */
  hhi: number;
  /** Effective number of equally-weighted assets = 1 / sum(weight^2). */
  effectiveN: number;
  /** Largest single holding. */
  largestHolding: { symbol: string; pct: number; usd: number };
  /** Plain-English diversification verdict. */
  verdict: 'highly diversified' | 'diversified' | 'moderate' | 'concentrated' | 'highly concentrated';
}

export interface CompositionAnalysis {
  totalUsd: number;
  bySupersector: SupersectorRow[];
  bySector: SectorRow[];
  byMarketCap: MarketCapRow[];
  topHoldings: TopHoldingRow[];
  concentration: ConcentrationStats | null;
}

const MARKET_CAP_LABELS: Record<MarketCapBucket, string> = {
  large: 'Large cap (>$10B)',
  mid: 'Mid cap ($1B–$10B)',
  small: 'Small cap ($100M–$1B)',
  micro: 'Micro cap (<$100M)',
  unknown: 'Unknown / Unclassified',
};

/**
 * Compute the full composition analysis from raw holdings.
 *
 * Holdings with usdValue <= 0 are dropped before aggregation — they don't
 * meaningfully contribute to "what does your portfolio look like".
 *
 * @param opts.xray — pass-through to classifyToken. When true, wrapper
 *   tokens (aTokens for now, LP/LRT in future) are decomposed to their
 *   underlying for asset-class analysis. Default false.
 */
export function analyzeComposition(
  holdings: HoldingInput[],
  opts: { xray?: boolean } = {}
): CompositionAnalysis {
  // Filter zero-value rows, then DEDUPE BY SYMBOL. Multi-chain wallets
  // hold the same asset on several chains (ETH on mainnet + arb + base
  // + optimism = four entries with the same symbol). For composition,
  // concentration, and top-holdings purposes those collapse into one
  // line — the user's "ETH" exposure is the sum, not four separate
  // positions. Sectors / market caps already aggregated correctly via
  // classification, but the per-symbol views and concentration math
  // need explicit deduping.
  const rawFiltered = holdings.filter((h) => h.usdValue > 0);
  const symbolMap = new Map<string, number>();
  for (const h of rawFiltered) {
    symbolMap.set(h.symbol, (symbolMap.get(h.symbol) ?? 0) + h.usdValue);
  }
  const filtered: HoldingInput[] = [...symbolMap.entries()].map(
    ([symbol, usdValue]) => ({ symbol, usdValue })
  );
  const totalUsd = filtered.reduce((acc, h) => acc + h.usdValue, 0);

  if (totalUsd === 0) {
    return {
      totalUsd: 0,
      bySupersector: [],
      bySector: [],
      byMarketCap: [],
      topHoldings: [],
      concentration: null,
    };
  }

  // Aggregate
  const supersectorMap = new Map<
    Supersector,
    { usd: number; symbols: Set<string> }
  >();
  const sectorMap = new Map<
    string,
    { supersector: Supersector; sector: string; usd: number; symbols: Set<string> }
  >();
  const mcMap = new Map<MarketCapBucket, { usd: number; symbols: Set<string> }>();

  for (const h of filtered) {
    const cls = classifyToken(h.symbol, opts);
    // Supersector
    const sRow = supersectorMap.get(cls.supersector) ?? {
      usd: 0,
      symbols: new Set(),
    };
    sRow.usd += h.usdValue;
    sRow.symbols.add(h.symbol);
    supersectorMap.set(cls.supersector, sRow);
    // Sector
    const secKey = `${cls.supersector}::${cls.sector}`;
    const secRow = sectorMap.get(secKey) ?? {
      supersector: cls.supersector,
      sector: cls.sector,
      usd: 0,
      symbols: new Set(),
    };
    secRow.usd += h.usdValue;
    secRow.symbols.add(h.symbol);
    sectorMap.set(secKey, secRow);
    // Market cap
    const mcRow = mcMap.get(cls.marketCapBucket) ?? {
      usd: 0,
      symbols: new Set(),
    };
    mcRow.usd += h.usdValue;
    mcRow.symbols.add(h.symbol);
    mcMap.set(cls.marketCapBucket, mcRow);
  }

  const bySupersector: SupersectorRow[] = [...supersectorMap.entries()]
    .map(([supersector, v]) => ({
      supersector,
      usd: v.usd,
      pct: (v.usd / totalUsd) * 100,
      count: v.symbols.size,
    }))
    .sort((a, b) => b.usd - a.usd);

  const bySector: SectorRow[] = [...sectorMap.values()]
    .map((v) => ({
      supersector: v.supersector,
      sector: v.sector,
      usd: v.usd,
      pct: (v.usd / totalUsd) * 100,
      count: v.symbols.size,
    }))
    .sort((a, b) => b.usd - a.usd);

  const MC_ORDER: MarketCapBucket[] = ['large', 'mid', 'small', 'micro', 'unknown'];
  const byMarketCap: MarketCapRow[] = MC_ORDER.map((bucket) => {
    const v = mcMap.get(bucket);
    return {
      bucket,
      label: MARKET_CAP_LABELS[bucket],
      usd: v?.usd ?? 0,
      pct: v ? (v.usd / totalUsd) * 100 : 0,
      count: v?.symbols.size ?? 0,
    };
  }).filter((r) => r.usd > 0 || r.bucket === 'unknown');

  const topHoldings: TopHoldingRow[] = filtered
    .map((h) => {
      const cls = classifyToken(h.symbol, opts);
      return {
        symbol: h.symbol,
        usd: h.usdValue,
        pct: (h.usdValue / totalUsd) * 100,
        supersector: cls.supersector,
        sector: cls.sector,
      };
    })
    .sort((a, b) => b.usd - a.usd)
    .slice(0, 12);

  // Concentration
  const sortedByValue = [...filtered]
    .map((h) => h.usdValue)
    .sort((a, b) => b - a);
  const topThreePct =
    sortedByValue.slice(0, 3).reduce((acc, v) => acc + v, 0) / totalUsd * 100;
  // HHI in 0-10000 scale (TradFi convention)
  const hhi = sortedByValue.reduce((acc, v) => {
    const share = (v / totalUsd) * 100;
    return acc + share * share;
  }, 0);
  // Effective N = 1 / sum(weight^2), where weight is fractional
  const sumW2 = sortedByValue.reduce((acc, v) => {
    const w = v / totalUsd;
    return acc + w * w;
  }, 0);
  const effectiveN = sumW2 > 0 ? 1 / sumW2 : 0;
  const largestSym =
    filtered.sort((a, b) => b.usdValue - a.usdValue)[0]?.symbol ?? '';
  const largestUsd = sortedByValue[0] ?? 0;
  const largestPct = (largestUsd / totalUsd) * 100;

  let verdict: ConcentrationStats['verdict'];
  if (effectiveN >= 8 && largestPct < 25) verdict = 'highly diversified';
  else if (effectiveN >= 5 && largestPct < 40) verdict = 'diversified';
  else if (effectiveN >= 3 && largestPct < 60) verdict = 'moderate';
  else if (largestPct < 80) verdict = 'concentrated';
  else verdict = 'highly concentrated';

  const concentration: ConcentrationStats = {
    topThreePct,
    hhi,
    effectiveN,
    largestHolding: { symbol: largestSym, pct: largestPct, usd: largestUsd },
    verdict,
  };

  return {
    totalUsd,
    bySupersector,
    bySector,
    byMarketCap,
    topHoldings,
    concentration,
  };
}
