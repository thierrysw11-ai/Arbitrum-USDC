import { useAccount } from 'wagmi';
import { useState, useEffect } from 'react';

const AAVE_URL = process.env.NEXT_PUBLIC_AAVE_SUBGRAPH_URL!;

export interface UserPosition {
  symbol: string;
  amount: string;
  isDebt: boolean;
  implication: string;
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

    const fetchSentinelData = async () => {
      setIsLoading(true);
      try {
        // This query matches the 'account' and 'positions' fields from your screenshot
        const query = `
          query GetUserPositions($user: String!) {
            account(id: $user) {
              positions {
                hash
                side
                balance
                asset {
                  symbol
                  decimals
                }
              }
            }
          }
        `;

        const response = await fetch(AAVE_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            query, 
            variables: { user: address.toLowerCase() } 
          }),
        });

        const { data } = await response.json();
        
        if (data?.account?.positions) {
          const formatted = data.account.positions
            .filter((p: any) => BigInt(p.balance) > 0n)
            .map((p: any) => {
              const isDebt = p.side === 'BORROWER';
              const symbol = p.asset.symbol;
              const decimals = p.asset.decimals;
              
              // Standardizing balance calculation
              const amount = (Number(p.balance) / Math.pow(10, decimals)).toFixed(4);

              return {
                symbol,
                amount,
                isDebt,
                implication: symbol.includes('USDC') 
                  ? "Collateral Base: This stable liquidity is your primary defense against market volatility."
                  : isDebt 
                  ? "Variable Liability: Strategic debt position. Performance is linked to market drawdown."
                  : "Growth Collateral: High-utility asset increasing your total borrowing power."
              };
            });
          setPositions(formatted);
        }
      } catch (err) {
        console.error("Sentinel Analysis Error:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSentinelData();
  }, [address, isConnected]);

  return { positions, isLoading, hasPositions: positions.length > 0 };
}