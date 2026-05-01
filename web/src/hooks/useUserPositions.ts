import { useAccount } from 'wagmi';
import { useState, useEffect } from 'react';

const USDC_SUBGRAPH_URL = process.env.NEXT_PUBLIC_USDC_SUBGRAPH_URL!;

export function useUserPositions() {
  const { address, isConnected } = useAccount();
  const [positions, setPositions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!address || !isConnected) return;

    const fetchSentinelForensics = async () => {
      setIsLoading(true);
      try {
        // Correcting the Type Mismatch: Passing address as Bytes
        // Using the existing entities from your Explorer: transfers and hourlyVolumes
        const query = `
          query GetSentinelForensics($user: Bytes!) {
            incoming: transfers(where: { to: $user }) {
              value
            }
            outgoing: transfers(where: { from: $user }) {
              value
            }
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
          // 1. Calculate Net Balance (Accounting for the missing 'Account' entity)
          const incoming = data.incoming?.reduce((sum: any, t: any) => sum + BigInt(t.value), 0n) || 0n;
          const outgoing = data.outgoing?.reduce((sum: any, t: any) => sum + BigInt(t.value), 0n) || 0n;
          
          // USDC typically has 6 decimals
          const netBalance = Number(incoming - outgoing) / 1_000_000;

          if (netBalance > 0) {
            const whaleData = data.hourlyVolumes?.[0];
            
            setPositions([{
              symbol: "USDC",
              amount: netBalance.toFixed(4),
              isDebt: false,
              type: "MARKET EXPOSURE",
              // Integrating global whaleVolume from your image_3b61ac.png sidebar
              assessment: `Core Liquidity Shield. Transaction ledger confirms active presence. Protocol whale volume is currently ${whaleData?.whaleVolume || 'stable'}.`
            }]);
          } else {
            setPositions([]);
          }
        }
      } catch (err) {
        console.error("Sentinel Ledger Error:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSentinelForensics();
  }, [address, isConnected]);

  return { positions, isLoading, hasPositions: positions.length > 0 };
}