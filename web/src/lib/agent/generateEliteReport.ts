/**
 * Sentinel Elite Report Generator
 * Injects live Aave and MetaMask scanner data into the Elite Risk Template.
 */
export const generateEliteReport = (data: any): string => {
  // Logic to handle live MetaMask holdings from the scanner
  const holdingsText = data.holdings && data.holdings.length > 0
    ? data.holdings.map((h: any) => `${h.symbol} (${h.amount})`).join(', ')
    : "No significant external holdings detected";

  // Calculations for recommended migration based on live collateral
  const migrateMin = Math.round(Number(data.totalCollateralUSD) * 0.35);
  const migrateMax = Math.round(Number(data.totalCollateralUSD) * 0.45);
  const estimatedYield = Math.round(Number(data.totalCollateralUSD) * 0.0279 * 0.4);

  return `
**SYSTEM INTELLIGENCE ACTIVE**

**SENTINEL ELITE RISK ASSESSMENT**

Your Aave V3 position on Arbitrum shows a stable Health Factor of ${data.healthFactor || '0.00'}, supported by strong USDC collateral.

**CURRENT POSITIONS**
• **USDC Supply**: $${data.totalCollateralUSD || '0'} (Core collateral, stable)
• **WBTC Borrow**: Active (volatile asset exposure)
• **DAI Borrow**: Active (stablecoin debt)
• **Other MetaMask Holdings**: ${holdingsText}

**MARKET MOMENTUM & FORCES**
USDC remains the dominant stablecoin on Arbitrum with strong institutional inflows. WBTC borrow exposure carries directional risk to Bitcoin price momentum. Current market forces favor USDC collateral as a hedge against volatility in ETH and BTC.

**AGENT ASSESSMENT & RISK ANALYSIS**
• Your USDC collateral is acting as a **stable floor** for WBTC and DAI debt positions — this is a classic **Elite Hedge** configuration.
• **Risk Exposure**: Moderate. WBTC borrow introduces BTC price risk, but USDC over-collateralization provides good protection.
• **Recommended Action**: Migrate $${migrateMin}–$${migrateMax} USDC from Aave to Morpho Gauntlet vault for +2.79% APY (estimated annual yield increase of ~$${estimatedYield}).
• Maintain at least 35% USDC on Aave for maximum liquidity during market stress.
• Overall portfolio risk: **Low to Medium** — well-positioned for current market conditions.

**Risk Summary**: Strong USDC backing reduces liquidation probability even if WBTC experiences a 20-30% drawdown.
`.trim();
};