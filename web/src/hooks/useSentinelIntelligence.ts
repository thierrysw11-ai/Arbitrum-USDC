import { useAccount } from 'wagmi';
import { useState, useEffect } from 'react';

/**
 * ENTITY DEFINITION:
 * This represents the "Elite" view: Personal position vs. Global Market Context.
 */
export interface MarketIntelligence {
  asset: string;
  holdings: number;
  marketShare: string;      // User Volume / Total Global Volume
  volatilityIndex: string;  // Based on transferCount
  riskCategory: 'SHIELD' | 'LIABILITY' | 'HEDGE';
  assessment: string;
}

export function useSentinelIntelligence() {
  const { address, isConnected } = useAccount();
  const [intelligence, setIntelligence] = useState<MarketIntelligence[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!address || !isConnected) return;

    const fetchEliteMetrics = async () => {
      setIsLoading(true);
      try {
        // We query the USDC ledger and the Global Hourly Stats simultaneously
        const query = `
          query GetSentinelElite($user: Bytes!) {
            incoming: transfers(where: { to: $user }) { value }
            outgoing: transfers(where: { from: $user }) { value }
            marketStats: hourlyVolumes(first: 1, orderBy: hourStartTimestamp, orderDirection: desc) {
              totalVolume
              whaleVolume
              transferCount
            }
          }
        `;

        const response = await fetch(process.env.NEXT_PUBLIC_USDC_SUBGRAPH_URL!, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, variables: { user: address } }),
        });

        const { data } = await response.json();
        if (!data) return;

        const stats = data.marketStats[0];
        
        // 1. RECONSTRUCT POSITION
        const net = (data.incoming.reduce((s:any, t:any) => s + BigInt(t.value), 0n) - 
                     data.outgoing.reduce((s:any, t:any) => s + BigInt(t.value), 0n));
        const balance = Number(net) / 1_000_000;

        // 2. CALCULATE MARKET RELATIVITY
        // Comparing user balance against hourly total volume gives the "Efficiency" metric
        const share = (balance / (Number(stats.totalVolume) / 1_000_000)) * 100;

        // 3. GENERATE COMPARATIVE DATA
        const usdcIntelligence: MarketIntelligence = {
          asset: "USDC",
          holdings: balance,
          marketShare: `${share.toFixed(4)}%`,
          volatilityIndex: stats.transferCount > 1000 ? "HIGH" : "STABLE",
          riskCategory: 'SHIELD',
          assessment: `Your ${balance.toFixed(2)} USDC represents ${share.toFixed(4)}% of current hourly market flow. This liquidity acts as a Shield against broader volatility.`
        };

        // If you had a WBTC subgraph, you would fetch and add it to this array here
        setIntelligence([usdcIntelligence]);

      } catch (err) {
        console.error("Intelligence Engine Offline:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchEliteMetrics();
  }, [address, isConnected]);

  return { intelligence, isLoading };
}