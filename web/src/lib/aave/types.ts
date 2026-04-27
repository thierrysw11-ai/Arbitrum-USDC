// Shared types for the portfolio module. Kept narrow — we only model the
// fields the UI consumes, not the full Aave V3 surface area.

/** Aggregate position data returned by `Pool.getUserAccountData`. */
export interface UserAccountData {
  /** Total collateral in base currency (USD, 8 decimals) */
  totalCollateralBase: bigint;
  /** Total debt in base currency (USD, 8 decimals) */
  totalDebtBase: bigint;
  /** Available borrow capacity in base currency (USD, 8 decimals) */
  availableBorrowsBase: bigint;
  /** Weighted-average liquidation threshold in bps × 100 (e.g. 8500 = 85%) */
  currentLiquidationThreshold: bigint;
  /** Weighted-average max LTV in bps × 100 */
  ltv: bigint;
  /** Health factor in WAD (1e18). HF >= 1e18 is healthy; < 1e18 liquidatable. */
  healthFactor: bigint;
}

/**
 * One row of the per-asset breakdown — combines reserve metadata, user
 * balances, and the live oracle price into a single shape the UI table can
 * render directly.
 */
export interface PositionRow {
  /** Underlying asset address (lowercase hex) */
  asset: `0x${string}`;
  /** Token symbol (e.g. "USDC", "WETH") */
  symbol: string;
  /** ERC20 decimals of the underlying */
  decimals: number;
  /** User's aToken balance in raw token units (includes accrued interest) */
  aTokenBalance: bigint;
  /** User's variable debt balance in raw token units (includes accrued interest) */
  variableDebtBalance: bigint;
  /** USD price from the Aave oracle (8 decimals) */
  priceBase: bigint;
  /** Current liquidation threshold for this reserve, bps × 100 */
  liquidationThreshold: bigint;
  /** Current LTV for this reserve, bps × 100 */
  ltv: bigint;
  /** True if this reserve is currently being used as collateral by the user */
  usageAsCollateralEnabled: boolean;
  /** Live supply APR (ray-scaled, 1e27) */
  liquidityRate: bigint;
  /** Live variable borrow APR (ray-scaled, 1e27) */
  variableBorrowRate: bigint;
}

/** A snapshot of the full portfolio derived for a given wallet. */
export interface Portfolio {
  account: UserAccountData;
  positions: PositionRow[];
  /** Set when at least one of the underlying reads is still pending. */
  loading: boolean;
  /** Set when something fundamental fails (RPC down, bad address, etc.). */
  error: Error | null;
}

/**
 * Inputs to the price-shock simulator. A negative `pctChange` simulates a
 * price drop, positive a pump. `assetSymbol` is "ALL_NON_STABLE" for a
 * market-wide shock, otherwise the symbol of the specific reserve to shock.
 */
export interface PriceShock {
  assetSymbol: string | "ALL_NON_STABLE";
  pctChange: number;
}

/** Result of applying a `PriceShock` to a `Portfolio` snapshot. */
export interface ShockedPortfolio {
  shockedCollateralBase: bigint;
  shockedDebtBase: bigint;
  shockedHealthFactor: bigint;
  /** True if the new HF is below the liquidation line. */
  liquidatable: boolean;
}
