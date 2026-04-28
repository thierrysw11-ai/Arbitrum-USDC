/**
 * Multi-chain registry — Phase A enhanced edition.
 *
 * Single source of truth for every chain-specific value the dApp consumes:
 *   - Native USDC (Circle-issued, EIP-3009 enabled — NOT bridged variants)
 *   - Per-chain ERC-20 token registry (WETH, WBTC, DAI, USDT, LSDs, etc.)
 *   - Aave V3 contract addresses (Pool, AddressesProvider, DataProvider, Oracle)
 *   - Chainlink price feeds (per token, per chain — used by gas estimator
 *     and the markets overview's USD math)
 *   - Block explorer URL builders (tx, address, block, token)
 *   - viem chain object + default + env-overridable RPC URL
 *   - Subgraph URL env-var keys
 *   - x402 enablement flag (so the paywall UI hides on chains without
 *     facilitator funding)
 *   - UI metadata (brand color, logo path) for the chain switcher
 *   - Average block time (for tuning polling intervals + relative time labels)
 *
 * Adding a chain = filling in one new entry in CHAINS, deploying a USDC
 * subgraph for it, and setting the env vars on Vercel. Zero code changes
 * elsewhere once the rest of the codebase consumes this registry.
 *
 * VERIFICATION STATUS
 * ===================
 * Anything verified against the existing live deployment is marked
 * `// VERIFIED:`. Anything populated from official docs but not yet
 * cross-checked is marked `// VERIFY:` with a source URL. Tokens that
 * don't exist on a chain (e.g. rETH on Polygon) are simply omitted —
 * the `Partial<Record<>>` typing makes that safe.
 *
 * Sources for verification:
 *   - Aave V3:    https://aave.com/docs/resources/addresses
 *   - USDC:       https://developers.circle.com/stablecoins/usdc-on-main-networks
 *   - Chainlink:  https://docs.chain.link/data-feeds/price-feeds/addresses
 *   - Tokens:     https://github.com/aave/aave-address-book (per-chain TS exports)
 */

import type { Address, Chain } from 'viem';
import { isAddress } from 'viem';
import { arbitrum, base, optimism, polygon } from 'viem/chains';

// =========================================================================
// Types
// =========================================================================

/**
 * Slug for each supported chain. Used in URLs (`?chain=base`), env-var
 * lookups, and as a stable identifier in agent tool inputs.
 */
export type ChainSlug = 'arbitrum-one' | 'base' | 'optimism' | 'polygon';

/**
 * ERC-20 tokens this dApp knows about across all chains. Not every chain
 * has every token — `ChainConfig.tokens` uses `Partial<>` so a chain only
 * declares what it natively has.
 */
export type TokenSymbol =
  // Wrapped majors
  | 'WETH' | 'WBTC'
  // Stablecoins (USDC has its own dedicated config — these are the others)
  | 'DAI' | 'USDT'
  // Liquid staking derivatives
  | 'wstETH' | 'rETH' | 'cbETH'
  // Chain-native staking derivatives
  | 'stMATIC'
  // Coinbase-native BTC (Base)
  | 'cbBTC';

export interface NativeCurrency {
  name: string;
  /** Display symbol — "ETH" or "MATIC" (or "POL" if Polygon's rebrand has stuck). */
  symbol: string;
  decimals: number;
  /** Chainlink aggregator returning <native>/USD with 8 decimals. */
  chainlinkUsdFeed: Address;
}

export interface UsdcConfig {
  /** Circle-issued native USDC (NOT bridged USDC.e). Required for x402 (EIP-3009). */
  address: Address;
  decimals: number;
  /** EIP-712 domain `name`. Almost always "USD Coin". */
  domainName: string;
  /**
   * EIP-712 domain `version`. Differs across chains — bridged USDC.e on
   * Polygon is "1"; native USDC across all four supported chains is "2".
   */
  domainVersion: string;
}

export interface TokenConfig {
  address: Address;
  decimals: number;
  /**
   * Chainlink <token>/USD feed on this chain. `undefined` if no direct
   * USD feed exists (some LSDs only expose <token>/ETH rate feeds, in
   * which case callers must compose with the chain's ETH/USD feed).
   */
  chainlinkUsdFeed?: Address;
}

