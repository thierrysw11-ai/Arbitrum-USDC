import { ethers } from "ethers";
import { scanMetamaskPortfolio } from "./scanner";
import { generateEliteReport } from "./generateEliteReport";

export const TOOL_DEFINITIONS = [
  {
    name: "scan_and_analyze_portfolio",
    description: "Scans the user's MetaMask wallet for ERC20 tokens on Arbitrum and generates a risk report.",
    parameters: {
      type: "object",
      properties: {
        address: {
          type: "string",
          description: "The wallet address to scan (optional if activeAddress is provided)"
        }
      }
    }
  }
];

export async function runTool(name: string, input: any, activeAddress?: string) {
  if (name === "scan_and_analyze_portfolio") {
    // Determine which address to scan
    const walletToScan = activeAddress || input.address;
    
    console.log("--- SENTINEL SCAN TRIGGERED ---");
    console.log("Target Wallet:", walletToScan);

    if (!walletToScan) {
      return "Error: No wallet address detected. Please connect your MetaMask.";
    }

    // Initialize Provider
    const provider = new ethers.providers.JsonRpcProvider(
      `https://arb-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`
    );

    try {
      // 1. Fetch the data from Alchemy
      const holdings = await scanMetamaskPortfolio(walletToScan, provider);
      
      console.log(`Successfully found ${holdings.length} assets.`);

      // 2. Pass that data into your Elite Report generator
      const report = generateEliteReport({
        healthFactor: "2.56", // Static for now, can be made dynamic later
        totalCollateralUSD: "5.00", 
        holdings: holdings 
      });

      return report;
    } catch (error) {
      console.error("Tool Execution Error:", error);
      return "The Sentinel was unable to retrieve blockchain data. Verify your Alchemy API Key in Vercel settings.";
    }
  }

  return `Tool ${name} not found.`;
}