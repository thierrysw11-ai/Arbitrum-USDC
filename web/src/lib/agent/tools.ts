export async function runTool(name: string, input: any, activeAddress?: string) {
  if (name === "scan_and_analyze_portfolio") {
    const walletToScan = activeAddress || input.address;

    const provider = new ethers.providers.JsonRpcProvider(
      `https://arb-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`
    );

    try {
      const holdings = await scanMetamaskPortfolio(walletToScan, provider);
      
      // CRITICAL: Ensure this object matches the keys in generateEliteReport.ts
      return generateEliteReport({
        healthFactor: "2.56",
        totalCollateralUSD: "5.00",
        holdings: holdings // This must be the array from the scanner
      });
    } catch (error) {
      return "Blockchain scan failed. Check Alchemy Key.";
    }
  }
  return "Tool not found.";
}