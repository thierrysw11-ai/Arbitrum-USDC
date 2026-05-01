import { useAccount } from 'wagmi';
import { useState, useEffect } from 'react';

// Using the Aave Subgraph URL you provided
const AAVE_URL = process.env.NEXT_PUBLIC_AAVE_SUBGRAPH_URL || "https://gateway.thegraph.com/api/667145d8096c00f8dbc45f26fd93d415/subgraphs/id/Hr4ZdBkwkeENLSXwRLCPUQ1Xh5ep9S36dMz7PMcxwCp3";

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
        /**
         * Schema Fix: Querying 'supplies' and 'borrows' directly.
         * This avoids the "Cannot query field positions on type Account" error.
         */
        const query = `
          query GetUserSentinelData($user: String!) {
            supplies(where: { account: $user }) {
              amount
              reserve {
                symbol
                decimals
              }
            }
            borrows(where: { account: $user }) {
              amount
              reserve {
                symbol
                decimals
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

        const { data, errors } = await response.json();
        
        if (errors) {
          console.error("Subgraph Validation Error:", errors);
          return;
        }

        const finalPositions: UserPosition[] = [];

        // 1. Process Collateral (Supplies)
        if (data?.supplies) {
          data.supplies.forEach((s: any) => {
            const amount = (Number(s.amount) / Math.pow(10, s.reserve.decimals)).toFixed(4);
            if (Number(amount) > 0) {
              finalPositions.push({
                symbol: s.reserve.symbol,
                amount,
                isDebt: false,
                implication: s.reserve.symbol.includes('USDC') 
                  ? "Core Liquidity Shield. This stable collateral protects your health factor from BTC/ETH volatility." 
                  : "Yield-bearing collateral asset powering your account's borrowing capacity."
              });
            }
          });
        }

        // 2. Process Debt (Borrows)
        if (data?.borrows) {
          data.borrows.forEach((b: any) => {
            const amount = (Number(b.amount) / Math.pow(10, b.reserve.decimals)).toFixed(4);
            if (Number(amount) > 0) {
              finalPositions.push({
                symbol: b.reserve.symbol,
                amount,
                isDebt: true,
                implication: "Strategic Liability. Your position is mathematically hedged if this asset's price drops."
              });
            }
          });
        }

        setPositions(finalPositions);
      } catch (err) {
        console.error("Sentinel Analysis Connection Failed:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSentinelData();
  }, [address, isConnected]);

  return { 
    positions, 
    isLoading, 
    hasPositions: positions.length > 0 
  };
}