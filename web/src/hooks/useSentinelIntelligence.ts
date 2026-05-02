import { useAccount } from 'wagmi';
import { useState, useEffect } from 'react';

// This URL should point to your USDC-specific subgraph from image_3b4494.png
const SUBGRAPH_URL = process.env.NEXT_PUBLIC_USDC_SUBGRAPH_URL!;

export interface MarketIntelligence {
  symbol: string;
  amount: string;
  type: "MARKET EXPOSURE" | "MARKET LIABILITY";
  marketShare: string;      // User Volume / Total Global Volume
  volatilityIndex: string;  // Assessment of transfer frequency
  implication: string;      // The status text inside the card
  agentAnalysis: string;    // The full narrative for the bottom box
}

export function useSentinelIntelligence() {
  const { address, isConnected } = useAccount();
  const [intelligence, setIntelligence] = useState<MarketIntelligence[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!address || !isConnected) {
      setIntelligence([]);
      return;
    }

    const fetchEliteMetrics = async () => {
      setIsLoading(true);
      try {
        // Querying both personal ledger and global market stats from image_3b61ac.png
        const query = `
          query GetSentinelElite($user: Bytes!) {
            incoming: transfers(where: { to: $user }, first: 1000) { value }
            outgoing: transfers(where: { from: $user }, first: 1000) { value }
            marketStats: hourlyVolumes(first: 1, orderBy: hourStartTimestamp, orderDirection: desc) {
              totalVolume
              whaleVolume
              transferCount
            }
          }
        `;

        const response = await fetch(SUBGRAPH_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            query, 
            variables: { user: address } 
          }),
        });

        const { data, errors } = await response.json();
        
        if (errors) {
          console.error("GraphQL Validation Error:", errors);
          return;
        }

        if (data) {
          const stats = data.marketStats[0];
          
          // 1. RECONSTRUCT POSITION (Forensic Ledger Method)
          const inVal = data.incoming.reduce((acc: any, t: any) => acc + BigInt(t.value), 0n);
          const outVal = data.outgoing.reduce((acc: any, t: any) => acc + BigInt(t.value), 0n);
          const netBalance = Number(inVal - outVal) / 1_000_000;

          const allPositions: MarketIntelligence[] = [];

          if (netBalance > 0) {
            // 2. CALCULATE MARKET RELATIVITY (Clear Understanding of Market Share)
            const globalVolume = Number(stats?.totalVolume || 1) / 1_000_000;
            const share = (netBalance / globalVolume) * 100;
            
            // 3. GENERATE COMPARATIVE INTELLIGENCE
            allPositions.push({
              symbol: "USDC",
              amount: netBalance.toFixed(4),
              type: "MARKET EXPOSURE",
              marketShare: `${share.toFixed(4)}%`,
              volatilityIndex: Number(stats?.transferCount) > 1000 ? "HIGH" : "STABLE",
              implication: `Core Liquidity Shield. Market status: ${stats?.transferCount || 0} active transfers with ${stats?.whaleVolume || 0} whale volume.`,
              agentAnalysis: `Your USDC collateral is providing a stable floor for your WBTC debt. Your holding commands ${share.toFixed(4)}% of current hourly market flow—this is an Elite Hedge configuration.`
            });
          }

          // Note: To add WBTC or DAI, you would replicate the logic above 
          // or point to additional subgraphs.
          setIntelligence(allPositions);
        }
      } catch (err) {
        console.error("Sentinel Intelligence Engine Offline:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchEliteMetrics();
  }, [address, isConnected]);

  return { 
    intelligence, 
    isLoading, 
    hasPositions: intelligence.length > 0 
  };
}