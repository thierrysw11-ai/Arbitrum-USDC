/**
 * POST /api/wallet-holdings
 * Body: { address: "0x...", chains?: string[] }
 *
 * Multi-chain wallet scan. For each requested chain (defaults to all 5),
 * returns the wallet's native gas-token balance + every non-zero ERC-20 it
 * holds, with token metadata (symbol/name/decimals) resolved via Alchemy
 * and USD prices fetched from Alchemy's Prices API.
 *
 * Server-side only — Alchemy API key never reaches the browser.
 *
 * Why a separate "scannable chains" registry instead of reusing chains.ts:
 *   chains.ts is the Aave-V3-relevant registry (4 chains). Wallet holdings
 *   make sense on a wider set — most importantly Ethereum mainnet, where
 *   users typically hold the bulk of their ETH. We don't model Aave on
 *   mainnet, so it doesn't belong in chains.ts, but it's table-stakes for
 *   any "show me my holdings" feature.
 */

import { NextRequest, NextResponse } from 'next/server';
import { isAddress } from 'viem';

import { lookupKnownToken } from '@/lib/tokens/known-metadata';
import {
  AlchemyPortfolioClient,
  type PortfolioHolding,
} from '@/lib/portfolio/alchemy-portfolio';
import {
  ZerionClient,
  zerionChainToSlug,
  type ZerionNormalizedHolding,
} from '@/lib/portfolio/zerion';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// High-activity wallets (vitalik, large funds) have hundreds of token
// interactions across 5 chains. Default 10s isn't enough — bump to the
// Vercel Pro ceiling so the scan can complete.
export const maxDuration = 60;

interface ScanChainConfig {
  alchemyRpc: string; // Alchemy subdomain (e.g. "eth-mainnet")
  alchemyPricesNetwork: string; // Alchemy Prices API network identifier
  displayName: string;
  chainId: number;
  nativeSymbol: string; // for the native-balance field
}

const SCANNABLE_CHAINS: Record<string, ScanChainConfig> = {
  'ethereum-mainnet': {
    alchemyRpc: 'eth-mainnet',
    alchemyPricesNetwork: 'eth-mainnet',
    displayName: 'Ethereum',
    chainId: 1,
    nativeSymbol: 'ETH',
  },
  'arbitrum-one': {
    alchemyRpc: 'arb-mainnet',
    alchemyPricesNetwork: 'arb-mainnet',
    displayName: 'Arbitrum One',
    chainId: 42161,
    nativeSymbol: 'ETH',
  },
  base: {
    alchemyRpc: 'base-mainnet',
    alchemyPricesNetwork: 'base-mainnet',
    displayName: 'Base',
    chainId: 8453,
    nativeSymbol: 'ETH',
  },
  optimism: {
    alchemyRpc: 'opt-mainnet',
    alchemyPricesNetwork: 'opt-mainnet',
    displayName: 'Optimism',
    chainId: 10,
    nativeSymbol: 'ETH',
  },
  polygon: {
    alchemyRpc: 'polygon-mainnet',
    alchemyPricesNetwork: 'polygon-mainnet',
    displayName: 'Polygon',
    chainId: 137,
    nativeSymbol: 'MATIC',
  },
};

const ALL_SLUGS = Object.keys(SCANNABLE_CHAINS);

// =========================================================================
// Spam / scam token detection
//
// Wallets accumulate junk over time. Alchemy returns every ERC-20 the wallet
// has ever touched, INCLUDING airdrop scams that are listed on thinly-
// traded DEX pools. The Prices API picks up those fake quotes, and the
// user ends up "holding" $2K of MNEP they can't actually realize.
//
// Two-layer filter:
//   1. Hardcoded symbol blocklist for the famous scams (Minereum & friends).
//   2. Name-pattern heuristic: tokens whose `name` field contains a URL,
//      "claim", "airdrop", "visit", or other classic scam-airdrop language.
// =========================================================================

const KNOWN_SPAM_SYMBOLS = new Set<string>([
  'MNEP', // Minereum Polygon — large airdrop scam, fake DEX price
  'MNE', // Minereum (Ethereum mainnet)
  'MNES', // Minereum SubsCoin
  'MEGA', // many MEGA-prefixed scams
  'MMM',
  'AIRDROP',
]);

