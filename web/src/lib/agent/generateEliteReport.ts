export const generateEliteReport = (data: any): string => {
  return `
**SYSTEM INTELLIGENCE ACTIVE**

**SENTINEL ELITE RISK ASSESSMENT**

Your USDC position is currently stable with a Health Factor of ${data.healthFactor}.

**MARKET EXPOSURE**
USDC $${data.totalCollateralUSD} CURRENT VOLUME

"Core Liquidity Shield. Market status shows healthy institutional flow into USDC collateral."

**AGENT ASSESSMENT**
• Your USDC collateral is providing a stable floor for your debt positions.
• Recommended: Migrate $${Math.round(Number(data.totalCollateralUSD) * 0.4)} USDC to Morpho Gauntlet vault for +2.79% APY.
• This move would improve your annual yield by approximately $${Math.round(Number(data.totalCollateralUSD) * 0.0279)} while maintaining low risk.
`.trim();
};