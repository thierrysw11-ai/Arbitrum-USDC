import { useAccount, useReadContract } from 'wagmi';
import { formatUnits } from 'viem';

// AAVE V3 Arbitrum Core Addresses
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

    const { data, isLoading, isError } = useReadContract({
        address: DATA_PROVIDER,
        abi: ABI,
        functionName: 'getUserReservesData',
        args: address ? [POOL_ADDRESS, address] : undefined,
        query: { 
            enabled: !!address && isConnected,
            staleTime: 5000 
        }
    });

    const getImplication = (symbol: string, isDebt: boolean) => {
        if (symbol.includes('USDC')) return "Stability anchor. Protects your Health Factor from market volatility.";
        if (symbol.includes('BTC')) return "Strategic short. Your debt actually shrinks if Bitcoin's price drops.";
        return isDebt ? "Variable rate loan." : "Collateral asset.";
    };

    // Filter logic specifically targeting non-zero BigInts
    const positions = (data?.[0] || [])
        .filter(res => res.currentATokenBalance > 0n || res.currentVariableDebt > 0n)
        .map(res => {
            const isDebt = res.currentVariableDebt > 0n;
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
        isError 
    };
}