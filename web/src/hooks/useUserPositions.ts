import { useAccount, useReadContract } from 'wagmi';
import { formatUnits } from 'viem';

// AAVE V3 ARBITRUM ONE ADDRESSES
const DATA_PROVIDER = '0x69FA688f1Dc474759186cFE4639561726763631C';
const POOL_ADDRESS = '0x794a61358D6845594F94dc1DB02A252b5b4814aD';

const ABI = [{
    name: 'getUserReservesData',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'market', type: 'address' }, { name: 'user', type: 'address' }],
    outputs: [
        {
            components: [
                { name: 'underlyingAsset', type: 'address' },
                { name: 'name', type: 'string' },
                { name: 'symbol', type: 'string' },
                { name: 'decimals', type: 'uint256' },
                { name: 'currentATokenBalance', type: 'uint256' },
                { name: 'currentVariableDebt', type: 'uint256' },
                { name: 'usageAsCollateralEnabled', type: 'bool' },
            ],
            type: 'tuple[]',
        },
        { name: 'userEmode', type: 'uint256' }
    ],
}] as const;

export function useUserPositions() {
    const { address, isConnected } = useAccount();

    const { data, isLoading } = useReadContract({
        address: DATA_PROVIDER,
        abi: ABI,
        functionName: 'getUserReservesData',
        args: address ? [POOL_ADDRESS, address] : undefined,
        query: { 
            enabled: !!address && isConnected,
            refetchInterval: 10_000 // Refresh every 10s
        }
    });

    const getImplication = (symbol: string, isDebt: boolean) => {
        if (symbol.includes('USDC')) return "Your core safety net. This collateral is currently buffering your total position against liquidation.";
        if (symbol.includes('BTC') || symbol.includes('ETH')) return isDebt ? "Strategic short exposure. You benefit if this asset's price drops relative to your collateral." : "Growth collateral. High volatility asset powering your borrow capacity.";
        return isDebt ? "Variable interest liability." : "Yield-bearing collateral asset.";
    };

    // IMPROVED FILTER: Captures scaled balances and ignores dust
    const positions = (data?.[0] || [])
        .filter(res => {
            // Check for balance > 0.01 to ignore dust/scam tokens
            const hasSupply = res.currentATokenBalance > 1000n; 
            const hasDebt = res.currentVariableDebt > 1000n;
            return hasSupply || hasDebt;
        })
        .map(res => {
            const isDebt = res.currentVariableDebt > res.currentATokenBalance;
            const balance = isDebt ? res.currentVariableDebt : res.currentATokenBalance;
            
            return {
                symbol: res.symbol,
                amount: formatUnits(balance, Number(res.decimals)),
                isDebt,
                implication: getImplication(res.symbol, isDebt)
            };
        });

    return { 
        positions, 
        isLoading: isLoading && isConnected,
        hasPositions: positions.length > 0
    };
}