import { ethers } from 'ethers';

export async function scanMetamaskPortfolio(address: string, provider: any) {
  // 1. Fetch Native ETH Balance as before
  const ethBalance = await provider.getBalance(address);

  // 2. Fetch ALL ERC-20 tokens using an Indexer (Example: Alchemy)
  // This replaces the manual ASSETS_TO_SCAN array
  const response = await fetch(`https://arb-mainnet.g.alchemy.com/v2/${process.env.df3AQ4HlDJj5ED_Ep8MXK}`, {
    method: 'POST',
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "alchemy_getTokenBalances",
      params: [address],
      id: 42
    })
  });

  const data = await response.json();
  const tokenBalancesRaw = data.result.tokenBalances;

  // 3. Resolve metadata (Symbols/Decimals) for detected tokens
  const tokenBalances = await Promise.all(
    tokenBalancesRaw
      .filter((t: any) => t.tokenBalance !== "0x0000000000000000000000000000000000000000000000000000000000000000")
      .map(async (t: any) => {
        // Fetch metadata for the specific token found in your wallet
        const metaResponse = await fetch(`https://arb-mainnet.g.alchemy.com/v2/${process.env.df3AQ4HlDJj5ED_Ep8MXK}`, {
          method: 'POST',
          body: JSON.stringify({
            jsonrpc: "2.0",
            method: "alchemy_getTokenMetadata",
            params: [t.contractAddress],
            id: 42
          })
        });
        const meta = await metaResponse.json();
        const decimals = meta.result.decimals;
        
        return {
          symbol: meta.result.symbol,
          amount: ethers.utils.formatUnits(t.tokenBalance, decimals),
          type: 'ERC20'
        };
      })
  );

  return [
    { symbol: 'ETH', amount: ethers.utils.formatEther(ethBalance), type: 'NATIVE' },
    ...tokenBalances
  ];
}