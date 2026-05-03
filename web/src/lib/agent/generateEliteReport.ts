export const generateEliteReport = (data: any): string => {
  // This variable processes the array we send from tools.ts
  const holdingsText = data.holdings && data.holdings.length > 0
    ? data.holdings.map((h: any) => `**${h.symbol}**: ${h.amount}`).join(', ')
    : "No significant external holdings detected";

  return `
**SENTINEL ELITE RISK ASSESSMENT**

*   **USDC Supply**: $${data.totalCollateralUSD}
*   **Other MetaMask Holdings**: ${holdingsText}

**AGENT ASSESSMENT**
Portfolio analysis complete.
`.trim();
};