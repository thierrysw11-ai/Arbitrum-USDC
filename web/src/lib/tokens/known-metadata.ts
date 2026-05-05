/**
 * Static metadata cache for the most common tokens across the 5 EVM
 * chains we scan. Keyed by `chainSlug:contractAddress` (lowercase).
 *
 * Why a static map: token symbol/name/decimals are immutable. Calling
 * `alchemy_getTokenMetadata` for USDC every time we scan a wallet wastes
 * 12 compute units on Alchemy. Whale wallets compound this (vitalik holds
 * dozens of well-known tokens). For every entry below, we save one RPC
 * call. For typical wallets, this drops metadata RPC calls 60–80%.
 *
 * Maintenance:
 *   - Addresses are lowercase. The lookup helper lowercases its input.
 *   - When in doubt about an address, prefer not to add it — the fallback
 *     path still calls Alchemy. Wrong metadata would show wrong symbols
 *     to the user, worse than an extra RPC call.
 */

interface KnownToken {
  symbol: string;
  name: string;
  decimals: number;
}

// =========================================================================
// The cache
// =========================================================================

const KNOWN_TOKENS: Record<string, KnownToken> = {
  // ─── Ethereum mainnet ──────────────────────────────────────────────
  // Stablecoins
  'ethereum-mainnet:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': { symbol: 'USDC', name: 'USD Coin', decimals: 6 },
  'ethereum-mainnet:0xdac17f958d2ee523a2206206994597c13d831ec7': { symbol: 'USDT', name: 'Tether USD', decimals: 6 },
  'ethereum-mainnet:0x6b175474e89094c44da98b954eedeac495271d0f': { symbol: 'DAI', name: 'Dai Stablecoin', decimals: 18 },
  'ethereum-mainnet:0x853d955acef822db058eb8505911ed77f175b99e': { symbol: 'FRAX', name: 'Frax', decimals: 18 },
  'ethereum-mainnet:0x6c3ea9036406852006290770bedfcaba0e23a0e8': { symbol: 'PYUSD', name: 'PayPal USD', decimals: 6 },
  'ethereum-mainnet:0x83f20f44975d03b1b09e64809b757c47f942beea': { symbol: 'sDAI', name: 'Savings DAI', decimals: 18 },
  'ethereum-mainnet:0x4c9edd5852cd905f086c759e8383e09bff1e68b3': { symbol: 'USDe', name: 'Ethena USDe', decimals: 18 },
  'ethereum-mainnet:0x9d39a5de30e57443bff2a8307a4256c8797a3497': { symbol: 'sUSDe', name: 'Staked USDe', decimals: 18 },
  'ethereum-mainnet:0x5f98805a4e8be255a32880fdec7f6728c6568ba0': { symbol: 'LUSD', name: 'Liquity USD', decimals: 18 },
  'ethereum-mainnet:0xf939e0a03fb07f59a73314e73794be0e57ac1b4e': { symbol: 'crvUSD', name: 'Curve USD', decimals: 18 },
  'ethereum-mainnet:0xdc035d45d973e3ec169d2276ddab16f1e407384f': { symbol: 'USDS', name: 'USDS Stablecoin', decimals: 18 },
  // Wrapped + LSTs
  'ethereum-mainnet:0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': { symbol: 'WETH', name: 'Wrapped Ether', decimals: 18 },
  'ethereum-mainnet:0x2260fac5e5542a773aa44fbcfedf7c193bc2c599': { symbol: 'WBTC', name: 'Wrapped BTC', decimals: 8 },
  'ethereum-mainnet:0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf': { symbol: 'cbBTC', name: 'Coinbase Wrapped BTC', decimals: 8 },
  'ethereum-mainnet:0x18084fba666a33d37592fa2633fd49a74dd93a88': { symbol: 'tBTC', name: 'tBTC', decimals: 18 },
  'ethereum-mainnet:0xae78736cd615f374d3085123a210448e74fc6393': { symbol: 'rETH', name: 'Rocket Pool ETH', decimals: 18 },
  'ethereum-mainnet:0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0': { symbol: 'wstETH', name: 'Wrapped liquid staked Ether 2.0', decimals: 18 },
  'ethereum-mainnet:0xae7ab96520de3a18e5e111b5eaab095312d7fe84': { symbol: 'stETH', name: 'Lido Staked ETH', decimals: 18 },
  'ethereum-mainnet:0xcd5fe23c85820f7b72d0926fc9b05b43e359b7ee': { symbol: 'weETH', name: 'Wrapped eETH', decimals: 18 },
  'ethereum-mainnet:0x35fa164735182de50811e8e2e824cfb9b6118ac2': { symbol: 'eETH', name: 'ether.fi ETH', decimals: 18 },
  'ethereum-mainnet:0xbe9895146f7af43049ca1c1ae358b0541ea49704': { symbol: 'cbETH', name: 'Coinbase Wrapped Staked ETH', decimals: 18 },
  // Governance / DeFi blue-chip
  'ethereum-mainnet:0x514910771af9ca656af840dff83e8264ecf986ca': { symbol: 'LINK', name: 'ChainLink Token', decimals: 18 },
  'ethereum-mainnet:0x1f9840a85d5af5bf1d1762f925bdaddc4201f984': { symbol: 'UNI', name: 'Uniswap', decimals: 18 },
  'ethereum-mainnet:0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9': { symbol: 'AAVE', name: 'Aave Token', decimals: 18 },
  'ethereum-mainnet:0xc944e90c64b2c07662a292be6244bdf05cda44a7': { symbol: 'GRT', name: 'Graph Token', decimals: 18 },
  'ethereum-mainnet:0xd533a949740bb3306d119cc777fa900ba034cd52': { symbol: 'CRV', name: 'Curve DAO Token', decimals: 18 },
  'ethereum-mainnet:0x4e3fbd56cd56c3e72c1403e103b45db9da5b9d2b': { symbol: 'CVX', name: 'Convex Token', decimals: 18 },
  'ethereum-mainnet:0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2': { symbol: 'MKR', name: 'Maker', decimals: 18 },
  'ethereum-mainnet:0x6810e776880c02933d47db1b9fc05908e5386b96': { symbol: 'GNO', name: 'Gnosis Token', decimals: 18 },
  'ethereum-mainnet:0x808507121b80c02388fad14726482e061b8da827': { symbol: 'PENDLE', name: 'Pendle', decimals: 18 },
  'ethereum-mainnet:0x5a98fcbea516cf06857215779fd812ca3bef1b32': { symbol: 'LDO', name: 'Lido DAO Token', decimals: 18 },
  'ethereum-mainnet:0x9ba00d6856a4edf4665bca2c2309936572473b7e': { symbol: 'aUSDC', name: 'Aave V2 USDC', decimals: 6 },
  'ethereum-mainnet:0x57e114b691db790c35207b2e685d4a43181e6061': { symbol: 'ENA', name: 'Ethena', decimals: 18 },
  'ethereum-mainnet:0x9ae380f0272e2162340a5bb646c354271c0f5cfc': { symbol: 'CNC', name: 'Conic Finance', decimals: 18 },
  'ethereum-mainnet:0x912ce59144191c1204e64559fe8253a0e49e6548': { symbol: 'ARB', name: 'Arbitrum (mainnet)', decimals: 18 },
  // Aave V3 mainnet aTokens (most common reserves)
  'ethereum-mainnet:0x98c23e9d8f34fefb1b7bd6a91b7ff122f4e16f5c': { symbol: 'aEthUSDC', name: 'Aave Ethereum USDC', decimals: 6 },
  'ethereum-mainnet:0x4d5f47fa6a74757f35c14fd3a6ef8e3c9bc514e8': { symbol: 'aEthWETH', name: 'Aave Ethereum WETH', decimals: 18 },
  'ethereum-mainnet:0x5ee5bf7ae06d1be5997a1a72006fe6c607ec6de8': { symbol: 'aEthWBTC', name: 'Aave Ethereum WBTC', decimals: 8 },
  'ethereum-mainnet:0x23878914efe38d27c4d67ab83ed1b93a74d4086a': { symbol: 'aEthUSDT', name: 'Aave Ethereum USDT', decimals: 6 },
  'ethereum-mainnet:0x018008bfb33d285247a21d44e50697654f754e63': { symbol: 'aEthDAI', name: 'Aave Ethereum DAI', decimals: 18 },

  // ─── Arbitrum One ──────────────────────────────────────────────────
  'arbitrum-one:0xaf88d065e77c8cc2239327c5edb3a432268e5831': { symbol: 'USDC', name: 'USD Coin', decimals: 6 },
  'arbitrum-one:0xff970a61a04b1ca14834a43f5de4533ebddb5cc8': { symbol: 'USDC.e', name: 'Bridged USDC', decimals: 6 },
  'arbitrum-one:0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9': { symbol: 'USDT', name: 'Tether USD', decimals: 6 },
  'arbitrum-one:0xda10009cbd5d07dd0cecc66161fc93d7c9000da1': { symbol: 'DAI', name: 'Dai Stablecoin', decimals: 18 },
  'arbitrum-one:0x82af49447d8a07e3bd95bd0d56f35241523fbab1': { symbol: 'WETH', name: 'Wrapped Ether', decimals: 18 },
  'arbitrum-one:0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f': { symbol: 'WBTC', name: 'Wrapped BTC', decimals: 8 },
  'arbitrum-one:0x912ce59144191c1204e64559fe8253a0e49e6548': { symbol: 'ARB', name: 'Arbitrum', decimals: 18 },
  'arbitrum-one:0xfa7f8980b0f1e64a2062791cc3b0871572f1f7f0': { symbol: 'UNI', name: 'Uniswap', decimals: 18 },
  'arbitrum-one:0xba5ddd1f9d7f570dc94a51479a000e3bce967196': { symbol: 'AAVE', name: 'Aave Token', decimals: 18 },
  'arbitrum-one:0xf97f4df75117a78c1a5a0dbb814af92458539fb4': { symbol: 'LINK', name: 'ChainLink Token', decimals: 18 },
  'arbitrum-one:0xfc5a1a6eb076a2c7ad06ed22c90d7e710e35ad0a': { symbol: 'GMX', name: 'GMX', decimals: 18 },
  'arbitrum-one:0x5979d7b546e38e414f7e9822514be443a4800529': { symbol: 'wstETH', name: 'Wrapped liquid staked Ether 2.0', decimals: 18 },
  'arbitrum-one:0x35751007a407ca6feffe80b3cb397736d2cf4dbe': { symbol: 'weETH', name: 'Wrapped eETH', decimals: 18 },
  'arbitrum-one:0xec70dcb4a1efa46b8f2d97c310c9c4790ba5ffa8': { symbol: 'rETH', name: 'Rocket Pool ETH', decimals: 18 },
  'arbitrum-one:0x0c880f6761f1af8d9aa9c466984b80dab9a8c9e8': { symbol: 'PENDLE', name: 'Pendle', decimals: 18 },
  'arbitrum-one:0x539bde0d7dbd336b79148aa742883198bbf60342': { symbol: 'MAGIC', name: 'Magic', decimals: 18 },
  // Aave V3 Arbitrum aTokens
  'arbitrum-one:0x724dc807b04555b71ed48a6896b6f41bb4be4e22': { symbol: 'aArbUSDCn', name: 'Aave Arb USDC', decimals: 6 },
  'arbitrum-one:0x625e7708f30ca75bfd92586e17077590c60eb4cd': { symbol: 'aArbUSDC', name: 'Aave Arb USDC.e', decimals: 6 },
  'arbitrum-one:0x6ab707aca953edaefbc4fd23ba73294241490620': { symbol: 'aArbUSDT', name: 'Aave Arb USDT', decimals: 6 },
  'arbitrum-one:0x82e64f49ed5ec1bc6e43dad4fc8af9bb724a1ca5': { symbol: 'aArbDAI', name: 'Aave Arb DAI', decimals: 18 },
  'arbitrum-one:0xe50fa9b3c56ffb159cb0fca61f5c9d750e8128c8': { symbol: 'aArbWETH', name: 'Aave Arb WETH', decimals: 18 },
  'arbitrum-one:0x078f358208685046a11c85e8ad32895ded33a249': { symbol: 'aArbWBTC', name: 'Aave Arb WBTC', decimals: 8 },
  'arbitrum-one:0x191c10aa4af7c30e871e70c95db0e4eb77237530': { symbol: 'aArbLINK', name: 'Aave Arb LINK', decimals: 18 },
  'arbitrum-one:0xf329e36c7bf6e5e86ce2150875a84ce77f477375': { symbol: 'aArbAAVE', name: 'Aave Arb AAVE', decimals: 18 },
  'arbitrum-one:0x6533afac2e7bccb20dca161449a13a32d391fb00': { symbol: 'aArbARB', name: 'Aave Arb ARB', decimals: 18 },
  'arbitrum-one:0x513c7e3a9c69ca3e22550ef58ac1c0088e918fff': { symbol: 'aArbwstETH', name: 'Aave Arb wstETH', decimals: 18 },

  // ─── Base ──────────────────────────────────────────────────────────
  'base:0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': { symbol: 'USDC', name: 'USD Coin', decimals: 6 },
  'base:0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca': { symbol: 'USDbC', name: 'Bridged USDC (Base)', decimals: 6 },
  'base:0xfde4c96c8593536e31f229ea8f37b2ada2699bb2': { symbol: 'USDT', name: 'Tether USD', decimals: 6 },
  'base:0x50c5725949a6f0c72e6c4a641f24049a917db0cb': { symbol: 'DAI', name: 'Dai Stablecoin', decimals: 18 },
  'base:0x4200000000000000000000000000000000000006': { symbol: 'WETH', name: 'Wrapped Ether', decimals: 18 },
  'base:0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf': { symbol: 'cbBTC', name: 'Coinbase Wrapped BTC', decimals: 8 },
  'base:0x2ae3f1ec7f1f5012cfeab0185bfc7aa3cf0dec22': { symbol: 'cbETH', name: 'Coinbase Wrapped Staked ETH', decimals: 18 },
  'base:0xc1cba3fcea344f92d9239c08c0568f6f2f0ee452': { symbol: 'wstETH', name: 'Wrapped liquid staked Ether 2.0', decimals: 18 },
  'base:0x940181a94a35a4569e4529a3cdfb74e38fd98631': { symbol: 'AERO', name: 'Aerodrome', decimals: 18 },
  'base:0x04c0599ae5a44757c0af6f9ec3b93da8976c150a': { symbol: 'weETH', name: 'Wrapped eETH', decimals: 18 },
  'base:0xa88594d404727625a9437c3f886c7643872296ae': { symbol: 'WELL', name: 'Moonwell', decimals: 18 },
  'base:0x60a3e35cc302bfa44cb288bc5a4f316fdb1adb42': { symbol: 'EURC', name: 'EURC', decimals: 6 },
  // Aave V3 Base aTokens
  'base:0x4e65fe4dba92790696d040ac24aa414708f5c0ab': { symbol: 'aBasUSDC', name: 'Aave Base USDC', decimals: 6 },
  'base:0xd4a0e0b9149bcee3c920d2e00b5de09138fd8bb7': { symbol: 'aBasWETH', name: 'Aave Base WETH', decimals: 18 },
  'base:0xbdb9300b7cde636d9cd4aff00f6f009ffbbc8ee6': { symbol: 'aBascbBTC', name: 'Aave Base cbBTC', decimals: 8 },
  'base:0xcc6346eaba1f1bf4ab5f2b5d6aa3b0a28d1e3b1b': { symbol: 'aBaswstETH', name: 'Aave Base wstETH', decimals: 18 },

  // ─── Optimism ──────────────────────────────────────────────────────
  'optimism:0x0b2c639c533813f4aa9d7837caf62653d097ff85': { symbol: 'USDC', name: 'USD Coin', decimals: 6 },
  'optimism:0x7f5c764cbc14f9669b88837ca1490cca17c31607': { symbol: 'USDC.e', name: 'Bridged USDC', decimals: 6 },
  'optimism:0x94b008aa00579c1307b0ef2c499ad98a8ce58e58': { symbol: 'USDT', name: 'Tether USD', decimals: 6 },
  'optimism:0xda10009cbd5d07dd0cecc66161fc93d7c9000da1': { symbol: 'DAI', name: 'Dai Stablecoin', decimals: 18 },
  'optimism:0x4200000000000000000000000000000000000006': { symbol: 'WETH', name: 'Wrapped Ether', decimals: 18 },
  'optimism:0x68f180fcce6836688e9084f035309e29bf0a2095': { symbol: 'WBTC', name: 'Wrapped BTC', decimals: 8 },
  'optimism:0x4200000000000000000000000000000000000042': { symbol: 'OP', name: 'Optimism', decimals: 18 },
  'optimism:0x350a791bfc2c21f9ed5d10980dad2e2638ffa7f6': { symbol: 'LINK', name: 'ChainLink Token', decimals: 18 },
  'optimism:0x76fb31fb4af56892a25e32cfc43de717950c9278': { symbol: 'AAVE', name: 'Aave Token', decimals: 18 },
  'optimism:0x1f32b1c2345538c0c6f582fcb022739c4a194ebb': { symbol: 'wstETH', name: 'Wrapped liquid staked Ether 2.0', decimals: 18 },
  'optimism:0x346e03f8cce9fe01dcb3d0da3e9d00dc2c0e08f0': { symbol: 'PENDLE', name: 'Pendle', decimals: 18 },
  // Aave V3 Optimism aTokens
  'optimism:0x38d693ce1df5aadf7bc62595a37d667ad57922e5': { symbol: 'aOptUSDC', name: 'Aave Opt USDC', decimals: 6 },
  'optimism:0xe50fa9b3c56ffb159cb0fca61f5c9d750e8128c8': { symbol: 'aOptWETH', name: 'Aave Opt WETH', decimals: 18 },
  'optimism:0x078f358208685046a11c85e8ad32895ded33a249': { symbol: 'aOptWBTC', name: 'Aave Opt WBTC', decimals: 8 },

  // ─── Polygon ───────────────────────────────────────────────────────
  'polygon:0x3c499c542cef5e3811e1192ce70d8cc03d5c3359': { symbol: 'USDC', name: 'USD Coin', decimals: 6 },
  'polygon:0x2791bca1f2de4661ed88a30c99a7a9449aa84174': { symbol: 'USDC.e', name: 'Bridged USDC', decimals: 6 },
  'polygon:0xc2132d05d31c914a87c6611c10748aeb04b58e8f': { symbol: 'USDT', name: 'Tether USD', decimals: 6 },
  'polygon:0x8f3cf7ad23cd3cadbd9735aff958023239c6a063': { symbol: 'DAI', name: 'Dai Stablecoin', decimals: 18 },
  'polygon:0x7ceb23fd6bc0add59e62ac25578270cff1b9f619': { symbol: 'WETH', name: 'Wrapped Ether', decimals: 18 },
  'polygon:0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6': { symbol: 'WBTC', name: 'Wrapped BTC', decimals: 8 },
  'polygon:0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270': { symbol: 'WPOL', name: 'Wrapped POL (formerly WMATIC)', decimals: 18 },
  'polygon:0xb33eaad8d922b1083446dc23f610c2567fb5180f': { symbol: 'UNI', name: 'Uniswap', decimals: 18 },
  'polygon:0xd6df932a45c0f255f85145f286ea0b292b21c90b': { symbol: 'AAVE', name: 'Aave Token', decimals: 18 },
  'polygon:0xb0b195aefa3650a6908f15cdac7d92f8a5791b0b': { symbol: 'BOB', name: 'BOB', decimals: 18 },
  'polygon:0x53e0bca35ec356bd5dddfebbd1fc0fd03fabad39': { symbol: 'LINK', name: 'ChainLink Token', decimals: 18 },
  'polygon:0xb747454f608928a82f9b39db4c5acdf3dbcb9b0c': { symbol: 'rETH', name: 'Rocket Pool ETH', decimals: 18 },
  'polygon:0x03b54a6e9a984069379fae1a4fc4dbae93b3bccd': { symbol: 'wstETH', name: 'Wrapped liquid staked Ether 2.0', decimals: 18 },
  // Aave V3 Polygon aTokens
  'polygon:0xa4d94019934d8333ef880abffbf2fdd611c762bd': { symbol: 'aPolUSDCn', name: 'Aave Pol USDC', decimals: 6 },
  'polygon:0x625e7708f30ca75bfd92586e17077590c60eb4cd': { symbol: 'aPolUSDC', name: 'Aave Pol USDC.e', decimals: 6 },
  'polygon:0x6ab707aca953edaefbc4fd23ba73294241490620': { symbol: 'aPolUSDT', name: 'Aave Pol USDT', decimals: 6 },
  'polygon:0xe50fa9b3c56ffb159cb0fca61f5c9d750e8128c8': { symbol: 'aPolWETH', name: 'Aave Pol WETH', decimals: 18 },
  'polygon:0x078f358208685046a11c85e8ad32895ded33a249': { symbol: 'aPolWBTC', name: 'Aave Pol WBTC', decimals: 8 },
};

// =========================================================================
// Lookup
// =========================================================================

/**
 * Returns a known-token entry if we have it cached, null otherwise.
 * Lookup is case-insensitive on the contract address.
 */
export function lookupKnownToken(
  chainSlug: string,
  contractAddress: string
): KnownToken | null {
  const key = `${chainSlug}:${contractAddress.toLowerCase()}`;
  return KNOWN_TOKENS[key] ?? null;
}

/** Total entries across all chains — used in route diagnostics. */
export function knownTokenCount(): number {
  return Object.keys(KNOWN_TOKENS).length;
}
