import { useAccount, useReadContract } from 'wagmi';
import { formatUnits } from 'viem';
import { arbitrum } from 'wagmi/chains';

// Aave Protocol Data Provider on Arbitrum One
const DATA_PROVIDER_ADDRESS = '0x69FA688f1Dc474759186cFE4639561726763631C';
const POOL_ADDRESS = '0x794a61358D6845594F94dc1DB02A252b5b4814aD';

const ABI = [
  {
    name: 'getUserReservesData',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'market', type: 'address' },
      { name: 'user', type: 'address' }
    ],
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
      { name: 'userReservesConfig', type: 'uint256' }
    ],
  },
] as const;

export function useUserPositions() {
  const { address } = useAccount();

  const { data, isLoading, error } = useReadContract({
    address: DATA_PROVIDER_ADDRESS,
    abi: ABI,
    functionName: 'getUserReservesData',
    args: address ? [POOL_ADDRESS, address] : undefined,
    query: { 
      enabled: !!address, 
      refetchInterval: 15_000 
    },
  });

  // Fixed mapping logic to handle BigInt conversion for TypeScript
  const positions = data?.[0]
    .map((res) => ({
      symbol: res.symbol,
      // res.decimals is a bigint, must be converted to number for formatUnits
      supply: Number(formatUnits(res.currentATokenBalance, Number(res.decimals))),
      debt: Number(formatUnits(res.currentVariableDebt, Number(res.decimals))),
      isCollateral: res.usageAsCollateralEnabled,
    }))
    .filter((p) => p.supply > 0 || p.debt > 0) || [];

  const getPlainEnglish = (p: any) => {
    if (p.debt > 0 && p.symbol === 'WBTC') {
        return "You're shorting Bitcoin. If the market crashes, your debt value drops—making your position safer.";
    }
    if (p.supply > 0 && p.symbol === 'USDC') {
        return "This is your core stability. It acts as your primary safety net against crypto volatility.";
    }
    if (p.debt > 0 && p.symbol === 'DAI') {
        return "This is a stablecoin loan. Low volatility, but watch the borrowing interest rates.";
    }
    return "This position exposes you to direct price fluctuations of the underlying asset.";
  };

  return { 
    positions: positions.map(p => ({ 
      ...p, 
      implication: getPlainEnglish(p) 
    })), 
    isLoading,
    error 
  };
}