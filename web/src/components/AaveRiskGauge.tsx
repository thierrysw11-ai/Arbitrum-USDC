'use client';

import React from 'react';
import { useAccount, useReadContract } from 'wagmi';
import { arbitrum } from 'wagmi/chains';
import { formatUnits } from 'viem';
import { ShieldCheck } from 'lucide-react';
import RiskGauge from './RiskGauge';

// Aave V3 Pool on Arbitrum One
// https://docs.aave.com/developers/deployed-contracts/v3-mainnet/arbitrum
const AAVE_V3_POOL = '0x794a61358D6845594F94dc1DB02A252b5b4814aD' as const;

const AAVE_V3_POOL_ABI = [
  {
    name: 'getUserAccountData',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [
      { name: 'totalCollateralBase', type: 'uint256' },
      { name: 'totalDebtBase', type: 'uint256' },
      { name: 'availableBorrowsBase', type: 'uint256' },
      { name: 'currentLiquidationThreshold', type: 'uint256' },
      { name: 'ltv', type: 'uint256' },
      { name: 'healthFactor', type: 'uint256' },
    ],
  },
] as const;

const AaveRiskGauge = () => {
  const { address, isConnected } = useAccount();

  const { data, isLoading, error } = useReadContract({
    address: AAVE_V3_POOL,
    abi: AAVE_V3_POOL_ABI,
    functionName: 'getUserAccountData',
    chainId: arbitrum.id,
    args: address ? [address] : undefined,
    query: {
      enabled: Boolean(address),
      refetchInterval: 30_000,
    },
  });

  // Not connected — prompt wallet connection
  if (!isConnected || !address) {
    return (
      <Shell>
        <div className="flex flex-col items-center justify-center text-center py-12 gap-3">
          <ShieldCheck className="text-gray-600" size={32} />
          <p className="text-sm text-gray-400 font-semibold">
            Connect your wallet to view your Aave V3 position risk.
          </p>
          <p className="text-[11px] text-gray-600 max-w-xs">
            Data is read-only — we call{' '}
            <code className="font-mono text-gray-400">getUserAccountData</code>{' '}
            on the Aave V3 Pool contract directly.
          </p>
        </div>
      </Shell>
    );
  }

  if (isLoading) {
    return (
      <Shell>
        <div className="flex items-center justify-center py-16 text-xs text-gray-500">
          Loading position…
        </div>
      </Shell>
    );
  }

  if (error) {
    return (
      <Shell>
        <div className="flex items-center justify-center py-16 text-xs text-red-400">
          Error fetching position: {error.message}
        </div>
      </Shell>
    );
  }

  // data = [totalCollateralBase, totalDebtBase, availableBorrowsBase, currentLiquidationThreshold, ltv, healthFactor]
  const [totalCollateralBase, totalDebtBase, , , , healthFactorRaw] = (data ??
    []) as readonly bigint[];

  const hasDebt = (totalDebtBase ?? 0n) > 0n;
  // Aave returns uint256.max when there's no debt. Clamp to a big display number.
  const healthFactor = hasDebt
    ? Number(formatUnits(healthFactorRaw ?? 0n, 18))
    : 1000; // "effectively infinite"

  const hasPosition = (totalCollateralBase ?? 0n) > 0n || hasDebt;

  if (!hasPosition) {
    return (
      <Shell>
        <div className="flex flex-col items-center justify-center text-center py-12 gap-2">
          <p className="text-sm text-gray-400 font-semibold">
            No active Aave V3 position on Arbitrum.
          </p>
          <p className="text-[11px] text-gray-600 max-w-xs">
            Supply or borrow assets on{' '}
            <a
              href="https://app.aave.com/?marketName=proto_arbitrum_v3"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:underline"
            >
              app.aave.com
            </a>{' '}
            to see your health factor here.
          </p>
        </div>
      </Shell>
    );
  }

  return <RiskGauge healthFactor={healthFactor} />;
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-[#0f172a] border border-gray-800 rounded-xl p-6 min-h-[320px]">
      <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">
        Aave V3 Risk Profile
      </h3>
      {children}
    </div>
  );
}

export default AaveRiskGauge;