const SCAM_NAME_PATTERNS: RegExp[] = [
  /https?:\/\//i, // any URL in the token name
  /\bvisit\b.*\.(com|io|xyz|net|org)/i,
  /\bclaim\b.*\b(airdrop|reward|bonus|prize)\b/i,
  /\bgo\s+to\b.*\.(com|io|xyz)/i,
  /\$\s*\d+.*free/i,
  /[█-▟]/, // block-element characters often used to draw "logos"
];

function isLikelySpam(symbol: string, name: string | null): boolean {
  if (KNOWN_SPAM_SYMBOLS.has(symbol.toUpperCase())) return true;
  if (name) {
    for (const pat of SCAM_NAME_PATTERNS) {
      if (pat.test(name)) return true;
    }
  }
  return false;
}

// =========================================================================
// Alchemy helpers
// =========================================================================

interface AlchemyTokenBalance {
  contractAddress: string;
  tokenBalance: string;
}

interface AlchemyTokenMetadata {
  decimals: number | null;
  logo: string | null;
  name: string | null;
  symbol: string | null;
}

interface AlchemyPriceEntry {
  network: string;
  address: string;
  prices: Array<{
    currency: string;
    value: string;
    lastUpdatedAt: string;
  }>;
  error?: { message: string };
}

async function alchemyRpc<T>(
  url: string,
  method: string,
  params: unknown[]
): Promise<T> {
  // Retry once on 429 (rate limit) and once on transient 5xx errors.
  // Alchemy's compute-unit bucket replenishes within ~1s so a short
  // backoff usually clears the issue.
  const attempt = async (): Promise<{ res: Response; body: string }> => {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 1, jsonrpc: '2.0', method, params }),
    });
    return { res: r, body: await r.text() };
  };

  let attempt1 = await attempt();
  if (
    !attempt1.res.ok &&
    (attempt1.res.status === 429 || attempt1.res.status >= 500)
  ) {
    await new Promise((resolve) => setTimeout(resolve, 600));
    attempt1 = await attempt();
  }
  if (!attempt1.res.ok) {
    throw new Error(`Alchemy ${method} HTTP ${attempt1.res.status}`);
  }
  const json = JSON.parse(attempt1.body) as {
    result?: T;
    error?: { message: string };
  };
  if (json.error) throw new Error(`Alchemy ${method}: ${json.error.message}`);
  if (json.result === undefined) {
    throw new Error(`Alchemy ${method} returned no result`);
  }
  return json.result;
}

/**
 * Resilient metadata fetch — checks the static known-token cache first
 * (skips the RPC call entirely for tokens we already know). Falls back
 * to alchemy_getTokenMetadata for unknown tokens, with a 429 retry +
 * backoff before giving up.
 *
 * For typical wallets the cache hits 60-80% of holdings; for whale
 * wallets it's lower (long-tail) but still drops dozens of RPC calls.
 */
async function fetchTokenMetadataSafe(
  rpcUrl: string,
  contractAddress: string,
  tokenBalance: string,
  chainSlug: string
): Promise<{
  contract: string;
  symbol: string;
  name: string | null;
  decimals: number;
  balance: string;
  balanceFormatted: number;
  fromCache?: boolean;
} | null> {
  const buildResult = (
    decimals: number,
    symbol: string,
    name: string | null,
    fromCache: boolean
  ) => {
    try {
      const balance = BigInt(tokenBalance);
      const scale = 10n ** BigInt(decimals);
      const whole = balance / scale;
      const frac = balance % scale;
      const balanceFormatted = Number(whole) + Number(frac) / Number(scale);
      return {
        contract: contractAddress.toLowerCase(),
        symbol,
        name,
        decimals,
        balance: tokenBalance,
        balanceFormatted,
        fromCache,
      };
    } catch {
      return null;
    }
  };

  // 1. Static cache — zero RPC cost for well-known tokens.
  const cached = lookupKnownToken(chainSlug, contractAddress);
  if (cached) {
    return buildResult(cached.decimals, cached.symbol, cached.name, true);
  }

  // 2. Fallback — Alchemy metadata RPC, with one 429 retry.
  const fetchOnce = () =>
    alchemyRpc<AlchemyTokenMetadata>(
      rpcUrl,
      'alchemy_getTokenMetadata',
      [contractAddress]
    );
  let meta: AlchemyTokenMetadata | null = null;
  try {
    meta = await fetchOnce();
  } catch (err) {
    const msg = (err as Error).message || '';
    if (/429|rate/i.test(msg)) {
      await new Promise((r) => setTimeout(r, 500));
      try {
        meta = await fetchOnce();
      } catch {
        return null;
      }
    } else {
      return null;
    }
  }
  if (!meta) return null;
  return buildResult(
    meta.decimals ?? 18,
    meta.symbol ?? '(unknown)',
    meta.name,
    false
  );
}