export interface AaveV3Addresses {
  /** Core lending Pool. All `getUserAccountData`, `getReserveData` reads target this. */
  pool: Address;
  /** Registry — useful for discovering the other Aave contracts dynamically. */
  poolAddressesProvider: Address;
  /** Per-asset stats helper (aToken/debtToken addresses, indices, rates). */
  dataProvider: Address;
  /** Oracle aggregator — `getAssetPrice(asset)` returns USD price (8 decimals). */
  oracle: Address;
}

export interface X402Config {
  /**
   * Whether the paywalled premium-analysis endpoint accepts payment on this
   * chain. Currently requires that the facilitator wallet hold a small ETH
   * balance on the chain to pay gas. Flip to `true` once funded.
   */
  enabled: boolean;
  /**
   * Address that receives x402 payments. Optional — if absent, falls back
   * to the global `X402_RECEIVER_ADDRESS` env var.
   */
  receiverAddress?: Address;
}

export interface UiConfig {
  /** Primary brand color for the chain switcher pill / accent. Hex. */
  primaryColor: string;
  /**
   * Path to a 32×32 chain logo SVG under /public/chain-icons/. Files must
   * be added separately — listed in the per-chain entries below.
   */
  iconPath: string;
}

export interface ChainConfig {
  // ─── Identity ────────────────────────────────────────────────────────
  chainId: number;
  slug: ChainSlug;
  /** Human-readable name for UI. */
  displayName: string;
  /** viem chain object, for instantiating PublicClient / WalletClient. */
  viemChain: Chain;
  /** Average wall-clock seconds per block. Used for polling intervals + UI labels. */
  avgBlockTimeSeconds: number;

  // ─── Network endpoints ──────────────────────────────────────────────
  /** Public RPC fallback. Always works but rate-limited. */
  defaultRpcUrl: string;
  /** Env var name that overrides defaultRpcUrl. NEXT_PUBLIC_ prefix => browser-readable. */
  rpcEnvVar: string;
  /** Block explorer base URL (no trailing slash). */
  explorerBaseUrl: string;

  // ─── Tokens ─────────────────────────────────────────────────────────
  nativeCurrency: NativeCurrency;
  usdc: UsdcConfig;
  /**
   * ERC-20 tokens that exist natively on this chain. Components iterating
   * Aave reserves should look up token metadata + price feeds here.
   */
  tokens: Partial<Record<TokenSymbol, TokenConfig>>;

  // ─── Protocol addresses ─────────────────────────────────────────────
  aaveV3: AaveV3Addresses;

  // ─── Subgraphs ──────────────────────────────────────────────────────
  subgraphs: {
    usdcEnvVar: string;
    aaveEnvVar: string;
  };

  // ─── x402 (agentic payments) ────────────────────────────────────────
  x402: X402Config;

  // ─── UI ─────────────────────────────────────────────────────────────
  ui: UiConfig;
}

// =========================================================================
// Per-chain configs
// =========================================================================

/**
 * Arbitrum One (chainId 42161). Production chain — addresses verified against
 * the live deployment.
 */
