// src/lib/agent/tools.ts
import { ethers } from "ethers";
import { scanMetamaskPortfolio } from "./scanner";
import { generateEliteReport } from "./generateEliteReport";

export async function runTool(name: string, input: any, activeAddress?: string) {
  if (name === "scan_and_analyze_portfolio") {
    const walletToScan = activeAddress || input.address;

    if (!walletToScan) {
      return "I need a connected wallet to scan.";
    }

    const provider = new ethers.providers.JsonRpcProvider(
      `https://arb-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`
    );

    try {
      const holdings = await scanMetamaskPortfolio(walletToScan, provider);

      // We pass the 'holdings' array (list of tokens) to the report
      return generateEliteReport({
        healthFactor: "2.56",
        totalCollateralUSD: "5.00",
        holdings: holdings 
      });
    } catch (error) {
      console.error(error);
      return "Scan failed.";
    }
  } // <--- Ensure this bracket closes the 'if' statement
  
  return "Tool not found."; // <--- This return is allowed because it's inside 'runTool'
}