async function fetchTokenPrices(
  apiKey: string,
  pricesNetwork: string,
  addresses: string[]
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (addresses.length === 0) return out;
  for (let i = 0; i < addresses.length; i += 25) {
    const chunk = addresses.slice(i, i + 25);
    try {
      const res = await fetch(
        `https://api.g.alchemy.com/prices/v1/${apiKey}/tokens/by-address`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            addresses: chunk.map((a) => ({
              network: pricesNetwork,
              address: a,
            })),
          }),
        }
      );
      if (!res.ok) continue;
      const json = (await res.json()) as { data: AlchemyPriceEntry[] };
      for (const entry of json.data ?? []) {
        const usd = entry.prices?.find((p) => p.currency === 'usd');
        if (usd) out.set(entry.address.toLowerCase(), Number(usd.value));
      }
    } catch {
      // best-effort; missing prices show as null in UI
    }
  }
  return out;
}

// Wrapped equivalents per chain — used as a fallback price source for
// native gas tokens when Alchemy's by-symbol endpoint flakes (which it
// does under load, especially for ETH on mainnet).
const WRAPPED_NATIVE_PRICE_PROXY: Record<
  string,
  { network: string; address: string } | null
> = {
  'ethereum-mainnet': {
    network: 'eth-mainnet',
    address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', // WETH
  },
  'arbitrum-one': {
    network: 'arb-mainnet',
    address: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1', // WETH
  },
  base: {
    network: 'base-mainnet',
    address: '0x4200000000000000000000000000000000000006', // WETH
  },
  optimism: {
    network: 'opt-mainnet',
    address: '0x4200000000000000000000000000000000000006', // WETH
  },
  polygon: {
    network: 'polygon-mainnet',
    address: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270', // WMATIC/WPOL
  },
};

async function fetchNativePriceUsd(
  apiKey: string,
  symbol: string,
  chainSlug?: string
): Promise<number | null> {
  // 1. Primary: Alchemy by-symbol API.
  try {
    const res = await fetch(
      `https://api.g.alchemy.com/prices/v1/${apiKey}/tokens/by-symbol?symbols=${encodeURIComponent(symbol)}`
    );
    if (res.ok) {
      const json = (await res.json()) as {
        data: Array<{
          symbol: string;
          prices: Array<{ currency: string; value: string }>;
        }>;
      };
      const entry = json.data?.find(
        (e) => e.symbol.toUpperCase() === symbol.toUpperCase()
      );
      const usd = entry?.prices?.find((p) => p.currency === 'usd');
      if (usd) {
        const v = Number(usd.value);
        if (Number.isFinite(v) && v > 0) return v;
      }
    }
  } catch {
    // fall through to fallback
  }

  // 2. Fallback: price the wrapped equivalent via by-address. Much more
  // reliable than by-symbol under load and gives a price within a few bps
  // of the native asset.
  if (chainSlug && WRAPPED_NATIVE_PRICE_PROXY[chainSlug]) {
    const proxy = WRAPPED_NATIVE_PRICE_PROXY[chainSlug];
    if (!proxy) return null;
    try {
      const res = await fetch(
        `https://api.g.alchemy.com/prices/v1/${apiKey}/tokens/by-address`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            addresses: [{ network: proxy.network, address: proxy.address }],
          }),
        }
      );
      if (res.ok) {
        const json = (await res.json()) as { data: AlchemyPriceEntry[] };
        const entry = json.data?.[0];
        const usd = entry?.prices?.find((p) => p.currency === 'usd');
        if (usd) {
          const v = Number(usd.value);
          if (Number.isFinite(v) && v > 0) return v;
        }
      }
    } catch {
      // give up
    }
  }
  return null;
}

