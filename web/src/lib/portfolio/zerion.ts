/**
 * Zerion API client — multi-chain portfolio aggregator.
 *
 * One call to GET /v1/wallets/{address}/positions/ returns the wallet's
 * holdings across 60+ EVM chains (plus Solana, Tezos, Stellar) with USD
 * values pre-computed. This replaces the Alchemy-per-chain scan that
 * was hitting 429s on whale wallets.
 *
 * Auth: HTTP Basic with the API key as the username (no password).
 * Get a key at https://developers.zerion.io.
 *
 * Pricing (May 2026 — confirm at the link above):
 *   - Free: 100 req/min for development
 *   - Paid plans for production volume (~$99/mo and up)
 *
 * Why we still need a fallback:
 *   - Free tier limits don't suit production traffic
 *   - Network outages happen — Alchemy backstop keeps the dApp up
 *   - Don't lock the project to a single vendor
 */

// =========================================================================
// Wire types — narrow subset of the Zerion response we actually consume.
// Full schema: https://developers.zerion.io/reference/listwalletpositions
// =========================================================================

interface ZerionImplementation {
  chain_id: string;
  address: string | null;
  decimals: number;
}

interface ZerionFungibleInfo {
  name: string;
  symbol: string;
  description: string | null;
  icon: { url: string | null } | null;
  flags?: { verified?: boolean };
  implementations: ZerionImplementation[];
}

interface ZerionPosition {
  type: 'positions';
  id: string;
  attributes: {
    name: string;
    quantity: {
      int: string;
      decimals: number;
      float: number;
      numeric: string;
    };
    value: number | null;
    price: number | null;
    /** "wallet" for held tokens, "deposit"/"loan"/etc. for protocol positions */
    position_type: string;
    fungible_info: ZerionFungibleInfo;
    flags?: { displayable?: boolean; is_trash?: boolean };
  };
  relationships: {
    chain: { data: { type: 'chains'; id: string } };
  };
}

interface ZerionPositionsResponse {
  data: ZerionPosition[];
  links?: { next?: string };
}

// =========================================================================
// Normalized output — what we hand to wallet-holdings.
// =========================================================================

export interface ZerionNormalizedHolding {
  /** Zerion chain id ("ethereum", "arbitrum", "base", "optimism", "polygon", "bitcoin", "solana", ...) */
  chainId: string;
  /** Lowercased contract address, or "native" for native gas tokens. */
  contractAddress: string | null;
  symbol: string;
  name: string;
  decimals: number;
  /** Human-readable token quantity. */
  balanceFormatted: number;
  /** Live USD price reported by Zerion. */
  priceUsd: number | null;
  /** Pre-computed USD value (priceUsd × balance). */
  usdValue: number | null;
  /** Zerion's own trash/displayable flag — useful for spam detection. */
  isTrash: boolean;
  /** Zerion verification flag. */
  isVerified: boolean;
  /** "wallet" for plain-held tokens, others for DeFi protocol positions. */
  positionType: string;
}

export interface ZerionScanResult {
  holdings: ZerionNormalizedHolding[];
  /** Total positions value reported by Zerion (sum of holdings + DeFi value). */
  totalUsdValue: number;
  /** Per-chain map of total USD held. */
  byChain: Record<string, number>;
}

// =========================================================================
// Mapping: Zerion chain ids → our chainSlug strings.
//
// Zerion uses lowercase short names. We use the same slug convention as the
// rest of the dApp (chains.ts). Only the 5 EVM chains we already model are
// mapped here — anything else (Solana, Tezos, etc.) gets passed through as
// the raw Zerion id so it shows up in the wallet section but doesn't
// confuse downstream code that expects a specific chain.
// =========================================================================

const ZERION_CHAIN_TO_SLUG: Record<string, string> = {
  ethereum: 'ethereum-mainnet',
  arbitrum: 'arbitrum-one',
  base: 'base',
  optimism: 'optimism',
  'polygon-pos': 'polygon',
  polygon: 'polygon',
  bitcoin: 'bitcoin',
  solana: 'solana',
};

export function zerionChainToSlug(chainId: string): string {
  return ZERION_CHAIN_TO_SLUG[chainId] ?? chainId;
}

// =========================================================================
// Client
// =========================================================================

const ZERION_BASE = 'https://api.zerion.io/v1';

export class ZerionClient {
  constructor(private apiKey: string) {}

  private authHeader(): string {
    // Zerion uses HTTP Basic with the API key as username, empty password.
    const token = Buffer.from(`${this.apiKey}:`).toString('base64');
    return `Basic ${token}`;
  }

  /**
   * Fetch all wallet positions across every chain Zerion indexes.
   *
   * Filters: position_type=wallet drops protocol positions (deposit/loan/etc.)
   * because we model those separately via Aave V3 reads. Adjust if you want
   * to include staked/lent positions as part of the "wallet" view.
   */
  async fetchPositions(address: string): Promise<ZerionPosition[]> {
    const url =
      `${ZERION_BASE}/wallets/${address.toLowerCase()}/positions/` +
      `?filter[positions]=only_simple` +
      `&currency=usd` +
      `&page[size]=100`;

    const all: ZerionPosition[] = [];
    let nextUrl: string | undefined = url;
    let hops = 0;

    while (nextUrl && hops < 5) {
      const res = await fetch(nextUrl, {
        headers: {
          Authorization: this.authHeader(),
          accept: 'application/json',
        },
        cache: 'no-store',
      });
      if (!res.ok) {
        throw new Error(`Zerion HTTP ${res.status}: ${await res.text().catch(() => '')}`);
      }
      const json = (await res.json()) as ZerionPositionsResponse;
      all.push(...json.data);
      nextUrl = json.links?.next;
      hops++;
    }
    return all;
  }

  /**
   * Convenience: fetch + normalize into the shape wallet-holdings consumes.
   */
  async scan(address: string): Promise<ZerionScanResult> {
    const positions = await this.fetchPositions(address);

    const holdings: ZerionNormalizedHolding[] = positions.map((p) => {
      const a = p.attributes;
      const chainId = p.relationships.chain.data.id;
      const impl = a.fungible_info.implementations.find(
        (i) => i.chain_id === chainId
      );
      // For native gas tokens, Zerion sometimes returns null address.
      const contract = impl?.address?.toLowerCase() ?? null;
      const decimals = impl?.decimals ?? a.quantity.decimals ?? 18;
      const balanceFormatted = Number.isFinite(a.quantity.float)
        ? a.quantity.float
        : Number(a.quantity.numeric);
      return {
        chainId,
        contractAddress: contract,
        symbol: a.fungible_info.symbol || '(unknown)',
        name: a.fungible_info.name || '',
        decimals,
        balanceFormatted,
        priceUsd: a.price ?? null,
        usdValue: a.value ?? null,
        isTrash: !!a.flags?.is_trash,
        isVerified: !!a.fungible_info.flags?.verified,
        positionType: a.position_type,
      };
    });

    const byChain: Record<string, number> = {};
    let totalUsdValue = 0;
    for (const h of holdings) {
      const v = h.usdValue ?? 0;
      totalUsdValue += v;
      byChain[h.chainId] = (byChain[h.chainId] ?? 0) + v;
    }

    return { holdings, totalUsdValue, byChain };
  }
}