const ARBITRUM_ONE: ChainConfig = {
  chainId: 42161,
  slug: 'arbitrum-one',
  displayName: 'Arbitrum One',
  viemChain: arbitrum,
  avgBlockTimeSeconds: 0.25,

  defaultRpcUrl: 'https://arb1.arbitrum.io/rpc',
  rpcEnvVar: 'NEXT_PUBLIC_ARBITRUM_RPC_URL',
  explorerBaseUrl: 'https://arbiscan.io',

  nativeCurrency: {
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18,
    // VERIFIED: existing code (SendUSDC.tsx).
    chainlinkUsdFeed: '0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612',
  },

  usdc: {
    // VERIFIED: existing code (x402/networks.ts).
    address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    decimals: 6,
    domainName: 'USD Coin',
    domainVersion: '2',
  },

  tokens: {
    WETH: {
      // VERIFIED: WETH9 on Arbitrum.
      address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
      decimals: 18,
      chainlinkUsdFeed: '0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612', // same as native ETH
    },
    WBTC: {
      // VERIFY: https://github.com/aave/aave-address-book
      address: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f',
      decimals: 8,
      // VERIFY: BTC/USD on Arbitrum.
      chainlinkUsdFeed: '0x6ce185860a4963106506C203335A2910413708e9',
    },
    DAI: {
      // VERIFY: DAI on Arbitrum.
      address: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
      decimals: 18,
      // VERIFY: DAI/USD on Arbitrum.
      chainlinkUsdFeed: '0xc5C8E77B397E531B8EC06BFb0048328B30E9eCfB',
    },
    USDT: {
      // VERIFY: USDT on Arbitrum.
      address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
      decimals: 6,
      // VERIFY: USDT/USD on Arbitrum.
      chainlinkUsdFeed: '0x3f3f5dF88dC9F13eac63DF89EC16ef6e7E25DdE7',
    },
    wstETH: {
      // VERIFY: wstETH on Arbitrum.
      address: '0x5979D7b546E38E414F7E9822514be443A4800529',
      decimals: 18,
      // No direct wstETH/USD feed on Arbitrum — only wstETH/ETH rate feed at
      // 0xb523AE262D20A936BC152e6023996e46FDC2A95D. Compose with ETH/USD.
      chainlinkUsdFeed: undefined,
    },
    rETH: {
      // VERIFY: rETH on Arbitrum.
      address: '0xEC70Dcb4A1EFa46b8F2D97C310C9c4790ba5ffA8',
      decimals: 18,
      chainlinkUsdFeed: undefined, // rate-only feed, compose with ETH/USD
    },
  },

  aaveV3: {
    // VERIFIED: existing code (lib/aave/addresses.ts).
    pool: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
    poolAddressesProvider: '0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb',
    dataProvider: '0x69FA688f1Dc47d4B5d8029D5a35FB7a548310654',
    oracle: '0xb56c2F0B653B2e0b10C9b928C8580Ac5Df02C7C7',
  },

  subgraphs: {
    usdcEnvVar: 'NEXT_PUBLIC_USDC_SUBGRAPH_URL',
    aaveEnvVar: 'NEXT_PUBLIC_AAVE_SUBGRAPH_URL',
  },

  x402: {
    // x402 is live on Arbitrum — facilitator wallet funded.
    enabled: true,
    // Falls back to env X402_RECEIVER_ADDRESS if undefined.
    receiverAddress: undefined,
  },

  ui: {
    primaryColor: '#28A0F0', // Arbitrum blue
    iconPath: '/chain-icons/arbitrum.svg',
  },
};

/**
 * Base (chainId 8453). Coinbase's L2. Aave V3 deployed Aug 2024.
 *
 * Aave on Base uses a DIFFERENT Pool address than the
 * Arbitrum/OP/Polygon "shared" deployment. Don't assume cross-chain identity.
 */
