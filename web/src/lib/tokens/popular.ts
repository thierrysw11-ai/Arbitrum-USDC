/**
 * Hand-curated registry of popular tokens across the 5 supported chains.
 * Used by the TokenPicker to populate the Send page's selection list.
 *
 * Inclusion criteria, in order of priority:
 *   1. Native gas tokens (ETH on rollups, MATIC on Polygon)
 *   2. Major stablecoins (USDC native, USDT, DAI)
 *   3. Wrapped majors (WETH, WBTC / cbBTC)
 *   4. Liquid staking + restaking blue chips (wstETH, rETH, weETH, cbETH)
 *   5. Chain-native governance tokens (ARB, OP, MATIC, AERO, VELO)
 *   6. DeFi blue chips (AAVE, LINK, UNI, CRV, etc.)
 *
 * For each chain we aim for ~10–15 entries — enough to cover what most
 * users hold without overwhelming the picker. Long-tail tokens are
 * still sendable via the "paste any contract address" custom path in
 * the picker UI.
 *
 * IMPORTANT: addresses must match the canonical contract on the listed
 * chain. Specifically:
 *   - USDC entries are Circle's NATIVE issuance (NOT bridged USDC.e).
 *   - On Polygon, MATIC is native; WMATIC has its own contract.
 *   - On L2s, native ETH lives at the canonical 0x4200...0006 WETH wrap;
 *     "ETH" entries here have address: null and are sent via
 *     useSendTransaction (not transfer()).
 */

export interface PopularToken {
  symbol: string;
  name: string;
  /**
   * Contract address. `null` means this is the chain's native gas token —
   * sent via wallet transfer (sendTransaction), not ERC-20 transfer.
   */
  address: `0x${string}` | null;
  decimals: number;
  chainId: number;
  chainSlug: string;
  /**
   * Optional logo URL. Skipping for v1 — token text is sufficient and
   * external CDN dependencies invite broken images.
   */
  logoUrl?: string;
}

// =========================================================================
// Per-chain entries
// =========================================================================