// =========================================================================
// Per-chain scan
// =========================================================================

interface ChainHoldings {
  chainSlug: string;
  chainName: string;
  chainId: number;
  nativeBalance: {
    symbol: string;
    balance: string;
    balanceFormatted: number;
    priceUsd: number | null;
    usdValue: number | null;
  };
  erc20Count: number;
  erc20Truncated: boolean;
  erc20: Array<{
    contract: string;
    symbol: string;
    name: string | null;
    decimals: number;
    balance: string;
    balanceFormatted: number;
    priceUsd: number | null;
    usdValue: number | null;
    isSpam: boolean;
  }>;
  legitimateUsd: number;
  spamUsd: number;
  totalUsd: number; // legitimate + spam (preserved for backward compat)
  error?: string;
}

async function scanChain(
  apiKey: string,
  slug: string,
  cfg: ScanChainConfig,
  address: string
): Promise<ChainHoldings> {
  const rpcUrl = `https://${cfg.alchemyRpc}.g.alchemy.com/v2/${apiKey}`;

  try {
    const [balResult, nativeHex] = await Promise.all([
      alchemyRpc<{ tokenBalances: AlchemyTokenBalance[] }>(
        rpcUrl,
        'alchemy_getTokenBalances',
        [address, 'erc20']
      ),
      alchemyRpc<string>(rpcUrl, 'eth_getBalance', [address, 'latest']),
    ]);

    const nativeWei = BigInt(nativeHex);
    const nativeFormatted = Number(nativeWei) / 1e18;
    const nativePriceUsd = await fetchNativePriceUsd(
      apiKey,
      cfg.nativeSymbol,
      slug
    );
    const nativeUsdValue =
      nativePriceUsd !== null ? nativeFormatted * nativePriceUsd : null;

    const nonZero = balResult.tokenBalances.filter((t) => {
      try {
        return t.tokenBalance && BigInt(t.tokenBalance) > 0n;
      } catch {
        return false;
      }
    });
    const TOKEN_LIMIT = 50;
    const truncated = nonZero.length > TOKEN_LIMIT;

    // ─── KEY OPTIMIZATION ──────────────────────────────────────────────
    // Fetch PRICES FIRST for every non-zero token (cheap — 1 batched call
    // per 25 addresses, ~2-3 calls total even for high-activity wallets).
    // Then only fetch metadata for tokens that actually have a USD price.
    //
    // For wallets like vitalik this drops metadata calls from ~75/chain
    // (which gets us rate-limited) to ~10-20/chain. Most of the dropped
    // tokens are spam-tier addresses that have no real market price
    // anyway, so we lose nothing meaningful.
    // ───────────────────────────────────────────────────────────────────
    const allAddresses = nonZero.map((t) => t.contractAddress.toLowerCase());
    const priceMap = await fetchTokenPrices(
      apiKey,
      cfg.alchemyPricesNetwork,
      allAddresses
    );

    // Keep priced tokens first, then unpriced (in case metadata budget
    // allows) — but cap the total at TOKEN_LIMIT either way.
    const priced = nonZero.filter((t) =>
      priceMap.has(t.contractAddress.toLowerCase())
    );
    const unpriced = nonZero.filter(
      (t) => !priceMap.has(t.contractAddress.toLowerCase())
    );
    const slice = [...priced, ...unpriced].slice(0, TOKEN_LIMIT);

    // Sequential metadata fetches with cache hit + 429 retry. Cache hits
    // are synchronous; only RPC fallbacks pay the latency.
    const enrichedRaw: Array<{
      contract: string;
      symbol: string;
      name: string | null;
      decimals: number;
      balance: string;
      balanceFormatted: number;
      fromCache?: boolean;
    } | null> = [];
    for (const t of slice) {
      enrichedRaw.push(
        await fetchTokenMetadataSafe(
          rpcUrl,
          t.contractAddress,
          t.tokenBalance,
          slug
        )
      );
    }
    const enriched = enrichedRaw.filter(
      (x): x is NonNullable<typeof x> => x !== null
    );

    const erc20WithPrices = enriched
      .map((e) => {
        const priceUsd = priceMap.get(e.contract) ?? null;
        const usdValue =
          priceUsd !== null ? e.balanceFormatted * priceUsd : null;
        const isSpam = isLikelySpam(e.symbol, e.name);
        return { ...e, priceUsd, usdValue, isSpam };
      })
      .sort((a, b) => {
        // Spam sinks to the bottom regardless of stated USD value, so the
        // user's real holdings dominate the visible top of the list.
        if (a.isSpam !== b.isSpam) return a.isSpam ? 1 : -1;
        return (b.usdValue ?? 0) - (a.usdValue ?? 0);
      });

    const legitimateUsd =
      (nativeUsdValue ?? 0) +
      erc20WithPrices
        .filter((e) => !e.isSpam)
        .reduce((acc, e) => acc + (e.usdValue ?? 0), 0);
    const spamUsd = erc20WithPrices
      .filter((e) => e.isSpam)
      .reduce((acc, e) => acc + (e.usdValue ?? 0), 0);
    const totalUsd = legitimateUsd + spamUsd;

    return {
      chainSlug: slug,
      chainName: cfg.displayName,
      chainId: cfg.chainId,
      nativeBalance: {
        symbol: cfg.nativeSymbol,
        balance: nativeWei.toString(),
        balanceFormatted: nativeFormatted,
        priceUsd: nativePriceUsd,
        usdValue: nativeUsdValue,
      },
      erc20Count: nonZero.length,
      erc20Truncated: truncated,
      erc20: erc20WithPrices,
      legitimateUsd,
      spamUsd,
      totalUsd,
    };
  } catch (err) {
    return {
      chainSlug: slug,
      chainName: cfg.displayName,
      chainId: cfg.chainId,
      nativeBalance: {
        symbol: cfg.nativeSymbol,
        balance: '0',
        balanceFormatted: 0,
        priceUsd: null,
        usdValue: null,
      },
      erc20Count: 0,
      erc20Truncated: false,
      erc20: [],
      legitimateUsd: 0,
      spamUsd: 0,
      totalUsd: 0,
      error: (err as Error).message,
    };
  }
}

