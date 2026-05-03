// src/lib/agent/tools.ts
// ... inside runTool ...
const holdings = await scanMetamaskPortfolio(walletToScan, provider);

console.log("TOOL DEBUG: Holdings found:", holdings); // Check your VS Code terminal for this!

return generateEliteReport({
  healthFactor: "2.56",
  totalCollateralUSD: "5.00",
  holdings: holdings // <--- This MUST be the same key used in generateEliteReport.ts
});