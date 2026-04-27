// Vitest covers the Aave math helpers. These calculations are the
// definition of truth for the portfolio UI — if they go wrong, every number
// the user sees goes wrong. Treat this file as a contract.

import { describe, it, expect } from "vitest";

import {
  applyPriceShock,
  baseToUsd,
  formatHealthFactor,
  formatUsd,
  healthFactor,
  healthFactorBucket,
  liquidationPriceForAsset,
  ltToFraction,
  rayAprToApy,
  tokenToFloat,
  wadToFloat,
} from "./math";
import type { PositionRow } from "./types";

const RAY = 10n ** 27n;
const WAD = 10n ** 18n;
const ONE_USD = 10n ** 8n; // base currency = USD with 8 decimals

// Build a synthetic position row with sensible defaults so tests can
// override only the fields they care about.
function pos(overrides: Partial<PositionRow>): PositionRow {
  return {
    asset: "0x0000000000000000000000000000000000000000",
    symbol: "TEST",
    decimals: 18,
    aTokenBalance: 0n,
    variableDebtBalance: 0n,
    priceBase: ONE_USD,
    liquidationThreshold: 8000n, // 80%
    ltv: 7500n, // 75%
    usageAsCollateralEnabled: true,
    liquidityRate: 0n,
    variableBorrowRate: 0n,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Scaling helpers
// ---------------------------------------------------------------------------

describe("scaling helpers", () => {
  it("baseToUsd converts 8-decimal base to USD float", () => {
    expect(baseToUsd(ONE_USD)).toBe(1);
    expect(baseToUsd(123_45000000n)).toBe(123.45);
  });

  it("tokenToFloat divides by 10^decimals", () => {
    expect(tokenToFloat(10n ** 18n, 18)).toBe(1);
    expect(tokenToFloat(1_500_000n, 6)).toBe(1.5);
  });

  it("wadToFloat divides WAD bigint by 1e18", () => {
    expect(wadToFloat(WAD)).toBe(1);
    expect(wadToFloat(WAD * 3n / 2n)).toBeCloseTo(1.5, 8);
  });

  it("ltToFraction converts 10000-scale LT to a decimal fraction", () => {
    expect(ltToFraction(8000n)).toBe(0.8);
    expect(ltToFraction(10_000n)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// APR ↔ APY
// ---------------------------------------------------------------------------

describe("rayAprToApy", () => {
  it("0 APR → 0 APY", () => {
    expect(rayAprToApy(0n)).toBe(0);
  });

  it("5% APR continuously compounded ≈ 5.127% APY", () => {
    // 0.05 in ray = 0.05 * 1e27
    const apr = (RAY * 5n) / 100n;
    const apy = rayAprToApy(apr);
    // Per-second compounding for 1 year ≈ continuous compounding ≈ e^0.05 - 1 ≈ 0.05127
    expect(apy).toBeCloseTo(0.05127, 4);
  });

  it("monotonic: higher APR → higher APY", () => {
    const a = rayAprToApy((RAY * 1n) / 100n);
    const b = rayAprToApy((RAY * 5n) / 100n);
    const c = rayAprToApy((RAY * 10n) / 100n);
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
  });
});

// ---------------------------------------------------------------------------
// Health factor
// ---------------------------------------------------------------------------

describe("healthFactor", () => {
  it("zero debt → effectively infinite HF", () => {
    const hf = healthFactor(1000n * ONE_USD, 0n, 8000n);
    expect(hf).toBeGreaterThan(WAD * 1000n);
  });

  it("HF == 1.0 exactly at liquidation boundary", () => {
    // $1000 collateral × 80% LT = $800 effective collateral
    // Debt = $800 → HF = 1.0
    const hf = healthFactor(1000n * ONE_USD, 800n * ONE_USD, 8000n);
    expect(hf).toBe(WAD);
  });

  it("HF == 2.0 with half the max debt", () => {
    const hf = healthFactor(1000n * ONE_USD, 400n * ONE_USD, 8000n);
    expect(hf).toBe(WAD * 2n);
  });

  it("HF < 1 when debt exceeds LT-adjusted collateral", () => {
    const hf = healthFactor(1000n * ONE_USD, 900n * ONE_USD, 8000n);
    expect(hf).toBeLessThan(WAD);
  });
});

// ---------------------------------------------------------------------------
// Per-asset liquidation price
// ---------------------------------------------------------------------------

describe("liquidationPriceForAsset", () => {
  it("returns null for assets with no collateral", () => {
    const target = pos({ symbol: "WETH", aTokenBalance: 0n });
    const price = liquidationPriceForAsset(target, [target], 100n * ONE_USD);
    expect(price).toBeNull();
  });

  it("returns null when there's no debt", () => {
    const weth = pos({
      symbol: "WETH",
      decimals: 18,
      aTokenBalance: 10n ** 18n,
      priceBase: 3000n * ONE_USD,
    });
    const price = liquidationPriceForAsset(weth, [weth], 0n);
    expect(price).toBeNull();
  });

  it("solves correctly for a simple single-collateral position", () => {
    // 1 WETH @ $3000, 80% LT → $2400 effective collateral
    // Debt = $1000 → liquidation when 1 WETH × P × 0.80 = $1000 → P = $1250
    const weth = pos({
      symbol: "WETH",
      decimals: 18,
      aTokenBalance: 10n ** 18n,
      priceBase: 3000n * ONE_USD,
      liquidationThreshold: 8000n,
    });
    const price = liquidationPriceForAsset(weth, [weth], 1000n * ONE_USD);
    expect(price).not.toBeNull();
    // Allow ~1¢ rounding tolerance
    const expected = 1250n * ONE_USD;
    const diff = price! > expected ? price! - expected : expected - price!;
    expect(diff < ONE_USD / 100n).toBe(true);
  });

  it("returns null when other collateral already covers all debt", () => {
    // USDC fully covers debt with LT alone, so WETH can drop to zero
    // without triggering liquidation.
    // NB: each fixture must use a distinct asset address — the function
    // dedupes by asset, so identical addresses would silently skip rows.
    const usdc = pos({
      asset: "0x0000000000000000000000000000000000000001",
      symbol: "USDC",
      decimals: 6,
      aTokenBalance: 5000n * 10n ** 6n,
      priceBase: ONE_USD,
      liquidationThreshold: 8500n,
    });
    const weth = pos({
      asset: "0x0000000000000000000000000000000000000002",
      symbol: "WETH",
      decimals: 18,
      aTokenBalance: 10n ** 18n,
      priceBase: 3000n * ONE_USD,
      liquidationThreshold: 8000n,
    });
    const debt = 1000n * ONE_USD;
    const wethLiqPrice = liquidationPriceForAsset(weth, [usdc, weth], debt);
    expect(wethLiqPrice).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Price-shock simulator
// ---------------------------------------------------------------------------

describe("applyPriceShock", () => {
  it("zero shock leaves portfolio metrics unchanged", () => {
    const weth = pos({
      symbol: "WETH",
      decimals: 18,
      aTokenBalance: 10n ** 18n,
      variableDebtBalance: 0n,
      priceBase: 3000n * ONE_USD,
    });
    const usdc = pos({
      symbol: "USDC",
      decimals: 6,
      aTokenBalance: 0n,
      variableDebtBalance: 1000n * 10n ** 6n,
      priceBase: ONE_USD,
    });
    const out = applyPriceShock([weth, usdc], {
      assetSymbol: "ALL_NON_STABLE",
      pctChange: 0,
    });
    // Collateral: 1 WETH × $3000 = $3000
    expect(out.shockedCollateralBase).toBe(3000n * ONE_USD);
    // Debt: 1000 USDC × $1 = $1000
    expect(out.shockedDebtBase).toBe(1000n * ONE_USD);
  });

  it("market-wide -50% shock halves non-stable collateral, leaves stable debt", () => {
    const weth = pos({
      symbol: "WETH",
      decimals: 18,
      aTokenBalance: 10n ** 18n,
      priceBase: 3000n * ONE_USD,
    });
    const usdcDebt = pos({
      symbol: "USDC",
      decimals: 6,
      aTokenBalance: 0n,
      variableDebtBalance: 1000n * 10n ** 6n,
      priceBase: ONE_USD,
      usageAsCollateralEnabled: false,
    });
    const out = applyPriceShock([weth, usdcDebt], {
      assetSymbol: "ALL_NON_STABLE",
      pctChange: -50,
    });
    // WETH now $1500 → collateral = $1500
    expect(out.shockedCollateralBase).toBe(1500n * ONE_USD);
    // USDC stable, debt unchanged
    expect(out.shockedDebtBase).toBe(1000n * ONE_USD);
  });

  it("liquidatable flag flips on a sharp shock", () => {
    const weth = pos({
      symbol: "WETH",
      decimals: 18,
      aTokenBalance: 10n ** 18n,
      priceBase: 3000n * ONE_USD,
      liquidationThreshold: 8000n,
    });
    const usdcDebt = pos({
      symbol: "USDC",
      decimals: 6,
      aTokenBalance: 0n,
      variableDebtBalance: 2000n * 10n ** 6n,
      priceBase: ONE_USD,
      usageAsCollateralEnabled: false,
    });
    // Mild -10% shock — still healthy
    const mild = applyPriceShock([weth, usdcDebt], {
      assetSymbol: "WETH",
      pctChange: -10,
    });
    expect(mild.liquidatable).toBe(false);
    // Sharp -50% shock — should be liquidatable
    const sharp = applyPriceShock([weth, usdcDebt], {
      assetSymbol: "WETH",
      pctChange: -50,
    });
    expect(sharp.liquidatable).toBe(true);
  });

  it("symbol-specific shock leaves other reserves unaffected", () => {
    const weth = pos({
      symbol: "WETH",
      decimals: 18,
      aTokenBalance: 10n ** 18n,
      priceBase: 3000n * ONE_USD,
    });
    const wbtc = pos({
      symbol: "WBTC",
      decimals: 8,
      aTokenBalance: 10n ** 7n, // 0.1 WBTC
      priceBase: 60_000n * ONE_USD,
    });
    const out = applyPriceShock([weth, wbtc], {
      assetSymbol: "WETH",
      pctChange: -50,
    });
    // WETH now $1500, WBTC unchanged at $60k × 0.1 = $6000
    // Total collateral = $1500 + $6000 = $7500
    expect(out.shockedCollateralBase).toBe(7500n * ONE_USD);
  });
});

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

describe("formatters", () => {
  it("formatUsd handles K/M/B suffixes", () => {
    expect(formatUsd(99.5)).toBe("$99.50");
    expect(formatUsd(1_500)).toBe("$1.50K");
    expect(formatUsd(2_500_000)).toBe("$2.50M");
    expect(formatUsd(7_200_000_000)).toBe("$7.20B");
  });

  it("formatHealthFactor returns ∞ for zero-debt position", () => {
    expect(formatHealthFactor(WAD * WAD)).toBe("∞");
  });

  it("formatHealthFactor renders 2dp otherwise", () => {
    expect(formatHealthFactor((WAD * 152n) / 100n)).toBe("1.52");
  });
});

describe("healthFactorBucket", () => {
  it("liquidated below 1.0", () => {
    expect(healthFactorBucket((WAD * 99n) / 100n)).toBe("liquidated");
  });
  it("danger between 1.0 and 1.30", () => {
    expect(healthFactorBucket(WAD)).toBe("danger");
    expect(healthFactorBucket((WAD * 125n) / 100n)).toBe("danger");
  });
  it("warn between 1.30 and 1.80", () => {
    expect(healthFactorBucket((WAD * 13n) / 10n)).toBe("warn");
    expect(healthFactorBucket((WAD * 175n) / 100n)).toBe("warn");
  });
  it("safe at 1.80 and above", () => {
    expect(healthFactorBucket((WAD * 18n) / 10n)).toBe("safe");
    expect(healthFactorBucket(WAD * 100n)).toBe("safe");
  });
});
