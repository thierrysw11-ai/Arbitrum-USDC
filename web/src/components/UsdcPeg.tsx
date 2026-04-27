'use client';

import React from 'react';
import { useReadContract } from 'wagmi';
import { arbitrum } from 'wagmi/chains';
import { TrendingUp, TrendingDown } from 'lucide-react';

/**
 * Live USDC/USD peg readout from the Chainlink price feed on Arbitrum One.
 *
 * Feed:   USDC/USD aggregator
 * Address: 0x50834F3163758fcC1Df9973b6e91f0F0F0434aD3
 * Decimals: 8 (standard Chainlink USD feeds)
 *
 * Why this exists: a stablecoin dApp should make peg health a first-class
 * signal. A 5-bps deviation is benign; a 50-bps deviation tells the user to
 * pause before sending. We render with up/down arrow + colour so the status is
 * legible in a single glance.
 */

const USDC_USD_FEED = '0x50834F3163758fcC1Df9973b6e91f0F0F0434aD3' as const;

const AGGREGATOR_V3_ABI = [
  {
    name: 'latestRoundData',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: 'roundId', type: 'uint80' },
      { name: 'answer', type: 'int256' },
      { name: 'startedAt', type: 'uint256' },
      { name: 'updatedAt', type: 'uint256' },
      { name: 'answeredInRound', type: 'uint80' },
    ],
  },
] as const;

const FEED_DECIMALS = 8;
// Below this absolute deviation from $1.00, badge is green; above is red.
const DEPEG_THRESHOLD = 0.005; // 50 bps

const UsdcPeg = () => {
  const { data, isLoading, error } = useReadContract({
    address: USDC_USD_FEED,
    abi: AGGREGATOR_V3_ABI,
    functionName: 'latestRoundData',
    chainId: arbitrum.id,
    query: {
      // Chainlink USDC/USD heartbeats every 24h (and on >25bps deviation), but
      // we refetch faster for a snappier UI.
      refetchInterval: 60_000,
      staleTime: 30_000,
    },
  });

  if (isLoading || !data) {
    return <Shell label="USDC / USD" value={isLoading ? 'loading…' : '—'} dim />;
  }
  if (error) {
    return <Shell label="USDC / USD" value="oracle error" dim />;
  }

  const answer = data[1] as bigint;
  const price = Number(answer) / Math.pow(10, FEED_DECIMALS);
  const deviation = price - 1;
  const healthy = Math.abs(deviation) < DEPEG_THRESHOLD;
  const trendUp = deviation >= 0;

  return (
    <Shell
      label="USDC / USD"
      value={`$${price.toFixed(4)}`}
      sub={`${trendUp ? '+' : ''}${(deviation * 10000).toFixed(1)} bps`}
      tone={healthy ? 'green' : 'red'}
      icon={
        trendUp ? (
          <TrendingUp size={11} className="text-green-400" />
        ) : (
          <TrendingDown size={11} className="text-red-400" />
        )
      }
    />
  );
};

function Shell({
  label,
  value,
  sub,
  tone = 'neutral',
  icon,
  dim = false,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'green' | 'red' | 'neutral';
  icon?: React.ReactNode;
  dim?: boolean;
}) {
  const valueColor =
    tone === 'green'
      ? 'text-green-400'
      : tone === 'red'
      ? 'text-red-400'
      : 'text-white';
  return (
    <div>
      <p className="text-[10px] text-gray-600 font-bold uppercase tracking-widest">
        {label}
      </p>
      <p
        className={`text-sm font-mono mt-1 flex items-center gap-1.5 ${
          dim ? 'text-gray-500' : valueColor
        }`}
      >
        {icon}
        {value}
        {sub && (
          <span className="text-[10px] text-gray-600 ml-1 font-normal">
            {sub}
          </span>
        )}
      </p>
    </div>
  );
}

export default UsdcPeg;
