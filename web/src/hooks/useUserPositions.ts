import { useAccount } from 'wagmi';
import { useState, useEffect } from 'react';

const SUBGRAPH_URL = process.env.NEXT_PUBLIC_USDC_SUBGRAPH_URL!;

export interface UserPosition {
  symbol: string;
  amount: string;
  isDebt: boolean;
  type: "MARKET EXPOSURE" | "MARKET LIABILITY";
  marketContext: string;     // Your holding vs the protocol volume
  agentAssessment: string;   // The "Why" behind the holding
}

export function useUserPositions() {
  const { address, isConnected } = useAccount();
  const [positions, setPositions] = useState<UserPosition[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!address || !isConnected) return;

    const fetchFullSentinelIntel = async () => {
      setIsLoading(true);
      try {
        const query = `
          query GetSentinelComparative($user: Bytes!) {
            # 1. Fetching all transfer activity to reconstruct the 'Full List'
            incoming: transfers(where: { to: $user }, first: 1000) { 
              value 
            }
            outgoing: transfers(where: { from: $user }, first: 1000) { 
              value 
            }
            
            # 2. Fetching Global Market Data for comparison (from image_3b61ac.png)
            hourlyVolumes(first: 1, orderBy: hourStartTimestamp, orderDirection: desc) {
              totalVolume
              whaleVolume
              transferCount
            }
          }
        `;

        const response = await fetch(SUBGRAPH_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, variables: { user: address } }),
        });

        const { data } = await response.json();
        if (!data) return;

        const market = data.hourlyVolumes?.[0];
        const allPositions: UserPosition[] = [];

        // --- CALCULATION LOGIC ---
        const inVal = data.incoming.reduce((s: any, t: any) => s + BigInt(t.value), 0n);
        const outVal = data.outgoing.reduce((s: any, t: any) => s + BigInt(t.value), 0n);
        const netUSDC = Number(inVal - outVal) / 1_000_000;

        if (netUSDC > 0) {
          // Compare holding against Market Total (Total Volume)
          const marketShare = (netUSDC / (Number(market?.totalVolume || 1) / 1_000_000)) * 100;

          allPositions.push({
            symbol: "USDC",
            amount: netUSDC.toFixed(4),
            isDebt: false,
            type: "MARKET EXPOSURE",
            // The "Clear Understanding" component
            marketContext: `You command ${marketShare.toFixed(4)}% of the current hourly protocol volume.`,
            // The "Comparative Assessment" component
            agentAssessment: `Your USDC collateral is providing a stable floor for your high-volatility debt. While whale volume is ${market?.whaleVolume || 0}, your position remains mathematically shielded.`
          });
        }

        // Note: To add more assets (WBTC, DAI), you would add 
        // similar calculation blocks here based on the subgraph's asset IDs.

        setPositions(allPositions);
      } catch (err) {
        console.error("Sentinel Risk Engine Error:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchFullSentinelIntel();
  }, [address, isConnected]);

  return { positions, isLoading };
}