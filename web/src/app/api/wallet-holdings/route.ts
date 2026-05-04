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

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: 1, jsonrpc: '2.0', method, params }),
  });
  if (!res.ok) throw new Error(`Alchemy ${method} HTTP ${res.status}`);
  const json = (await res.json()) as {
    result?: T;
    error?: { message: string };
  };
  if (json.error) throw new Error(`Alchemy ${method}: ${json.error.message}`);
  if (json.result === undefined) {
    throw new Error(`Alchemy ${method} returned no result`);
  }
  return json.result;
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

async function fetchNativePriceUsd(
  apiKey: string,
  symbol: string
): Promise<number | null> {
  try {
    const res = await fetch(
      `https://api.g.alchemy.com/prices/v1/${apiKey}/tokens/by-symbol?symbols=${encodeURIComponent(symbol)}`
    );
    if (!res.ok) return null;
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
    return usd ? Number(usd.value) : null;
  } catch {
    return null;
  }
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
    const nativePriceUsd = await fetchNativePriceUsd(apiKey, cfg.nativeSymbol);
    const nativeUsdValue =
      nativePriceUsd !== null ? nativeFormatted * nativePriceUsd : null;

    const nonZero = balResult.tokenBalances.filter((t) => {
      try {
        return t.tokenBalance && BigInt(t.tokenBalance) > 0n;
      } catch {
        return false;
      }
    });
    const TOKEN_LIMIT = 75;
    const truncated = nonZero.length > TOKEN_LIMIT;
    const slice = nonZero.slice(0, TOKEN_LIMIT);

    const enrichedRaw = await Promise.all(
      slice.map(async (t) => {
        try {
          const meta = await alchemyRpc<AlchemyTokenMetadata>(
            rpcUrl,
            'alchemy_getTokenMetadata',
            [t.contractAddress]
          );
          const decimals = meta.decimals ?? 18;
          const balance = BigInt(t.tokenBalance);
          const scale = 10n ** BigInt(decimals);
          const whole = balance / scale;
          const frac = balance % scale;
          const balanceFormatted =
            Number(whole) + Number(frac) / Number(scale);
          return {
            contract: t.contractAddress.toLowerCase(),
            symbol: meta.symbol ?? '(unknown)',
            name: meta.name,
            decimals,
            balance: t.tokenBalance,
            balanceFormatted,
          };
        } catch {
          return null;
        }
      })
    );
    const enriched = enrichedRaw.filter(
      (x): x is NonNullable<typeof x> => x !== null
    );

    const priceMap = await fetchTokenPrices(
      apiKey,
      cfg.alchemyPricesNetwork,
      enriched.map((e) => e.contract)
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
// Handler
// =========================================================================

export async function POST(req: NextRequest): Promise<NextResponse> {
  const apiKey = process.env.ALCHEMY_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'ALCHEMY_API_KEY not configured on the server' },
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

  // Fan out across chains in parallel. Each scanChain catches its own errors
  // and surfaces them in the response so a single dead chain doesn't kill
  // the whole result.
  const results = await Promise.all(
    validSlugs.map((slug) =>
      scanChain(apiKey, slug, SCANNABLE_CHAINS[slug], address)
    )
  );

  const grandTotalUsd = results.reduce((acc, r) => acc + r.totalUsd, 0);
  const grandLegitimateUsd = results.reduce(
    (acc, r) => acc + r.legitimateUsd,
    0
  );
  const grandSpamUsd = results.reduce((acc, r) => acc + r.spamUsd, 0);

  return NextResponse.json({
    address,
    chains: results,
    legitimateUsd: grandLegitimateUsd,
    spamUsd: grandSpamUsd,
    totalUsd: grandTotalUsd,
  });
}