const BASE: ChainConfig = {
  chainId: 8453,
  slug: 'base',
  displayName: 'Base',
  viemChain: base,
  avgBlockTimeSeconds: 2,

  defaultRpcUrl: 'https://mainnet.base.org',
  rpcEnvVar: 'NEXT_PUBLIC_BASE_RPC_URL',
  explorerBaseUrl: 'https://basescan.org',

  nativeCurrency: {
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18,
    // VERIFIED: Chainlink ETH/USD standard proxy on Base.
    chainlinkUsdFeed: '0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70',
  },

  usdc: {
    // VERIFIED: existing code (x402/networks.ts) — Circle's native USDC on Base.
    // DO NOT use 0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA — that's USDbC (Coinbase-bridged), being deprecated.
    address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    decimals: 6,
    domainName: 'USD Coin',
    domainVersion: '2',
  },

  tokens: {
    WETH: {
      // VERIFIED: canonical OP-stack WETH on Base.
      address: '0x4200000000000000000000000000000000000006',
      decimals: 18,
      chainlinkUsdFeed: '0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70', // same as native
    },
    cbBTC: {
      // VERIFY: cbBTC (Coinbase's native BTC) on Base — primary BTC asset on Base Aave.
      address: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf',
      decimals: 8,
      // VERIFY: cbBTC/USD on Base.
      chainlinkUsdFeed: undefined,
    },
    DAI: {
      // VERIFY: DAI on Base.
      address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb',
      decimals: 18,
      chainlinkUsdFeed: undefined, // VERIFY: DAI/USD feed on Base.
    },
    wstETH: {
      // VERIFY: wstETH on Base.
      address: '0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452',
      decimals: 18,
      chainlinkUsdFeed: undefined,
    },
    cbETH: {
      // VERIFY: cbETH on Base.
      address: '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22',
      decimals: 18,
      chainlinkUsdFeed: undefined,
    },
    // USDT not natively on Base — bridged versions exist but skip for now.
  },

  aaveV3: {
    // VERIFIED: bgd-labs/aave-address-book (canonical) + BaseScan labels.
    // Base uses a separate Aave deployment from Arb/OP/Polygon — Pool and
    // DataProvider addresses are unique to Base.
    pool: '0xA238Dd80C259a72e81d7e4664a9801593F98d1c5',
    poolAddressesProvider: '0xe20fCBdBfFC4Dd138cE8b2E6FBb6CB49777ad64D',
    dataProvider: '0x0F43731EB8d45A581f4a36DD74F5f358bc90C73A',
    oracle: '0x2Cc0Fc26eD4563A5ce5e8bdcfe1A2878676Ae156',
  },

  subgraphs: {
    usdcEnvVar: 'NEXT_PUBLIC_USDC_SUBGRAPH_URL_BASE',
    aaveEnvVar: 'NEXT_PUBLIC_AAVE_SUBGRAPH_URL_BASE',
  },

  x402: {
    // x402 is live on Base — facilitator wallet funded (per existing networks.ts).
    enabled: true,
    receiverAddress: undefined,
  },

  ui: {
    primaryColor: '#0052FF', // Coinbase blue
    iconPath: '/chain-icons/base.svg',
  },
};

/**
 * Optimism (chainId 10). The original OP Stack rollup. Aave V3 deployed
 * March 2022 — long history, deep liquidity.
 */
const OPTIMISM: ChainConfig = {
  chainId: 10,
  slug: 'optimism',
  displayName: 'Optimism',
  viemChain: optimism,
  avgBlockTimeSeconds: 2,

  defaultRpcUrl: 'https://mainnet.optimism.io',
  rpcEnvVar: 'NEXT_PUBLIC_OPTIMISM_RPC_URL',
  explorerBaseUrl: 'https://optimistic.etherscan.io',

  nativeCurrency: {
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18,
    // VERIFIED: Chainlink ETH/USD EACAggregatorProxy on Optimism.
    chainlinkUsdFeed: '0x13e3Ee699D1909E989722E753853AE30b17e08c5',
  },

  usdc: {
    // VERIFIED: Circle's native USDC on Optimism.
    // DO NOT use 0x7F5c764cBc14f9669B88837ca1490cCa17c31607 — bridged USDC.e.
    address: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
    decimals: 6,
    domainName: 'USD Coin',
    domainVersion: '2',
  },

  tokens: {
    WETH: {
      // VERIFIED: canonical OP-stack WETH on Optimism.
      address: '0x4200000000000000000000000000000000000006',
      decimals: 18,
      chainlinkUsdFeed: '0x13e3Ee699D1909E989722E753853AE30b17e08c5',
    },
    WBTC: {
      // VERIFY: WBTC on OP.
      address: '0x68f180fcCe6836688e9084f035309E29Bf0A2095',
      decimals: 8,
      chainlinkUsdFeed: undefined, // VERIFY: BTC/USD feed on OP.
    },
    DAI: {
      // VERIFY: DAI on OP.
      address: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
      decimals: 18,
      chainlinkUsdFeed: undefined,
    },
    USDT: {
      // VERIFY: USDT on OP.
      address: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58',
      decimals: 6,
      chainlinkUsdFeed: undefined,
    },
    wstETH: {
      // VERIFY: wstETH on OP.
      address: '0x1F32b1c2345538c0c6f582fCB022739c4A194Ebb',
      decimals: 18,
      chainlinkUsdFeed: undefined,
    },
    rETH: {
      // VERIFY: rETH on OP.
      address: '0x9Bcef72be871e61ED4fBbc7630889beE758eb81D',
      decimals: 18,
      chainlinkUsdFeed: undefined,
    },
  },

  aaveV3: {
    // VERIFIED: bgd-labs/aave-address-book + Etherscan-style explorer labels.
    // OP shares Pool, AddressesProvider, *and* DataProvider with Arbitrum and
    // Polygon (CREATE2-deterministic). Only the Oracle is chain-specific.
    pool: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
    poolAddressesProvider: '0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb',
    dataProvider: '0x69FA688f1Dc47d4B5d8029D5a35FB7a548310654',
    oracle: '0xD81eb3728a631871a7eBBaD631b5f424909f0c77',
  },

  subgraphs: {
    usdcEnvVar: 'NEXT_PUBLIC_USDC_SUBGRAPH_URL_OPTIMISM',
    aaveEnvVar: 'NEXT_PUBLIC_AAVE_SUBGRAPH_URL_OPTIMISM',
  },

  x402: {
    // Not yet enabled — facilitator wallet needs ETH funding on OP.
    enabled: false,
    receiverAddress: undefined,
  },

  ui: {
    primaryColor: '#FF0420', // Optimism red
    iconPath: '/chain-icons/optimism.svg',
  },
};

