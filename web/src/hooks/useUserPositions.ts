import { useAccount, useReadContract } from 'wagmi';
import { formatUnits } from 'viem';

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
    const { address } = useAccount();

    const { data, isLoading } = useReadContract({
        address: DATA_PROVIDER,
        abi: ABI,
        functionName: 'getUserReservesData',
        args: address ? [POOL_ADDRESS, address] : undefined,
        query: { enabled: !!address }
    });

    const getPlainEnglish = (symbol: string, isDebt: boolean) => {
        if (symbol === 'USDC' && !isDebt) return "Stability anchor. Your dollar-pegged collateral keeps you safe from market swings.";
        if (symbol === 'WBTC' && isDebt) return "Strategic debt. You've borrowed Bitcoin, meaning you're effectively 'shorting' it—if BTC drops, your debt gets cheaper.";
        return isDebt ? "Active loan that requires monitoring." : "Asset provided as collateral.";
    };

    // We filter for any balance that is strictly greater than zero (BigInt 0n)
    const rawPositions = data?.[0] || [];
    const positions = rawPositions
        .filter(res => res.currentATokenBalance > 0n || res.currentVariableDebt > 0n)
        .map(res => {
            const isDebt = res.currentVariableDebt > 0n;
            const amount = isDebt ? res.currentVariableDebt : res.currentATokenBalance;
            return {
                symbol: res.symbol,
                amount: Number(formatUnits(amount, Number(res.decimals))),
                isDebt,
                implication: getPlainEnglish(res.symbol, isDebt)
            };
        });

    return { positions, isLoading };
}