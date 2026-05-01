'use client';

import AaveRiskGauge from '@/components/AaveRiskGauge';
import LiquidityFlow from '@/components/LiquidityFlow';
import AaveMarketsOverview from '@/components/AaveMarketsOverview';
import WhaleFeed from '@/components/WhaleFeed';
import UsdcPeg from '@/components/UsdcPeg';

export default function Home() {
  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-3xl font-black text-white mb-2 tracking-tight">
          Market Overview
        </h1>
        <p className="text-gray-500 text-sm max-w-2xl">
          Real-time on-chain liquidity and position-risk data from Arbitrum One,
          indexed by a custom subgraph on The Graph and Aave V3&apos;s official
          subgraph.
        </p>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AaveRiskGauge />
        <LiquidityFlow />
      </div>

      <AaveMarketsOverview />

      <WhaleFeed />

      <section className="p-6 bg-[#0f172a]/60 border border-gray-800 rounded-xl">
        <h2 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-4">
          Protocol Status
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatBox label="Network" value="Arbitrum One" />
          <StatBox label="L2 Status" value="Operational" color="text-green-400" />
          <StatBox label="Indexer" value="The Graph" />
          <UsdcPeg />
        </div>
      </section>
    </div>
  );
}

function StatBox({
  label,
  value,
  color = 'text-white',
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div>
      <p className="text-[10px] text-gray-600 font-bold uppercase tracking-widest">
        {label}
      </p>
      <p className={`text-sm font-mono mt-1 ${color}`}>{value}</p>
    </div>
  );
}
