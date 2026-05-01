import { useAccount, useReadContract, useReadContracts } from 'wagmi';
import { formatUnits } from 'viem';
import { arbitrum } from 'wagmi/chains';

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

  const { data, isLoading } = useReadContract({
    address: DATA_PROVIDER_ADDRESS,
    abi: ABI,
    functionName: 'getUserReservesData',
    args: [POOL_ADDRESS, address!],
    query: { enabled: !!address, refetchInterval: 15_000 },
  });

  const positions = data?.[0]
    .map((res) => ({
      symbol: res.symbol,
      supply: Number(formatUnits(res.currentATokenBalance, res.decimals)),
      debt: Number(formatUnits(res.currentVariableDebt, res.decimals)),
      isCollateral: res.usageAsCollateralEnabled,
    }))
    .filter((p) => p.supply > 0 || p.debt > 0) || [];

  const getPlainEnglish = (p: any) => {
    if (p.debt > 0 && p.symbol === 'WBTC') return "You're shorting Bitcoin. If the market crashes, your debt value drops—making you safer.";
    if (p.supply > 0 && p.symbol === 'USDC') return "This is your core stability. It doesn't move with the market, acting as your primary safety net.";
    if (p.debt > 0 && p.symbol === 'DAI') return "This is a stablecoin loan. Safe, but watch the borrowing interest rate.";
    return "Standard market-exposed position.";
  };

  return { 
    positions: positions.map(p => ({ ...p, implication: getPlainEnglish(p) })), 
    isLoading 
  };
}