// =========================================================================
// Metadata rescue — fill in missing symbols/names for ERC-20s the
// Portfolio API returned without metadata. Hits the static cache first
// (free), only escalates to alchemy_getTokenMetadata RPC for the
// remaining gaps. Mutates `holdings` in place.
// =========================================================================

async function rescueMissingMetadata(
  apiKey: string,
  holdings: PortfolioHolding[]
): Promise<void> {
  // Identify gaps: ERC-20s where the symbol came back as (unknown) /
  // empty / generic placeholder text.
  const gaps = holdings.filter(
    (h) =>
      h.contractAddress !== null &&
      (!h.symbol ||
        h.symbol === '(unknown)' ||
        h.symbol.toLowerCase() === 'unknown')
  );
  if (gaps.length === 0) return;

  // Phase 1: static cache (no network cost).
  for (const h of gaps) {
    const cached = lookupKnownToken(h.chainSlug, h.contractAddress!);
    if (cached) {
      h.symbol = cached.symbol;
      h.name = cached.name;
      // Re-derive USD value using cached decimals only if Portfolio gave
      // us a balance and price; otherwise keep what we had.
      if (h.decimals !== cached.decimals && h.balanceFormatted > 0 && h.priceUsd !== null) {
        // Decimals shouldn't change for the same address — but if our
        // cache disagrees with Portfolio's, trust the cache (immutable
        // by definition).
        const ratio = 10 ** (h.decimals - cached.decimals);
        h.balanceFormatted = h.balanceFormatted * ratio;
        h.usdValue = h.balanceFormatted * h.priceUsd;
        h.decimals = cached.decimals;
      }
    }
  }

  // Phase 2: anything still unknown → RPC fallback. Cap at 25 calls
  // total to stay well under the rate limit even on whale wallets.
  const stillUnknown = gaps
    .filter((h) => h.symbol === '(unknown)' || h.symbol === '')
    .slice(0, 25);
  for (const h of stillUnknown) {
    const slugToRpc: Record<string, string> = {
      'ethereum-mainnet': `https://eth-mainnet.g.alchemy.com/v2/${apiKey}`,
      'arbitrum-one': `https://arb-mainnet.g.alchemy.com/v2/${apiKey}`,
      base: `https://base-mainnet.g.alchemy.com/v2/${apiKey}`,
      optimism: `https://opt-mainnet.g.alchemy.com/v2/${apiKey}`,
      polygon: `https://polygon-mainnet.g.alchemy.com/v2/${apiKey}`,
    };
    const rpcUrl = slugToRpc[h.chainSlug];
    if (!rpcUrl) continue;
    try {
      const meta = await alchemyRpc<AlchemyTokenMetadata>(
        rpcUrl,
        'alchemy_getTokenMetadata',
        [h.contractAddress!]
      );
      if (meta?.symbol) h.symbol = meta.symbol;
      if (meta?.name) h.name = meta.name;
    } catch {
      // Already retried internally — give up silently.
    }
  }
}

