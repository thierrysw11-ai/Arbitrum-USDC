// C:\Users\TA\Arbitrum-USDC\web\src\lib\agent\tools.ts
import { ethers } from "ethers";
import { scanMetamaskPortfolio } from "./scanner";
import { generateEliteReport } from "./generateEliteReport";

export async function runTool(name: string, input: any, activeAddress?: string) {
  if (name === "scan_and_analyze_portfolio") {
    // 1. Use the address from the UI/Route if the agent fails to provide one
    const walletToScan = input.address || activeAddress;
    
    if (!walletToScan) {
      return "Error: No wallet address provided for the scan.";
    }

    // 2. Initialize provider with the API key from environment variables
    const provider = new ethers.providers.JsonRpcProvider(
      `https://arb-mainnet.g.alchemy.com/v2/${process.env.df3AQ4HlDJj5ED_Ep8MXK}`
    );
    
    try {
      // 3. Perform the scan
const holdings = await scanMetamaskPortfolio(input.address, provider);

// DEBUG: Check your terminal to see if 'holdings' is an empty [] or has data
console.log("Scanner Result:", holdings);

const data = {
  healthFactor: "2.55", 
  totalCollateralUSD: "5.00",
  holdings: holdings // This MUST be named 'holdings' to match the report file
};

return generateEliteReport(data);
    } catch (error) {
      console.error("Scanner Error:", error);
      return "Sentinel was unable to access the Arbitrum indexer. Check your API key.";
    }
  }
}


