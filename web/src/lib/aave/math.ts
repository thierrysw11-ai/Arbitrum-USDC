// Pure math helpers for Aave V3 portfolio calculations.
//
// Everything in here is deterministic, free of React/wagmi dependencies, and
// covered by Vitest. The whole module is the "definition of truth" for how
// the UI interprets Aave's on-chain numbers — keep it small, well-tested,
// and well-commented.

import {
  AAVE_BASE_CURRENCY_DECIMALS,
  HEALTH_FACTOR_DECIMALS,
  LTV_DECIMALS,
} from "./addresses";
import type {
  PositionRow,
  PriceShock,
  ShockedPortfolio,
  UserAccountData,
} from "./types";

// ---------------------------------------------------------------------------
// Scale helpers
// ---------------------------------------------------------------------------

/** WAD = 1e18, used for ratios that need full precision (HF, indices). */
const WAD = 10n ** BigInt(HEALTH_FACTOR_DECIMALS);

/** RAY = 1e27, the unit Aave uses for APRs and liquidity indexes. */
const RAY = 10n ** 27n;

/** Aave reports LT/LTV in basis points × 100 — i.e. 8500 = 85.00 %. */
const LT_SCALE = 10n ** BigInt(LTV_DECIMALS); // 10000

/** Approximate seconds in a year. Aave APR↔APY conversion convention. */
export const SECONDS_PER_YEAR = 31_536_000;

/** Health factor that the UI treats as "liquidatable" (HF < 1.0). */
export const LIQUIDATION_HF = WAD;

// ---------------------------------------------------------------------------
// Number formatting
// ---------------------------------------------------------------------------

/**
 * Convert a base-currency bigint (USD with 8 decimals) to a JS number.
 * Safe for values up to ~$1e15, which is fine for portfolio displays.
 */
export function baseToUsd(base: bigint): number {
  const divisor = 10 ** AAVE_BASE_CURRENCY_DECIMALS;
  return Number(base) / divisor;
}

/** Convert raw token units to a JS number, given decimals. */
export function tokenToFloat(amount: bigint, decimals: number): number {
  if (decimals <= 0) return Number(amount);
  // Divide in two stages to keep precision when bigint is large. Anything
  // over Number.MAX_SAFE_INTEGER will lose low-order digits, but for human-
  // readable token displays that's acceptable.
  const head = amount / 10n ** BigInt(decimals);
  const tail = amount % 10n ** BigInt(decimals);
  return Number(head) + Number(tail) / 10 ** decimals;
}

/** Convert a WAD-scaled bigint (1e18) to a regular float. */
export function wadToFloat(wad: bigint): number {
  return Number(wad) / Number(WAD);
}

/** Convert an LT/LTV bigint (10000-scaled) to a fraction (0…1). */
export function ltToFraction(lt: bigint): number {
  return Number(lt) / Number(LT_SCALE);
}

// ---------------------------------------------------------------------------
// APR ↔ APY
// ---------------------------------------------------------------------------

/**
 * Aave stores rates as ray-scaled (1e27) APR. Convert to a decimal APY under
 * per-second compounding:
 *
 *     apy = (1 + apr / SECONDS_PER_YEAR) ^ SECONDS_PER_YEAR − 1
 *
 * Returns a plain fraction (e.g. 0.045 for 4.5 %).
 */
export function rayAprToApy(rayApr: bigint): number {
  const apr = Number(rayApr) / Number(RAY);
  return Math.pow(1 + apr / SECONDS_PER_YEAR, SECONDS_PER_YEAR) - 1;
}

// ---------------------------------------------------------------------------
// Health factor
// ---------------------------------------------------------------------------

/**
 * Compute health factor from totals using Aave's exact definition:
 *
 *     HF = (totalCollateralBase × weightedLT) / totalDebtBase
 *
 * Returned in WAD (1e18) for parity with the on-chain field. If
 * `totalDebtBase` is zero, HF is conceptually infinity — we return a huge
 * sentinel value (2^256-ish bigint cap is overkill; use a large but sane
 * number) so downstream comparisons still work.
 */