// =========================================================================
// Alchemy Portfolio → ChainHoldings adapter
// =========================================================================

function portfolioToChainHoldings(
  holdings: PortfolioHolding[]
): ChainHoldings[] {
  // Group by chainSlug.
  const byChain = new Map<string, PortfolioHolding[]>();
  for (const h of holdings) {
    if (!byChain.has(h.chainSlug)) byChain.set(h.chainSlug, []);
    byChain.get(h.chainSlug)!.push(h);
  }

  // Build a complete row for every chain we scan, even empty ones — keeps
  // the response shape predictable for the frontend.
  const out: ChainHoldings[] = [];
  for (const slug of ALL_SLUGS) {
    const cfg = SCANNABLE_CHAINS[slug];
    const items = byChain.get(slug) ?? [];

    const nativeEntry = items.find((h) => h.contractAddress === null);
    const erc20Items = items.filter((h) => h.contractAddress !== null);

    const erc20Mapped = erc20Items.map((h) => {
      const isSpam = isLikelySpam(h.symbol, h.name);
      return {
        contract: h.contractAddress!.toLowerCase(),
        symbol: h.symbol,
        name: h.name,
        decimals: h.decimals,
        // Raw uint not surfaced by the Portfolio endpoint — we have the
        // human-readable balance directly. Keep the raw field as '0' for
        // schema compat; nothing downstream reads it.
        balance: '0',
        balanceFormatted: h.balanceFormatted,
        priceUsd: h.priceUsd,
        usdValue: h.usdValue,
        isSpam,
      };
    });
    erc20Mapped.sort((a, b) => {
      if (a.isSpam !== b.isSpam) return a.isSpam ? 1 : -1;
      return (b.usdValue ?? 0) - (a.usdValue ?? 0);
    });

    const legitimateUsd =
      (nativeEntry?.usdValue ?? 0) +
      erc20Mapped
        .filter((e) => !e.isSpam)
        .reduce((acc, e) => acc + (e.usdValue ?? 0), 0);
    const spamUsd = erc20Mapped
      .filter((e) => e.isSpam)
      .reduce((acc, e) => acc + (e.usdValue ?? 0), 0);
    const totalUsd = legitimateUsd + spamUsd;

    out.push({
      chainSlug: slug,
      chainName: cfg.displayName,
      chainId: cfg.chainId,
      nativeBalance: {
        symbol: nativeEntry?.symbol ?? cfg.nativeSymbol,
        balance: '0',
        balanceFormatted: nativeEntry?.balanceFormatted ?? 0,
        priceUsd: nativeEntry?.priceUsd ?? null,
        usdValue: nativeEntry?.usdValue ?? null,
      },
      erc20Count: erc20Mapped.length,
      erc20Truncated: false,
      erc20: erc20Mapped,
      legitimateUsd,
      spamUsd,
      totalUsd,
    });
  }
  return out;
}

// =========================================================================
// Zerion → ChainHoldings adapter
//
// Maps the flat list of Zerion positions (across N chains) into the
// per-chain ChainHoldings shape the rest of the dApp expects. Preserves
// the spam-detection contract — Zerion's own `is_trash` flag is the
// strongest signal, with our heuristic as a fallback.
// =========================================================================

