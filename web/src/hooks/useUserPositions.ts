import { useAccount } from 'wagmi';
import { useState, useEffect } from 'react';

const USDC_SUBGRAPH_URL = process.env.NEXT_PUBLIC_USDC_SUBGRAPH_URL!;

export interface UserPosition {
  symbol: string;
  amount: string;
  isDebt: boolean;
  type: string;
  implication: string;      // Fills the card description
  agentAnalysis: string;    // Fills the bottom purple assessment box
}

export function useUserPositions() {
  const { address, isConnected } = useAccount();
  const [positions, setPositions] = useState<UserPosition[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!address || !isConnected) {
      setPositions([]);
      return;
    }

    const fetchSentinelForensics = async () => {
      setIsLoading(true);
      try {
        const query = `
          query GetSentinelForensics($user: Bytes!) {
            # Forensic ledger lookup
            incoming: transfers(where: { to: $user }) { value }
            outgoing: transfers(where: { from: $user }) { value }
            
            # Global intelligence fields from image_3b61ac.png
            hourlyVolumes(first: 1, orderBy: hourStartTimestamp, orderDirection: desc) {
              totalVolume
              whaleVolume
              transferCount
            }
          }
        `;

        const response = await fetch(USDC_SUBGRAPH_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            query, 
            variables: { user: address } 
          }),
        });

        const { data } = await response.json();

        if (data) {
          // 1. Calculate Net Balance for the 'Current Volume' display
          const incoming = data.incoming?.reduce((sum: any, t: any) => sum + BigInt(t.value), 0n) || 0n;
          const outgoing = data.outgoing?.reduce((sum: any, t: any) => sum + BigInt(t.value), 0n) || 0n;
          const netBalance = Number(incoming - outgoing) / 1_000_000;

          if (netBalance > 0) {
            const market = data.hourlyVolumes?.[0];
            
            // 2. Map data to the Elite UI schema
            setPositions([{
              symbol: "USDC",
              amount: netBalance.toFixed(4),
              isDebt: false,
              type: "MARKET EXPOSURE",
              // Fills the empty quotes in image_306274.png
              implication: `Core Liquidity Shield. Market status: ${market?.transferCount || 0} active transfers with ${market?.whaleVolume || 0} institutional whale volume detected.`,
              // Matches the specific copy from image_3bbbe3.png
              agentAnalysis: `Your USDC collateral is providing a stable floor for your WBTC debt. In a market downturn, your health factor will improve as the value of your debt decreases—this is an Elite Hedge configuration.`
            }]);
          } else {
            setPositions([]);
          }
        }
      } catch (err) {
        console.error("Sentinel Intelligence Critical Failure:", err);
        setPositions([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSentinelForensics();
  }, [address, isConnected]);

  return { 
    positions, 
    isLoading, 
    hasPositions: positions.length > 0 
  };
}