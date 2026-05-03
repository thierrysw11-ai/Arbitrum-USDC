import { ethers } from "ethers";
import { scanMetamaskPortfolio } from "./scanner";
import { generateEliteReport } from "./generateEliteReport";

// ADD THIS EXPORT BLOCK:
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
  // ... rest of your existing runTool code ...
}