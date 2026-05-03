// src/lib/agent/scanner.ts
import { ethers } from 'ethers';

export async function scanMetamaskPortfolio(address: string, provider: ethers.providers.JsonRpcProvider) {
  try {
    // This is the actual call to Alchemy
    const tokenBalances = await provider.send("alchemy_getTokenBalances", [address, "erc20"]);
    
    // MAP REAL DATA
const holdings = tokenBalances.tokenBalances
  .map((token: any) => ({
    symbol: "TOKEN", // Real symbol requires an extra metadata call
    amount: ethers.utils.formatUnits(token.tokenBalance, 18), 
  }))
  .filter((t: any) => parseFloat(t.amount) > 0); // Start by showing EVERYTHING > 0

    // --- TEST INJECTION ---
    // If Alchemy returns nothing, we add this fake ETH to see if the UI updates
    if (holdings.length === 0) {
      console.log("DEBUG: Alchemy returned 0. Injecting test data.");
      holdings.push({ symbol: 'ETH_TEST', amount: '0.5000', type: 'NATIVE' });
    }
    // -----------------------

    return holdings;
  } catch (error) {
    console.error("Scanner Error:", error);
    return [{ symbol: 'ERROR', amount: '0', type: 'DEBUG' }];
  }
}