function zerionToChainHoldings(
  holdings: ZerionNormalizedHolding[]
): ChainHoldings[] {
  // Group by mapped chainSlug. Anything outside our 5-chain registry gets
  // grouped under its raw Zerion id (so e.g. Solana shows up as a "solana"
  // chain in the wallet section without breaking downstream EVM-typed code).
  const byChain = new Map<string, ZerionNormalizedHolding[]>();
  for (const h of holdings) {
    const slug = zerionChainToSlug(h.chainId);
    if (!byChain.has(slug)) byChain.set(slug, []);
    byChain.get(slug)!.push(h);
  }

  const out: ChainHoldings[] = [];
  for (const [slug, items] of byChain.entries()) {
    const cfg = SCANNABLE_CHAINS[slug];
    // Native: contract address null + symbol matches the chain's native.
    const nativeSymbol = cfg?.nativeSymbol ?? items[0]?.symbol ?? '';
    const nativeEntry = items.find(
      (h) =>
        h.contractAddress === null &&
        (h.symbol === nativeSymbol || h.symbol === 'ETH' || h.symbol === 'BTC')
    );
    const erc20Items = items.filter((h) => h.contractAddress !== null);

    const erc20Mapped = erc20Items.map((h) => ({
      contract: h.contractAddress!.toLowerCase(),
      symbol: h.symbol,
      name: h.name,
      decimals: h.decimals,
      balance: '0', // raw uint not exposed by Zerion in this endpoint
      balanceFormatted: h.balanceFormatted,
      priceUsd: h.priceUsd,
      usdValue: h.usdValue,
      // Trust Zerion's `is_trash` flag as the primary spam signal; fall
      // back to our heuristic for unverified tokens it didn't flag.
      isSpam: h.isTrash || (!h.isVerified && isLikelySpam(h.symbol, h.name)),
    }));
    erc20Mapped.sort((a, b) => {
      if (a.isSpam !== b.isSpam) return a.isSpam ? 1 : -1;
      return (b.usdValue ?? 0) - (a.usdValue ?? 0);
    });

    const legitimateUsd =
      (nativeEntry?.usdValue ?? 0) +
      erc20Mapped
        .filter((e) => !e.isSpam)
        .reduce((acc, e) => acc + (e.usdValue ?? 0), 0);
    const spamUsd = erc20Mapped
      .filter((e) => e.isSpam)
      .reduce((acc, e) => acc + (e.usdValue ?? 0), 0);
    const totalUsd = legitimateUsd + spamUsd;

    out.push({
      chainSlug: slug,
      chainName: cfg?.displayName ?? slug,
      chainId: cfg?.chainId ?? 0,
      nativeBalance: {
        symbol: nativeEntry?.symbol ?? cfg?.nativeSymbol ?? '',
        balance: '0',
        balanceFormatted: nativeEntry?.balanceFormatted ?? 0,
        priceUsd: nativeEntry?.priceUsd ?? null,
        usdValue: nativeEntry?.usdValue ?? null,
      },
      erc20Count: erc20Mapped.length,
      erc20Truncated: false,
      erc20: erc20Mapped,
      legitimateUsd,
      spamUsd,
      totalUsd,
    });
  }

  // Stable ordering: known EVM chains first in the canonical order, then
  // any extras (Solana, Bitcoin, etc.) by USD value descending.
  out.sort((a, b) => {
    const ai = ALL_SLUGS.indexOf(a.chainSlug);
    const bi = ALL_SLUGS.indexOf(b.chainSlug);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return b.totalUsd - a.totalUsd;
  });
  return out;
}

// =========================================================================
// Handler
// =========================================================================