export function healthFactor(
  totalCollateralBase: bigint,
  totalDebtBase: bigint,
  weightedLiquidationThreshold: bigint
): bigint {
  if (totalDebtBase === 0n) {
    // Cap at 1e36 — far above anything Aave would ever report, well below
    // bigint overflow risk, and easy to special-case in UI ("∞").
    return WAD * WAD;
  }
  // (collateral × LT / 10000) × WAD / debt
  const adjustedCollateral =
    (totalCollateralBase * weightedLiquidationThreshold) / LT_SCALE;
  return (adjustedCollateral * WAD) / totalDebtBase;
}

// ---------------------------------------------------------------------------
// Per-asset liquidation price
// ---------------------------------------------------------------------------

/**
 * Compute the price at which a single collateral asset would push the user's
 * health factor to exactly 1.0, holding all other prices constant.
 *
 * This is *the* most useful number for a borrower to know about a position.
 * Definition:
 *
 *     HF = Σ (collateral_amt_i × price_i × LT_i) / totalDebtBase
 *
 *  Setting HF = 1 and solving for `price_target` of asset T while holding
 *  all other terms constant:
 *
 *     price_target = (totalDebtBase − Σ_{i≠T} collateral_amt_i × price_i × LT_i)
 *                  / (collateral_amt_T × LT_T)
 *
 *  All prices and totals are in base currency (USD, 8 decimals). Returns
 *  null if the asset doesn't have a collateral position — i.e. liquidation
 *  price is undefined for that row.
 */
export function liquidationPriceForAsset(
  target: PositionRow,
  allPositions: PositionRow[],
  totalDebtBase: bigint
): bigint | null {
  if (target.aTokenBalance === 0n || !target.usageAsCollateralEnabled) {
    return null;
  }
  if (totalDebtBase === 0n) {
    // No debt → can never be liquidated → no liquidation price.
    return null;
  }

  // Sum the LT-weighted collateral value of every *other* asset, in base.
  // contribution_i = aTokenBalance_i × price_i × LT_i
  // Watch the units: aTokenBalance is in raw token units (10^decimals), price
  // is in base (10^8), LT is in 10^4. So the product is in
  // 10^(decimals + 8 + 4) → divide by 10^decimals to get back to base × 10^4
  // → divide by 10^4 to get pure base.
  let othersWeighted = 0n;
  for (const p of allPositions) {
    if (p.asset === target.asset) continue;
    if (!p.usageAsCollateralEnabled || p.aTokenBalance === 0n) continue;
    const valueBase =
      (p.aTokenBalance * p.priceBase) / 10n ** BigInt(p.decimals);
    const weighted = (valueBase * p.liquidationThreshold) / LT_SCALE;
    othersWeighted += weighted;
  }

  // Required contribution from the target asset to keep HF == 1:
  //   target_contribution_base = totalDebtBase − othersWeighted
  // If othersWeighted >= totalDebtBase the position is already safe even
  // with target asset at zero, so no finite liquidation price.
  if (othersWeighted >= totalDebtBase) return null;

  const requiredFromTargetBase = totalDebtBase - othersWeighted;

  // Solve: requiredFromTargetBase = (aTokenBal × price × LT / 10^decimals) / LT_SCALE
  // → price = requiredFromTargetBase × LT_SCALE × 10^decimals / (aTokenBal × LT)
  const numer =
    requiredFromTargetBase *
    LT_SCALE *
    10n ** BigInt(target.decimals);
  const denom = target.aTokenBalance * target.liquidationThreshold;
  if (denom === 0n) return null;
  return numer / denom;
}

// ---------------------------------------------------------------------------
// Price-shock simulator
// ---------------------------------------------------------------------------

/**
 * Apply a price shock and return the resulting portfolio metrics.
 *
 * The shock is multiplicative on the live oracle price for the matching
 * reserve(s). If `assetSymbol` is "ALL_NON_STABLE", every reserve whose
 * symbol is NOT in the stable set gets the same shock (good "market-wide
 * crash" simulation). Otherwise only the matching reserve is shocked.
 *
 * Stables (symbols in the constant below) are held flat — shocking USDC
 * against a USDC-denominated debt makes no sense in this context.
 */
