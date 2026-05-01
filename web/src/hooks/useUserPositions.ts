import { useAccount } from 'wagmi';
import { useState, useEffect } from 'react';

// Replace with your actual Subgraph Query URLs from The Graph Dashboard
const AAVE_SUBGRAPH_URL = "https://gateway.thegraph.com/api/[YOUR_API_KEY]/subgraphs/id/[AAVE_SUBGRAPH_ID]";

export function useUserPositions() {
  const { address } = useAccount();
  const [positions, setPositions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!address) return;

    const fetchSubgraphData = async () => {
      setIsLoading(true);
      try {
        // GraphQL query tailored to your AAVE-Subgraph schema
        const query = `
          {
            userReserves(where: { user: "${address.toLowerCase()}" }) {
              reserve {
                symbol
                decimals
              }
              currentATokenBalance
              currentVariableDebt
            }
          }
        `;

        const response = await fetch(AAVE_SUBGRAPH_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query }),
        });

        const { data } = await response.json();
        
        if (data && data.userReserves) {
          const formatted = data.userReserves
            .filter((res: any) => res.currentATokenBalance > 0 || res.currentVariableDebt > 0)
            .map((res: any) => {
              const isDebt = Number(res.currentVariableDebt) > 0;
              const symbol = res.reserve.symbol;
              
              return {
                symbol: symbol,
                amount: isDebt ? res.currentVariableDebt : res.currentATokenBalance,
                isDebt,
                implication: symbol.includes('USDC') 
                  ? "Collateralized stability. Your USDC prevents liquidation during BTC volatility."
                  : "Active borrowing strategy. High-performance debt management detected."
              };
            });
          setPositions(formatted);
        }
      } catch (error) {
        console.error("Subgraph fetch failed:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSubgraphData();
  }, [address]);

  return { positions, isLoading, hasPositions: positions.length > 0 };
}