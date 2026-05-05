/**
 * Alchemy Portfolio API client.
 *
 * One POST returns the wallet's token balances across multiple chains,
 * with metadata, prices, and spam flags pre-computed by Alchemy. This
 * replaces our previous fan-out approach (eth_getBalance + getTokenBalances
 * + getTokenMetadata × 75 + by-address-prices, per chain × 5 chains)
 * that was hitting 429s on whale wallets like vitalik.
 *
 * Endpoint: POST https://api.g.alchemy.com/data/v1/{API_KEY}/assets/tokens/by-address
 *
 * Pricing: included in the same Alchemy account / API key that powers
 * the rest of the dApp. Compute-unit cost per call is much lower than
 * the equivalent RPC fan-out, so even free-tier users should be able
 * to scan whale wallets without hitting rate limits.
 *
 * Docs: https://www.alchemy.com/docs/data/portfolio-apis
 */

// =========================================================================
// Networks Alchemy recognizes for this endpoint.
//
// We only request the 5 we currently model, but the API supports many
// more. Add to this list to expand coverage (no other code changes needed
// — the consumer maps via zerionChainToSlug-style lookup further down).
// =========================================================================

export const ALCHEMY_PORTFOLIO_NETWORKS = [
  'eth-mainnet',
  'arb-mainnet',
  'base-mainnet',
  'opt-mainnet',
  'polygon-mainnet',
] as const;

export type AlchemyNetworkId = (typeof ALCHEMY_PORTFOLIO_NETWORKS)[number];

/** Map Alchemy's network id back to our chainSlug convention. */
export function alchemyNetworkToChainSlug(network: string): string {
  switch (network) {
    case 'eth-mainnet':
      return 'ethereum-mainnet';
    case 'arb-mainnet':
      return 'arbitrum-one';
    case 'base-mainnet':
      return 'base';
    case 'opt-mainnet':
      return 'optimism';
    case 'polygon-mainnet':
      return 'polygon';
    default:
      return network;
  }
}

/**
 * Native gas-token symbol per chain. Alchemy's Portfolio API doesn't
 * always populate `tokenMetadata` for native balances, so we keep this
 * lookup to fill in the symbol/decimals when they come back blank.
 */
export function nativeTokenForChain(chainSlug: string): {
  symbol: string;
  name: string;
  decimals: number;
} {
  switch (chainSlug) {
    case 'polygon':
      return { symbol: 'POL', name: 'Polygon', decimals: 18 };
    case 'ethereum-mainnet':
    case 'arbitrum-one':
    case 'base':
    case 'optimism':
    default:
      return { symbol: 'ETH', name: 'Ether', decimals: 18 };
  }
}

// =========================================================================
// Wire types — narrow to the fields we actually consume.
// =========================================================================

interface PortfolioWireToken {
  network: string;
  /** Lowercased contract address. Null for native gas tokens. */
  tokenAddress: string | null;
  /** Raw uint256 balance as decimal string. */
  tokenBalance: string;
  /** Token metadata. May be missing for unknown tokens. */
  tokenMetadata?: {
    symbol: string | null;
    name: string | null;
    decimals: number | null;
    logo?: string | null;
  };
  /** Live USD price + currency. */
  tokenPrices?: Array<{
    currency: string;
    value: string; // decimal string like "0.999847"
    lastUpdatedAt?: string;
  }>;
}

interface PortfolioWireResponse {
  data?: {
    tokens: PortfolioWireToken[];
  };
  // Some Alchemy responses use `tokens` at top level — handle both shapes.
  tokens?: PortfolioWireToken[];
  error?: { message: string };
}

// =========================================================================
// Normalized output — flat list of holdings the wallet-holdings adapter
// will group by chain.
// =========================================================================

export interface PortfolioHolding {
  /** Our chainSlug (ethereum-mainnet / arbitrum-one / base / optimism / polygon). */
  chainSlug: string;
  /** Lowercased contract address, or null for native. */
  contractAddress: string | null;
  symbol: string;
  name: string;
  decimals: number;
  balanceFormatted: number;
  priceUsd: number | null;
  usdValue: number | null;
}