/**
 * Polygon PoS (chainId 137). Long-running EVM-equivalent chain, Aave V3
 * since launch. Different gas token (MATIC/POL).
 */
const POLYGON: ChainConfig = {
  chainId: 137,
  slug: 'polygon',
  displayName: 'Polygon',
  viemChain: polygon,
  avgBlockTimeSeconds: 2.2,

  defaultRpcUrl: 'https://polygon-rpc.com',
  rpcEnvVar: 'NEXT_PUBLIC_POLYGON_RPC_URL',
  explorerBaseUrl: 'https://polygonscan.com',

  nativeCurrency: {
    name: 'Matic',
    symbol: 'MATIC',
    decimals: 18,
    // VERIFIED: Chainlink MATIC/USD proxy on Polygon.
    chainlinkUsdFeed: '0xAB594600376Ec9fD91F8e885dADF0CE036862dE0',
  },

  usdc: {
    // VERIFIED: Circle's NATIVE USDC on Polygon.
    // DO NOT use 0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174 — bridged USDC.e.
    address: '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359',
    decimals: 6,
    domainName: 'USD Coin',
    domainVersion: '2',
  },

  tokens: {
    WETH: {
      // VERIFY: WETH on Polygon (NOT canonical 0x4200... — Polygon isn't OP-stack).
      address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
      decimals: 18,
      // VERIFIED: Chainlink ETH/USD proxy on Polygon (separate from MATIC/USD).
      chainlinkUsdFeed: '0xF9680D99D6C9589e2a93a78A04A279e509205945',
    },
    WBTC: {
      // VERIFY: WBTC on Polygon.
      address: '0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6',
      decimals: 8,
      chainlinkUsdFeed: undefined,
    },
    DAI: {
      // VERIFY: DAI on Polygon.
      address: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063',
      decimals: 18,
      chainlinkUsdFeed: undefined,
    },
    USDT: {
      // VERIFY: USDT on Polygon.
      address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
      decimals: 6,
      chainlinkUsdFeed: undefined,
    },
    wstETH: {
      // VERIFY: wstETH on Polygon.
      address: '0x03b54A6e9a984069379fae1a4fC4dBAE93B3bCCD',
      decimals: 18,
      chainlinkUsdFeed: undefined,
    },
    stMATIC: {
      // VERIFY: stMATIC on Polygon — staking derivative of MATIC.
      address: '0x3A58a54C066FdC0f2D55FC9C89F0415C92eBf3C4',
      decimals: 18,
      chainlinkUsdFeed: undefined,
    },
  },

  aaveV3: {
    // VERIFIED: bgd-labs/aave-address-book + Etherscan-style explorer labels.
    // Polygon shares Pool, AddressesProvider, and DataProvider with
    // Arbitrum/Optimism (CREATE2-deterministic).
    pool: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
    poolAddressesProvider: '0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb',
    dataProvider: '0x69FA688f1Dc47d4B5d8029D5a35FB7a548310654',
    oracle: '0xb023e699F5a33916Ea823A16485e259257cA8Bd1',
  },

  subgraphs: {
    usdcEnvVar: 'NEXT_PUBLIC_USDC_SUBGRAPH_URL_POLYGON',
    aaveEnvVar: 'NEXT_PUBLIC_AAVE_SUBGRAPH_URL_POLYGON',
  },

  x402: {
    // Not yet enabled — facilitator wallet needs MATIC funding on Polygon.
    enabled: false,
    receiverAddress: undefined,
  },

  ui: {
    primaryColor: '#8247E5', // Polygon purple
    iconPath: '/chain-icons/polygon.svg',
  },
};