const STABLE_SYMBOLS = new Set([
  "USDC",
  "USDC.E",
  "USDCN",
  "USDT",
  "USDT.E",
  "DAI",
  "DAI.E",
  "FRAX",
  "LUSD",
  "GHO",
  "MAI",
  "SUSD",
]);

export function applyPriceShock(
  positions: PositionRow[],
  shock: PriceShock
): ShockedPortfolio {
  // Multiplier applied to "shocked" assets: 1 + pctChange/100, but never
  // negative — clamp at zero so a -200% shock just zeroes the asset out.
  const mult = Math.max(0, 1 + shock.pctChange / 100);
  // We can't multiply bigints by floats directly. Convert to a bigint-safe
  // ratio: numer / denom with denom = 10000 for 0.01% precision.
  const NUMER = BigInt(Math.round(mult * 10_000));
  const DENOM = 10_000n;

  const shockSymbol = shock.assetSymbol.toUpperCase();

  let shockedCollateralBase = 0n;
  let shockedWeighted = 0n;
  let shockedDebtBase = 0n;

  for (const p of positions) {
    const sym = p.symbol.toUpperCase();
    const isShocked =
      shockSymbol === "ALL_NON_STABLE"
        ? !STABLE_SYMBOLS.has(sym)
        : sym === shockSymbol;
    const shockedPrice = isShocked
      ? (p.priceBase * NUMER) / DENOM
      : p.priceBase;

    const collateralBase =
      (p.aTokenBalance * shockedPrice) / 10n ** BigInt(p.decimals);
    const debtBase =
      (p.variableDebtBalance * shockedPrice) / 10n ** BigInt(p.decimals);

    if (p.usageAsCollateralEnabled) {
      shockedCollateralBase += collateralBase;
      shockedWeighted += (collateralBase * p.liquidationThreshold) / LT_SCALE;
    }
    shockedDebtBase += debtBase;
  }

  // Reverse-engineer the weighted LT from the shocked totals so we can
  // reuse the standard healthFactor() helper.
  let weightedLt = 0n;
  if (shockedCollateralBase > 0n) {
    weightedLt = (shockedWeighted * LT_SCALE) / shockedCollateralBase;
  }

  const hf = healthFactor(shockedCollateralBase, shockedDebtBase, weightedLt);
  return {
    shockedCollateralBase,
    shockedDebtBase,
    shockedHealthFactor: hf,
    liquidatable: hf < LIQUIDATION_HF,
  };
}

// ---------------------------------------------------------------------------
// UI formatting helpers
// ---------------------------------------------------------------------------

/** Format a USD float with thousands separators and two decimals. */
export function formatUsd(usd: number): string {
  if (!isFinite(usd)) return "∞";
  if (usd >= 1_000_000_000) return `$${(usd / 1_000_000_000).toFixed(2)}B`;
  if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(2)}M`;
  if (usd >= 1_000) return `$${(usd / 1_000).toFixed(2)}K`;
  return `$${usd.toFixed(2)}`;
}

/** Format a HF for display: ∞ when no debt, otherwise to 2 dp. */
export function formatHealthFactor(hf: bigint): string {
  const f = wadToFloat(hf);
  if (!isFinite(f) || f >= 1e18) return "∞";
  return f.toFixed(2);
}

/** Convert APR (ray) → APY string like "4.52%". */
export function formatApy(rayApr: bigint): string {
  const apy = rayAprToApy(rayApr);
  return `${(apy * 100).toFixed(2)}%`;
}

/** A green / yellow / red bucket for a health factor, suitable for badges. */
export function healthFactorBucket(
  hf: bigint
): "safe" | "warn" | "danger" | "liquidated" {
  if (hf < LIQUIDATION_HF) return "liquidated";
  if (hf < (LIQUIDATION_HF * 13n) / 10n) return "danger"; // < 1.30
  if (hf < (LIQUIDATION_HF * 18n) / 10n) return "warn"; // < 1.80
  return "safe";
}
