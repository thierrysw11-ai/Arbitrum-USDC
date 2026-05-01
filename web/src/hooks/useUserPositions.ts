import { useAccount } from 'wagmi';
import { useState, useEffect } from 'react';

/**
 * ELITE SUBGRAPH INTEGRATION
 * Pulls directly from the decentralized Graph network using your 
 * unique API key and Subgraph IDs.
 */
const AAVE_SUBGRAPH_URL = process.env.NEXT_PUBLIC_AAVE_SUBGRAPH_URL || "https://gateway.thegraph.com/api/667145d8096c00f8dbc45f26fd93d415/subgraphs/id/Hr4ZdBkwkeENLSXwRLCPUQ1Xh5ep9S36dMz7PMcxwCp3";

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
    // Only fetch if the wallet is connected and address exists
    if (!address || !isConnected) {
      setPositions([]);
      return;
    }

    const fetchSentinelData = async () => {
      setIsLoading(true);
      try {
        /**
         * Querying the 'account' entity to get all lending and borrowing 
         * positions associated with the current wallet.
         */
        const query = `
          query GetUserSentinelData($user: String!) {
            account(id: $user) {
              positions {
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

        const response = await fetch(AAVE_SUBGRAPH_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            query, 
            variables: { user: address.toLowerCase() } 
          }),
        });

        const json = await response.json();
        const rawPositions = json.data?.account?.positions || [];

        const formattedPositions = rawPositions.map((p: any) => {
          const isDebt = p.side === 'BORROWER';
          const symbol = p.asset.symbol;
          
          // Format balance based on asset decimals
          const amount = (Number(p.balance) / Math.pow(10, p.asset.decimals)).toFixed(4);

          // Generate AI-style implications for the Sentinel UI
          let implication = "";
          if (symbol.includes('USDC')) {
            implication = "Core Liquidity Shield. This collateral is currently neutralizing your liquidation risk.";
          } else if (symbol.includes('BTC') || symbol.includes('ETH')) {
            implication = isDebt 
              ? "Short-bias exposure. You are effectively shorting this asset against your stable collateral."
              : "High-conviction collateral. Volatility in this asset heavily impacts your Health Factor.";
          } else {
            implication = isDebt 
              ? "Standard liability. Interest is accruing on this borrow position."
              : "Yield-bearing asset. Contributing to your total borrowing power.";
          }

          return {
            symbol,
            amount,
            isDebt,
            implication
          };
        });

        setPositions(formattedPositions);
      } catch (error) {
        console.error("Sentinel Analysis: Subgraph link failed", error);
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