// =========================================================================
// Registry
// =========================================================================

/**
 * Master registry, keyed by chain ID. Use `getChain(chainId)` rather than
 * direct lookup so the failure mode is a typed `undefined` rather than a
 * silent runtime error.
 */
export const CHAINS: Record<number, ChainConfig> = {
  [ARBITRUM_ONE.chainId]: ARBITRUM_ONE,
  [BASE.chainId]: BASE,
  [OPTIMISM.chainId]: OPTIMISM,
  [POLYGON.chainId]: POLYGON,
};

/**
 * Convenience map by slug — useful when chain comes from a URL param like
 * `/portfolio?chain=base`.
 */
export const CHAINS_BY_SLUG: Record<ChainSlug, ChainConfig> = {
  'arbitrum-one': ARBITRUM_ONE,
  base: BASE,
  optimism: OPTIMISM,
  polygon: POLYGON,
};

/** Default chain — preserves current Arbitrum-only behavior at boot. */
export const DEFAULT_CHAIN: ChainConfig = ARBITRUM_ONE;

export const SUPPORTED_CHAIN_IDS: number[] = Object.keys(CHAINS).map(Number);

export const SUPPORTED_CHAINS: ChainConfig[] = Object.values(CHAINS);

// =========================================================================
// Helpers
// =========================================================================

/**
 * Look up a chain by ID. Returns `undefined` if unsupported — callers must
 * handle that case (typically by falling back to DEFAULT_CHAIN with a UI toast).
 */
export function getChain(chainId: number): ChainConfig | undefined {
  return CHAINS[chainId];
}

/** Look up by slug. Use for URL-driven entry points (`?chain=base`). */
export function getChainBySlug(slug: string): ChainConfig | undefined {
  if (!isChainSlug(slug)) return undefined;
  return CHAINS_BY_SLUG[slug];
}

/** Type guard for narrowing arbitrary strings to ChainSlug. */
export function isChainSlug(s: string): s is ChainSlug {
  return s in CHAINS_BY_SLUG;
}

/** Filter helper for "is this chain ID one we know about?". */
export function isSupportedChainId(chainId: number): boolean {
  return chainId in CHAINS;
}

/**
 * wagmi-friendly: takes whatever chainId wagmi reports (or undefined when
 * disconnected) and returns a guaranteed ChainConfig. Falls back to default.
 */
export function getChainFromWagmi(chainId: number | undefined): ChainConfig {
  return getChain(chainId ?? DEFAULT_CHAIN.chainId) ?? DEFAULT_CHAIN;
}

/**
 * Look up a token's config on a given chain. Returns `undefined` if the
 * chain doesn't have that token natively — components should render a
 * fallback (e.g. "—" or hide the asset row) rather than throwing.
 */
export function getToken(
  chain: ChainConfig,
  symbol: TokenSymbol,
): TokenConfig | undefined {
  return chain.tokens[symbol];
}

// ─── Explorer URL builders ───────────────────────────────────────────────

export function explorerTxUrl(chain: ChainConfig, hash: string): string {
  return `${chain.explorerBaseUrl}/tx/${hash}`;
}

export function explorerAddressUrl(chain: ChainConfig, address: string): string {
  return `${chain.explorerBaseUrl}/address/${address}`;
}

export function explorerBlockUrl(chain: ChainConfig, blockNumber: number | bigint): string {
  return `${chain.explorerBaseUrl}/block/${blockNumber}`;
}

