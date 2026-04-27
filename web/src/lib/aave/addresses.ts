// Canonical Aave V3 contract addresses on Arbitrum One.
// Sources: https://docs.aave.com/developers/deployed-contracts/v3-mainnet/arbitrum
// These are the proxy addresses — they don't change between protocol upgrades,
// so it's safe to hard-code them.

export const AAVE_V3_ARBITRUM = {
  // Core lending pool. All user-facing reads (`getUserAccountData`,
  // `getReserveData`, etc.) target this contract.
  Pool: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",

  // Registry contract. Useful if we ever want to discover the protocol data
  // provider or oracle addresses dynamically rather than hard-coding them.
  PoolAddressesProvider: "0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb",

  // Per-asset stats helper. Returns aToken / variableDebtToken / liquidity
  // index / borrow rate / etc. for a single reserve in one call. Useful for
  // the per-asset breakdown table.
  AaveProtocolDataProvider: "0x69FA688f1Dc47d4B5d8029D5a35FB7a548310654",

  // Live USD oracle aggregator. `getAssetPrice(asset)` returns the price in
  // base currency (USD with 8 decimals on Arbitrum V3). We don't use it for
  // the portfolio reads since `getUserAccountData` already returns base-
  // currency totals, but it's handy for per-asset USD breakdowns.
  AaveOracle: "0xb56c2F0B653B2e0b10C9b928C8580Ac5Df02C7C7",
} as const;

// Aave V3 base-currency unit (USD) is reported with 8 decimals on Arbitrum.
// `totalCollateralBase`, `totalDebtBase`, etc. all use this scaling.
export const AAVE_BASE_CURRENCY_DECIMALS = 8;

// Health factor returned by `getUserAccountData` is in WAD (1e18). A user
// with HF == 1.0 is exactly at liquidation; HF < 1 is liquidatable.
export const HEALTH_FACTOR_DECIMALS = 18;

// LTV and liquidation threshold are returned in basis points × 100 — i.e.
// 8500 means 85.00 %.
export const LTV_DECIMALS = 4;
