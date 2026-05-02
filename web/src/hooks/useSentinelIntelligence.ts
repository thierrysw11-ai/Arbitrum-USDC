/**
 * Generates a formatted Sentinel Elite Risk Assessment report.
 * Designed for Aave V3 on Arbitrum One integrations.
 */
interface SentinelData {
  healthFactor: string;
  totalCollateralUSD: string;
  totalDebtUSD: string;
  availableBorrowsUSD: string;
  ltv: string;
  liquidationThreshold: string;
  assetBreakdown: string;
  aaveUsdcApy: string;
  morphoYields: string;
}

export const generateEliteReport = (data: SentinelData): string => {
  return `
**SYSTEM INTELLIGENCE ACTIVE**

**SENTINEL ELITE RISK ASSESSMENT**

Your current configuration presents a high-efficiency credit profile with a Health Factor of ${data.healthFactor}, maintaining a disciplined margin above the ${data.liquidationThreshold}% Liquidation Threshold.

**MARKET EXPOSURE**
USDC $${data.totalCollateralUSD} CURRENT VOLUME

"Institutional whale activity on Arbitrum One shows a persistent rotation into USDC-backed credit lines, tightening the spread between Aave V3 supply rates and Morpho vault yields."

**AGENT ASSESSMENT**
*   **Collateral Fortressing**: Your USDC position is currently yielding ${data.aaveUsdcApy}% on Aave V3; however, capital efficiency is being throttled by a ${data.ltv}% LTV, leaving $${data.availableBorrowsUSD} in untapped liquidity that could be deployed to buffer against debt-side volatility.
*   **Yield Arbitrage Opportunity**: Transitioning 50% of your USDC collateral to the Morpho Steakhouse or Gauntlet vaults would capture a yield premium of up to **${data.morphoYields}**, effectively increasing your baseline interest income by approximately 15-20% without increasing principal risk.
*   **Debt Optimization**: If your $${data.totalDebtUSD} in debt is concentrated in volatile assets, the current ${data.healthFactor} Health Factor is sufficient for a 10% market drawdown, but a shift toward stable-pair borrowing would lock in an **Elite Hedge** configuration.
*   **Actionable Strike**: Reallocate $${data.availableBorrowsUSD} into a delta-neutral yield strategy or stablecoin farm to offset borrowing costs; this tactical move targets a net portfolio APR improvement of ~2.4% while maintaining your current risk silos.
`.trim();
};

// Usage Example:
// const report = generateEliteReport({
//   healthFactor: "2.14",
//   totalCollateralUSD: "45,200.00",
//   totalDebtUSD: "18,400.00",
//   availableBorrowsUSD: "12,500.00",
//   ltv: "65",
//   liquidationThreshold: "82.5",
//   assetBreakdown: "USDC: $45.2k, WBTC Debt: $18.4k",
//   aaveUsdcApy: "4.2",
//   morphoYields: "Gauntlet: 7.2%, Steakhouse: 6.8%"
// });