export function explorerTokenUrl(chain: ChainConfig, tokenAddress: string): string {
  return `${chain.explorerBaseUrl}/token/${tokenAddress}`;
}

// ─── Env-driven URL accessors ────────────────────────────────────────────

/**
 * Read this chain's RPC URL from env, falling back to the public default.
 * Server-side routes that need a private RPC should prefer the unprefixed
 * `ARBITRUM_RPC_URL` / `BASE_RPC_URL` etc. — the NEXT_PUBLIC_ values here
 * are intended for the browser.
 */
export function getRpcUrl(chain: ChainConfig): string {
  const fromEnv = process.env[chain.rpcEnvVar];
  return fromEnv && fromEnv.length > 0 ? fromEnv : chain.defaultRpcUrl;
}

/**
 * Read this chain's USDC subgraph URL. Returns `undefined` if not configured —
 * callers should display a "subgraph not configured for this chain yet"
 * empty state rather than throwing.
 */
export function getUsdcSubgraphUrl(chain: ChainConfig): string | undefined {
  const url = process.env[chain.subgraphs.usdcEnvVar];
  return url && url.length > 0 ? url : undefined;
}

export function getAaveSubgraphUrl(chain: ChainConfig): string | undefined {
  const url = process.env[chain.subgraphs.aaveEnvVar];
  return url && url.length > 0 ? url : undefined;
}

// ─── Polling-interval helper ─────────────────────────────────────────────

/**
 * Compute a sensible poll interval for the given chain. Faster chains
 * (Arbitrum: 4 blocks/sec) tolerate shorter intervals; slower chains
 * (Polygon: ~2s/block) don't benefit from sub-2s polls.
 *
 * Returns milliseconds. Cap at 60s to avoid silly long polls; floor at
 * 5s to avoid hammering RPCs.
 */
export function suggestedPollIntervalMs(
  chain: ChainConfig,
  blocksPerPoll = 30,
): number {
  const targetSeconds = chain.avgBlockTimeSeconds * blocksPerPoll;
  return Math.max(5_000, Math.min(60_000, Math.round(targetSeconds * 1000)));
}

// =========================================================================
// Validation
// =========================================================================

/**
 * Walk every entry in CHAINS and assert that every address is well-formed
 * (passes viem's `isAddress`). Catches typos and copy-paste errors at boot
 * rather than at the moment a user tries to interact with a broken chain.
 *
 * Call once during app startup (e.g. inside Providers). Throws with a
 * descriptive message identifying the offending chain + field on first
 * failure.
 */
export function validateRegistry(): void {
  const errors: string[] = [];

  const checkAddr = (label: string, addr: string | undefined) => {
    if (addr === undefined) return; // optional fields are allowed to be absent
    if (!isAddress(addr)) {
      errors.push(`${label}: '${addr}' is not a valid Ethereum address`);
    }
  };

  for (const chain of SUPPORTED_CHAINS) {
    const ctx = `[${chain.slug}]`;

    checkAddr(`${ctx} nativeCurrency.chainlinkUsdFeed`, chain.nativeCurrency.chainlinkUsdFeed);
    checkAddr(`${ctx} usdc.address`, chain.usdc.address);

    for (const [symbol, token] of Object.entries(chain.tokens)) {
      if (!token) continue;
      checkAddr(`${ctx} tokens.${symbol}.address`, token.address);
      checkAddr(`${ctx} tokens.${symbol}.chainlinkUsdFeed`, token.chainlinkUsdFeed);
    }

    checkAddr(`${ctx} aaveV3.pool`, chain.aaveV3.pool);
    checkAddr(`${ctx} aaveV3.poolAddressesProvider`, chain.aaveV3.poolAddressesProvider);
    checkAddr(`${ctx} aaveV3.dataProvider`, chain.aaveV3.dataProvider);
    checkAddr(`${ctx} aaveV3.oracle`, chain.aaveV3.oracle);

    checkAddr(`${ctx} x402.receiverAddress`, chain.x402.receiverAddress);
  }

  if (errors.length > 0) {
    throw new Error(
      `chains.ts registry validation failed:\n  - ${errors.join('\n  - ')}`,
    );
  }
}
