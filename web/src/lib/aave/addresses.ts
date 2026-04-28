/**
 * Aave V3 contract addresses on Arbitrum One.
 *
 * As of Phase A (multi-chain expansion), this file is a thin compatibility
 * wrapper over `lib/chains.ts`. The canonical source of truth for *all*
 * chain-specific addresses is now `CHAINS_BY_SLUG[slug].aaveV3` — keeping
 * this file intact preserves the import surface for components that still
 * pin to Arbitrum (which is most of them today, until sub-tasks 6+ migrate
 * them to be chain-aware).
 *
 * @deprecated For new code, prefer
 *   `import { CHAINS_BY_SLUG } from '@/lib/chains'`
 *   and reference the per-chain `.aaveV3` block directly. This file will
 *   stay for backward-compat but won't gain new fields.
 */

import { CHAINS_BY_SLUG } from '../chains';

const arbConfig = CHAINS_BY_SLUG['arbitrum-one'];

/**
 * Canonical Aave V3 contract addresses on Arbitrum One. Keys preserve the
 * PascalCase naming used throughout the existing codebase. Values are
 * sourced from the multi-chain registry in `lib/chains.ts`.
 *
 * Sources: https://github.com/bgd-labs/aave-address-book
 */
export const AAVE_V3_ARBITRUM = {
  // Core lending pool. All user-facing reads (`getUserAccountData`,
  // `getReserveData`, etc.) target this contract.
  Pool: arbConfig.aaveV3.pool,

  // Registry contract. Useful if we ever want to discover the protocol data
  // provider or oracle addresses dynamically rather than hard-coding them.
  PoolAddressesProvider: arbConfig.aaveV3.poolAddressesProvider,

  // Per-asset stats helper. Returns aToken / variableDebtToken / liquidity
  // index / borrow rate / etc. for a single reserve in one call. Useful for
  // the per-asset breakdown table.
  AaveProtocolDataProvider: arbConfig.aaveV3.dataProvider,

  // Live USD oracle aggregator. `getAssetPrice(asset)` returns the price in
  // base currency (USD with 8 decimals on Arbitrum V3). We don't use it for
  // the portfolio reads since `getUserAccountData` already returns base-
  // currency totals, but it's handy for per-asset USD breakdowns.
  AaveOracle: arbConfig.aaveV3.oracle,
} as const;

// ─── Aave V3 protocol-wide constants (chain-independent) ────────────────

// Aave V3 base-currency unit (USD) is reported with 8 decimals on Arbitrum.
// `totalCollateralBase`, `totalDebtBase`, etc. all use this scaling.
export const AAVE_BASE_CURRENCY_DECIMALS = 8;

// Health factor returned by `getUserAccountData` is in WAD (1e18). A user
// with HF == 1.0 is exactly at liquidation; HF < 1 is liquidatable.
export const HEALTH_FACTOR_DECIMALS = 18;

// LTV and liquidation threshold are returned in basis points × 100 — i.e.
// 8500 means 85.00 %.
export const LTV_DECIMALS = 4;