export async function POST(req: NextRequest): Promise<NextResponse> {
  const alchemyKey = process.env.ALCHEMY_API_KEY;
  const zerionKey = process.env.ZERION_API_KEY;

  if (!alchemyKey && !zerionKey) {
    return NextResponse.json(
      { error: 'No data backend configured — set ZERION_API_KEY or ALCHEMY_API_KEY.' },
      { status: 500 }
    );
  }

  let body: { address?: string; chains?: string[] };
  try {
    body = (await req.json()) as { address?: string; chains?: string[] };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const address = (body.address || '').toLowerCase();
  if (!isAddress(address)) {
    return NextResponse.json(
      { error: 'address must be a 0x-prefixed 20-byte hex' },
      { status: 400 }
    );
  }

  // ─── PRIMARY: ALCHEMY PORTFOLIO API ─────────────────────────────────
  // Single call, multi-chain, prices + metadata included. Massively more
  // efficient than the per-chain RPC fan-out below — the same Alchemy API
  // key the rest of the dApp already uses, no new vendor required.
  if (alchemyKey) {
    try {
      const client = new AlchemyPortfolioClient(alchemyKey);
      const holdings = await client.scan({ address });
      // Rescue any tokens the Portfolio API returned without metadata.
      // Cheap (cache hits) for most, RPC fallback only for the long tail.
      await rescueMissingMetadata(alchemyKey, holdings);
      const chains = portfolioToChainHoldings(holdings);
      const grandLegitimateUsd = chains.reduce(
        (acc, c) => acc + c.legitimateUsd,
        0
      );
      const grandSpamUsd = chains.reduce((acc, c) => acc + c.spamUsd, 0);
      const grandTotalUsd = grandLegitimateUsd + grandSpamUsd;
      return NextResponse.json({
        address,
        backend: 'alchemy-portfolio',
        chains,
        legitimateUsd: grandLegitimateUsd,
        spamUsd: grandSpamUsd,
        totalUsd: grandTotalUsd,
      });
    } catch (err) {
      console.warn(
        '[wallet-holdings] Alchemy Portfolio failed, trying next backend:',
        (err as Error).message
      );
      // fall through to Zerion (if configured) or per-chain RPC scan
    }
  }

  // ─── BACKUP: ZERION ─────────────────────────────────────────────────
  // Used when Portfolio API errors AND a Zerion key is configured. Zerion
  // covers 60+ chains and adds non-EVM (Solana, Tezos) when a wallet
  // happens to have those tokens too.
  if (zerionKey) {
    try {
      const client = new ZerionClient(zerionKey);
      const result = await client.scan(address);
      const chains = zerionToChainHoldings(result.holdings);
      const grandLegitimateUsd = chains.reduce(
        (acc, c) => acc + c.legitimateUsd,
        0
      );
      const grandSpamUsd = chains.reduce((acc, c) => acc + c.spamUsd, 0);
      const grandTotalUsd = grandLegitimateUsd + grandSpamUsd;
      return NextResponse.json({
        address,
        backend: 'zerion',
        chains,
        legitimateUsd: grandLegitimateUsd,
        spamUsd: grandSpamUsd,
        totalUsd: grandTotalUsd,
      });
    } catch (err) {
      console.warn(
        '[wallet-holdings] Zerion failed, falling back to per-chain RPC:',
        (err as Error).message
      );
      if (!alchemyKey) {
        return NextResponse.json(
          {
            error: `Zerion failed and no Alchemy fallback configured: ${(err as Error).message}`,
          },
          { status: 502 }
        );
      }
    }
  }

  // ─── ALCHEMY FALLBACK ───────────────────────────────────────────────
  if (!alchemyKey) {
    return NextResponse.json(
      { error: 'No data backend available' },
      { status: 500 }
    );
  }
  const apiKey = alchemyKey;

  const requestedSlugs =
    body.chains && body.chains.length > 0 ? body.chains : ALL_SLUGS;
  const validSlugs = requestedSlugs.filter((s) => s in SCANNABLE_CHAINS);
  if (validSlugs.length === 0) {
    return NextResponse.json(
      {
        error: `No supported chains in request. Supported: ${ALL_SLUGS.join(', ')}.`,
      },
      { status: 400 }
    );
  }

  // Fan out across chains, but stagger by 150ms so we don't smash Alchemy
  // with 5 simultaneous floods on high-activity wallets. Each scanChain
  // catches its own errors and surfaces them in the response so a single
  // dead chain doesn't kill the whole result.
  const results = await Promise.all(
    validSlugs.map(async (slug, i) => {
      if (i > 0) await new Promise((r) => setTimeout(r, i * 150));
      return scanChain(apiKey, slug, SCANNABLE_CHAINS[slug], address);
    })
  );

  const grandTotalUsd = results.reduce((acc, r) => acc + r.totalUsd, 0);
  const grandLegitimateUsd = results.reduce(
    (acc, r) => acc + r.legitimateUsd,
    0
  );
  const grandSpamUsd = results.reduce((acc, r) => acc + r.spamUsd, 0);

  return NextResponse.json({
    address,
    backend: 'alchemy',
    chains: results,
    legitimateUsd: grandLegitimateUsd,
    spamUsd: grandSpamUsd,
    totalUsd: grandTotalUsd,
  });
}