const ETHEREUM: PopularToken[] = [
  { symbol: 'ETH', name: 'Ether', address: null, decimals: 18, chainId: 1, chainSlug: 'ethereum-mainnet' },
  { symbol: 'WETH', name: 'Wrapped Ether', address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', decimals: 18, chainId: 1, chainSlug: 'ethereum-mainnet' },
  { symbol: 'WBTC', name: 'Wrapped BTC', address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', decimals: 8, chainId: 1, chainSlug: 'ethereum-mainnet' },
  { symbol: 'USDC', name: 'USD Coin', address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6, chainId: 1, chainSlug: 'ethereum-mainnet' },
  { symbol: 'USDT', name: 'Tether USD', address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6, chainId: 1, chainSlug: 'ethereum-mainnet' },
  { symbol: 'DAI', name: 'Dai Stablecoin', address: '0x6B175474E89094C44Da98b954EedeAC495271d0F', decimals: 18, chainId: 1, chainSlug: 'ethereum-mainnet' },
  { symbol: 'LINK', name: 'Chainlink', address: '0x514910771AF9Ca656af840dff83E8264EcF986CA', decimals: 18, chainId: 1, chainSlug: 'ethereum-mainnet' },
  { symbol: 'UNI', name: 'Uniswap', address: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984', decimals: 18, chainId: 1, chainSlug: 'ethereum-mainnet' },
  { symbol: 'AAVE', name: 'Aave', address: '0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9', decimals: 18, chainId: 1, chainSlug: 'ethereum-mainnet' },
  { symbol: 'MKR', name: 'Maker', address: '0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2', decimals: 18, chainId: 1, chainSlug: 'ethereum-mainnet' },
  { symbol: 'LDO', name: 'Lido DAO', address: '0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32', decimals: 18, chainId: 1, chainSlug: 'ethereum-mainnet' },
  { symbol: 'stETH', name: 'Lido Staked Ether', address: '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84', decimals: 18, chainId: 1, chainSlug: 'ethereum-mainnet' },
  { symbol: 'wstETH', name: 'Wrapped stETH', address: '0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0', decimals: 18, chainId: 1, chainSlug: 'ethereum-mainnet' },
  { symbol: 'weETH', name: 'ether.fi Wrapped eETH', address: '0xCd5fE23C85820F7B72D0926FC9b05b43E359b7ee', decimals: 18, chainId: 1, chainSlug: 'ethereum-mainnet' },
  { symbol: 'ENS', name: 'Ethereum Name Service', address: '0xC18360217D8F7Ab5e7c516566761Ea12Ce7F9D72', decimals: 18, chainId: 1, chainSlug: 'ethereum-mainnet' },
];

const ARBITRUM: PopularToken[] = [
  { symbol: 'ETH', name: 'Ether', address: null, decimals: 18, chainId: 42161, chainSlug: 'arbitrum-one' },
  { symbol: 'WETH', name: 'Wrapped Ether', address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', decimals: 18, chainId: 42161, chainSlug: 'arbitrum-one' },
  { symbol: 'WBTC', name: 'Wrapped BTC', address: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f', decimals: 8, chainId: 42161, chainSlug: 'arbitrum-one' },
  { symbol: 'USDC', name: 'USD Coin (native)', address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', decimals: 6, chainId: 42161, chainSlug: 'arbitrum-one' },
  { symbol: 'USDT', name: 'Tether USD', address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', decimals: 6, chainId: 42161, chainSlug: 'arbitrum-one' },
  { symbol: 'DAI', name: 'Dai Stablecoin', address: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1', decimals: 18, chainId: 42161, chainSlug: 'arbitrum-one' },
  { symbol: 'ARB', name: 'Arbitrum', address: '0x912CE59144191C1204E64559FE8253a0e49E6548', decimals: 18, chainId: 42161, chainSlug: 'arbitrum-one' },
  { symbol: 'LINK', name: 'Chainlink', address: '0xf97f4df75117a78c1A5a0DBb814Af92458539FB4', decimals: 18, chainId: 42161, chainSlug: 'arbitrum-one' },
  { symbol: 'AAVE', name: 'Aave', address: '0xba5DdD1f9d7F570dc94a51479a000E3BCE967196', decimals: 18, chainId: 42161, chainSlug: 'arbitrum-one' },
  { symbol: 'GMX', name: 'GMX', address: '0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a', decimals: 18, chainId: 42161, chainSlug: 'arbitrum-one' },
  { symbol: 'wstETH', name: 'Wrapped stETH', address: '0x5979D7b546E38E414F7E9822514be443A4800529', decimals: 18, chainId: 42161, chainSlug: 'arbitrum-one' },
  { symbol: 'rETH', name: 'Rocket Pool ETH', address: '0xEC70Dcb4A1EFa46b8F2D97C310C9c4790ba5ffA8', decimals: 18, chainId: 42161, chainSlug: 'arbitrum-one' },
  { symbol: 'weETH', name: 'ether.fi Wrapped eETH', address: '0x35751007a407ca6FEFfE80b3cB397736D2cf4dbe', decimals: 18, chainId: 42161, chainSlug: 'arbitrum-one' },
  { symbol: 'GHO', name: 'Aave Stablecoin', address: '0x7dfF72693f6A4149b17e7C6314655f6A9F7c8B33', decimals: 18, chainId: 42161, chainSlug: 'arbitrum-one' },
];

const BASE: PopularToken[] = [
  { symbol: 'ETH', name: 'Ether', address: null, decimals: 18, chainId: 8453, chainSlug: 'base' },
  { symbol: 'WETH', name: 'Wrapped Ether', address: '0x4200000000000000000000000000000000000006', decimals: 18, chainId: 8453, chainSlug: 'base' },
  { symbol: 'USDC', name: 'USD Coin (native)', address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6, chainId: 8453, chainSlug: 'base' },
  { symbol: 'DAI', name: 'Dai Stablecoin', address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', decimals: 18, chainId: 8453, chainSlug: 'base' },
  { symbol: 'cbETH', name: 'Coinbase Wrapped Staked ETH', address: '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22', decimals: 18, chainId: 8453, chainSlug: 'base' },
  { symbol: 'cbBTC', name: 'Coinbase Wrapped BTC', address: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf', decimals: 8, chainId: 8453, chainSlug: 'base' },
  { symbol: 'wstETH', name: 'Wrapped stETH', address: '0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452', decimals: 18, chainId: 8453, chainSlug: 'base' },
  { symbol: 'weETH', name: 'ether.fi Wrapped eETH', address: '0x04C0599Ae5A44757c0af6F9eC3b93da8976c150A', decimals: 18, chainId: 8453, chainSlug: 'base' },
  { symbol: 'AERO', name: 'Aerodrome', address: '0x940181a94A35A4569E4529A3CDfB74e38FD98631', decimals: 18, chainId: 8453, chainSlug: 'base' },
];

const OPTIMISM: PopularToken[] = [
  { symbol: 'ETH', name: 'Ether', address: null, decimals: 18, chainId: 10, chainSlug: 'optimism' },
  { symbol: 'WETH', name: 'Wrapped Ether', address: '0x4200000000000000000000000000000000000006', decimals: 18, chainId: 10, chainSlug: 'optimism' },
  { symbol: 'WBTC', name: 'Wrapped BTC', address: '0x68f180fcCe6836688e9084f035309E29Bf0A2095', decimals: 8, chainId: 10, chainSlug: 'optimism' },
  { symbol: 'USDC', name: 'USD Coin (native)', address: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', decimals: 6, chainId: 10, chainSlug: 'optimism' },
  { symbol: 'USDT', name: 'Tether USD', address: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58', decimals: 6, chainId: 10, chainSlug: 'optimism' },
  { symbol: 'DAI', name: 'Dai Stablecoin', address: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1', decimals: 18, chainId: 10, chainSlug: 'optimism' },
  { symbol: 'OP', name: 'Optimism', address: '0x4200000000000000000000000000000000000042', decimals: 18, chainId: 10, chainSlug: 'optimism' },
  { symbol: 'AAVE', name: 'Aave', address: '0x76FB31fb4af56892A25e32cFC43De717950c9278', decimals: 18, chainId: 10, chainSlug: 'optimism' },
  { symbol: 'LINK', name: 'Chainlink', address: '0x350a791Bfc2C21F9Ed5d10980Dad2e2638ffa7f6', decimals: 18, chainId: 10, chainSlug: 'optimism' },
  { symbol: 'wstETH', name: 'Wrapped stETH', address: '0x1F32b1c2345538c0c6f582fCB022739c4A194Ebb', decimals: 18, chainId: 10, chainSlug: 'optimism' },
  { symbol: 'rETH', name: 'Rocket Pool ETH', address: '0x9Bcef72be871e61ED4fBbc7630889beE758eb81D', decimals: 18, chainId: 10, chainSlug: 'optimism' },
  { symbol: 'VELO', name: 'Velodrome', address: '0x9560e827aF36c94D2Ac33a39bCE1Fe78631088Db', decimals: 18, chainId: 10, chainSlug: 'optimism' },
];

const POLYGON: PopularToken[] = [
  { symbol: 'MATIC', name: 'Polygon (native)', address: null, decimals: 18, chainId: 137, chainSlug: 'polygon' },
  { symbol: 'WMATIC', name: 'Wrapped Matic', address: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270', decimals: 18, chainId: 137, chainSlug: 'polygon' },
  { symbol: 'WETH', name: 'Wrapped Ether', address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619', decimals: 18, chainId: 137, chainSlug: 'polygon' },
  { symbol: 'WBTC', name: 'Wrapped BTC', address: '0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6', decimals: 8, chainId: 137, chainSlug: 'polygon' },
  { symbol: 'USDC', name: 'USD Coin (native)', address: '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359', decimals: 6, chainId: 137, chainSlug: 'polygon' },
  { symbol: 'USDT', name: 'Tether USD', address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', decimals: 6, chainId: 137, chainSlug: 'polygon' },
  { symbol: 'DAI', name: 'Dai Stablecoin', address: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063', decimals: 18, chainId: 137, chainSlug: 'polygon' },
  { symbol: 'AAVE', name: 'Aave', address: '0xD6DF932A45C0f255f85145f286eA0b292B21C90B', decimals: 18, chainId: 137, chainSlug: 'polygon' },
  { symbol: 'LINK', name: 'Chainlink', address: '0x53E0bca35eC356BD5ddDFebbD1Fc0fD03FaBad39', decimals: 18, chainId: 137, chainSlug: 'polygon' },
  { symbol: 'stMATIC', name: 'Lido Staked Matic', address: '0x3A58a54C066FdC0f2D55FC9C89F0415C92eBf3C4', decimals: 18, chainId: 137, chainSlug: 'polygon' },
];

// =========================================================================
// Combined registry + helpers
// =========================================================================

export const POPULAR_TOKENS: PopularToken[] = [
  ...ETHEREUM,
  ...ARBITRUM,
  ...BASE,
  ...OPTIMISM,
  ...POLYGON,
];

/** All tokens sendable from a given chain (native + ERC-20). */
export function tokensForChain(chainId: number): PopularToken[] {
  return POPULAR_TOKENS.filter((t) => t.chainId === chainId);
}

/** Look up a registered token by chain + contract address (case-insensitive). */
export function findTokenByAddress(
  chainId: number,
  address: string | null
): PopularToken | undefined {
  if (address === null) {
    return POPULAR_TOKENS.find((t) => t.chainId === chainId && t.address === null);
  }
  const lower = address.toLowerCase();
  return POPULAR_TOKENS.find(
    (t) => t.chainId === chainId && t.address?.toLowerCase() === lower
  );
}

/** Native gas-token entry for a chain, if registered. */
export function nativeTokenFor(chainId: number): PopularToken | undefined {
  return POPULAR_TOKENS.find((t) => t.chainId === chainId && t.address === null);
}

/**
 * Fuzzy filter for the picker UI. Matches symbol or name (case-insensitive),
 * returns within-chain results sorted by exact-prefix-match first.
 */
export function searchTokens(
  chainId: number,
  query: string
): PopularToken[] {
  const list = tokensForChain(chainId);
  const q = query.trim().toLowerCase();
  if (q === '') return list;
  const matches = list.filter(
    (t) =>
      t.symbol.toLowerCase().includes(q) ||
      t.name.toLowerCase().includes(q)
  );
  // Exact symbol-prefix matches surface first.
  matches.sort((a, b) => {
    const ap = a.symbol.toLowerCase().startsWith(q) ? 0 : 1;
    const bp = b.symbol.toLowerCase().startsWith(q) ? 0 : 1;
    return ap - bp;
  });
  return matches;
}

export const POPULAR_TOKEN_COUNT = POPULAR_TOKENS.length;
