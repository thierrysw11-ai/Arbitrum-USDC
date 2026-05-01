import { useAccount } from 'wagmi';
import { useState, useEffect } from 'react';

const AAVE_URL = process.env.NEXT_PUBLIC_AAVE_SUBGRAPH_URL!;

export function useUserPositions() {
  const { address, isConnected } = useAccount();
  const [positions, setPositions] = useState<any[]>([]);
  const [marketTrends, setMarketTrends] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!address || !isConnected) return;

    const fetchSentinelIntelligence = async () => {
      setIsLoading(true);
      try {
        const query = `
          query GetSentinelIntelligence($user: String!) {
            # User Personal Data
            accounts(where: { id: $user }) {
              supplies(orderBy: timestamp, orderDirection: desc) {
                amount
                reserve { symbol decimals }
              }
              borrows(orderBy: timestamp, orderDirection: desc) {
                amount
                reserve { symbol decimals }
              }
            }
            # Global Market Context (from your screenshot)
            hourlyVolumes(first: 1, orderBy: hourStartTimestamp, orderDirection: desc) {
              totalVolume
              whaleVolume
              transferCount
            }
          }
        `;

        const response = await fetch(AAVE_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, variables: { user: address.toLowerCase() } }),
        });

        const { data } = await response.json();
        const userData = data?.accounts?.[0];
        const globalVolume = data?.hourlyVolumes?.[0];

        // Process positions and generate the "Agent Assessment"
        const finalPositions = processPositions(userData, globalVolume);
        setPositions(finalPositions);
        setMarketTrends(globalVolume);
      } catch (err) {
        console.error("Sentinel Intelligence Error:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSentinelIntelligence();
  }, [address, isConnected]);

  return { positions, marketTrends, isLoading };
}

// Logic to generate the "Agent Assessment" sentences seen in image_3bbbe3.png
function processPositions(userData: any, globalVolume: any) {
  const processed: any[] = [];
  if (!userData) return [];

  // Example logic for USDC Collateral mapping to your UI
  userData.supplies?.forEach((s: any) => {
    processed.push({
      symbol: s.reserve.symbol,
      amount: (Number(s.amount) / Math.pow(10, s.reserve.decimals)).toFixed(4),
      isDebt: false,
      type: "MARKET EXPOSURE",
      assessment: `Core Liquidity Shield. Current protocol whale volume is ${globalVolume?.whaleVolume || 'stable'}, protecting your health factor.`
    });
  });

  return processed;
}