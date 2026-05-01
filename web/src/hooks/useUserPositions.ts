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
        // We query 'accounts' as a list filtered by ID to bypass the 'account: null' issue
        const query = `
          query GetUserSentinel($user: String!) {
            accounts(where: { id: $user }) {
              supplies(orderBy: timestamp, orderDirection: desc) {
                amount
                timestamp
                reserve {
                  symbol
                  decimals
                }
              }
              borrows(orderBy: timestamp, orderDirection: desc) {
                amount
                timestamp
                reserve {
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
        
        // Since we query 'accounts' (plural), we take the first result
        const userData = data?.accounts?.[0];
        const finalPositions: UserPosition[] = [];

        if (userData) {
          // 1. Process Supply Events (Collateral)
          const seenSupplies = new Set();
          userData.supplies?.forEach((s: any) => {
            if (!seenSupplies.has(s.reserve.symbol)) {
              const amount = (Number(s.amount) / Math.pow(10, s.reserve.decimals)).toFixed(4);
              if (Number(amount) > 0) {
                finalPositions.push({
                  symbol: s.reserve.symbol,
                  amount,
                  isDebt: false,
                  implication: s.reserve.symbol.includes('USDC') 
                    ? "Core Liquidity Shield. This stable collateral protects your health factor from market volatility." 
                    : "Growth-oriented collateral asset increasing your total borrowing power."
                });
                seenSupplies.add(s.reserve.symbol);
              }
            }
          });

          // 2. Process Borrow Events (Debt)
          const seenBorrows = new Set();
          userData.borrows?.forEach((b: any) => {
            if (!seenBorrows.has(b.reserve.symbol)) {
              const amount = (Number(b.amount) / Math.pow(10, b.reserve.decimals)).toFixed(4);
              if (Number(amount) > 0) {
                finalPositions.push({
                  symbol: b.reserve.symbol,
                  amount,
                  isDebt: true,
                  implication: "Strategic Debt Position. Mathematically hedged against broader market drawdowns."
                });
                seenBorrows.add(b.reserve.symbol);
              }
            }
          });
        }

        setPositions(finalPositions);
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