// =========================================================================
// Client
// =========================================================================

const PORTFOLIO_BASE = 'https://api.g.alchemy.com/data/v1';

interface ScanArgs {
  /** EVM wallet address to scan (lowercased internally). */
  address: string;
  /** Optional subset of networks. Defaults to all 5. */
  networks?: readonly string[];
  /** Whether to include token metadata. Default true. */
  includeMetadata?: boolean;
  /** Whether to include token prices. Default true. */
  includePrices?: boolean;
  /** Whether to include native gas-token balances. Default true. */
  includeNativeTokens?: boolean;
}

export class AlchemyPortfolioClient {
  constructor(private apiKey: string) {}

  async scan({
    address,
    networks = ALCHEMY_PORTFOLIO_NETWORKS,
    includeMetadata = true,
    includePrices = true,
    includeNativeTokens = true,
  }: ScanArgs): Promise<PortfolioHolding[]> {
    // Alchemy expects: POST /data/v1/{key}/assets/tokens/by-address
    // Body: { addresses: [{ address, networks }], withMetadata, withPrices, includeNativeTokens }
    const url = `${PORTFOLIO_BASE}/${this.apiKey}/assets/tokens/by-address`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({
        addresses: [
          {
            address: address.toLowerCase(),
            networks,
          },
        ],
        withMetadata: includeMetadata,
        withPrices: includePrices,
        includeNativeTokens,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Alchemy Portfolio HTTP ${res.status}: ${text.slice(0, 200)}`);
    }

    const json = (await res.json()) as PortfolioWireResponse;
    if (json.error) {
      throw new Error(`Alchemy Portfolio: ${json.error.message}`);
    }

    const tokens = json.data?.tokens ?? json.tokens ?? [];
    const out: PortfolioHolding[] = [];

    for (const t of tokens) {
      // Only keep non-zero balances. Alchemy occasionally includes dust /
      // zero-balance entries from its index.
      if (!t.tokenBalance || t.tokenBalance === '0' || t.tokenBalance === '0x0') continue;

      const chainSlug = alchemyNetworkToChainSlug(t.network);
      const isNative =
        t.tokenAddress === null ||
        t.tokenAddress === undefined ||
        t.tokenAddress === '';

      // Native tokens often come back without `tokenMetadata` populated.
      // Fill in symbol/name/decimals from a per-chain lookup so they don't
      // show up as "(unknown)" in the UI / PDF.
      const nativeFallback = isNative ? nativeTokenForChain(chainSlug) : null;

      const decimals =
        t.tokenMetadata?.decimals ?? nativeFallback?.decimals ?? 18;
      const symbol =
        t.tokenMetadata?.symbol ?? nativeFallback?.symbol ?? '(unknown)';
      const name = t.tokenMetadata?.name ?? nativeFallback?.name ?? '';

      let balanceFormatted: number;
      try {
        // Two-step divide to keep precision for large bigints.
        const raw = t.tokenBalance.startsWith('0x') ? t.tokenBalance : t.tokenBalance;
        const big = BigInt(raw);
        const denom = 10n ** BigInt(decimals);
        const head = Number(big / denom);
        const tail = Number(big % denom) / Number(denom);
        balanceFormatted = head + tail;
      } catch {
        // Some pathological balance strings can't be parsed; skip.
        continue;
      }
      if (balanceFormatted <= 0) continue;

      const priceUsd = (() => {
        const p = t.tokenPrices?.find((x) => x.currency === 'usd');
        if (!p) return null;
        const v = Number(p.value);
        return Number.isFinite(v) && v > 0 ? v : null;
      })();

      out.push({
        chainSlug,
        contractAddress: isNative ? null : t.tokenAddress!.toLowerCase(),
        symbol,
        name,
        decimals,
        balanceFormatted,
        priceUsd,
        usdValue: priceUsd !== null ? balanceFormatted * priceUsd : null,
      });
    }

    return out;
  }
}
