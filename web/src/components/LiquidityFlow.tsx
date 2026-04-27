'use client';

import React, { useMemo, useState } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { useQuery, gql } from '@apollo/client';
import { Activity } from 'lucide-react';

/**
 * Queries the subgraph's pre-computed HourlyVolume aggregate and renders USDC
 * transfer activity across 24H / 7D / 30D windows. We pull up to 720 hourly
 * buckets (30d * 24h) in one query, then aggregate client-side into the
 * granularity that fits each range:
 *   - 24H → 24 hourly bars
 *   - 7D  → 28 bars (6h bins)
 *   - 30D → 30 bars (daily bins)
 *
 * The aggregate is computed by the subgraph mapping on every Transfer — see
 * subgraph/src/USDC.ts. This lets the UI render instantly regardless of how
 * many raw events exist in the target window.
 */
const GET_HOURLY_VOLUMES = gql`
  query GetHourlyVolumes($first: Int!) {
    hourlyVolumes(
      first: $first
      orderBy: hourStartTimestamp
      orderDirection: desc
    ) {
      id
      hourStartTimestamp
      totalVolume
      whaleVolume
      transferCount
    }
  }
`;

const WHALE_LABEL = '>$1M';

type Range = '24H' | '7D' | '30D';

const RANGE_CONFIG: Record<
  Range,
  { hoursBack: number; binHours: number; title: string }
> = {
  '24H': { hoursBack: 24, binHours: 1, title: '24h' },
  '7D': { hoursBack: 24 * 7, binHours: 6, title: '7d' },
  '30D': { hoursBack: 24 * 30, binHours: 24, title: '30d' },
};

interface HourlyRow {
  id: string;
  hourStartTimestamp: string;
  totalVolume: string;
  whaleVolume: string;
  transferCount: number;
}

interface Bucket {
  label: string;
  timestamp: number;
  total: number;
  whale: number;
  transfers: number;
}

const LiquidityFlow = () => {
  const [range, setRange] = useState<Range>('24H');

  const { data, loading, error } = useQuery<{ hourlyVolumes: HourlyRow[] }>(
    GET_HOURLY_VOLUMES,
    {
      variables: { first: RANGE_CONFIG['30D'].hoursBack },
      pollInterval: 30_000,
    },
  );

  const { chartData, totalVolume, totalTransfers } = useMemo<{
    chartData: Bucket[];
    totalVolume: number;
    totalTransfers: number;
  }>(() => {
    if (!data?.hourlyVolumes?.length) {
      return { chartData: [], totalVolume: 0, totalTransfers: 0 };
    }

    const cfg = RANGE_CONFIG[range];

    // Subgraph returns desc; take the freshest N hours for this range, then
    // reverse so the timeline reads left-to-right.
    const windowed = data.hourlyVolumes.slice(0, cfg.hoursBack);
    const asc = [...windowed].reverse();

    // Bin into cfg.binHours-wide buckets. The *start* timestamp of each bin is
    // the floor of the earliest hour in the bin at (binHours * 3600)s.
    const binSecs = cfg.binHours * 3600;
    const bins = new Map<number, Bucket>();

    let total = 0;
    let transfers = 0;

    for (const row of asc) {
      const ts = Number(row.hourStartTimestamp);
      const binStart = Math.floor(ts / binSecs) * binSecs;
      const totalUsdc = Number(row.totalVolume) / 1e6;
      const whaleUsdc = Number(row.whaleVolume) / 1e6;

      total += totalUsdc;
      transfers += row.transferCount;

      const existing = bins.get(binStart);
      if (existing) {
        existing.total += totalUsdc;
        existing.whale += whaleUsdc;
        existing.transfers += row.transferCount;
      } else {
        bins.set(binStart, {
          timestamp: binStart,
          label: labelFor(binStart, range),
          total: totalUsdc,
          whale: whaleUsdc,
          transfers: row.transferCount,
        });
      }
    }

    const sorted = Array.from(bins.values()).sort(
      (a, b) => a.timestamp - b.timestamp,
    );
    return { chartData: sorted, totalVolume: total, totalTransfers: transfers };
  }, [data, range]);

  const hasData = chartData.length > 0 && totalVolume > 0;
  const rangeTitle = RANGE_CONFIG[range].title;

  return (
    <div className="bg-[#0f172a] border border-gray-800 rounded-xl p-6 w-full h-[360px] shadow-2xl flex flex-col">
      <div className="flex justify-between items-start mb-4 gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-gray-400">
          <Activity size={16} className="text-blue-500" />
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-widest">
              USDC Transfer Volume ({rangeTitle})
            </h2>
            {hasData && (
              <p className="text-[10px] text-gray-600 mt-0.5">
                {totalTransfers.toLocaleString()} transfers indexed
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <RangePicker value={range} onChange={setRange} />
          {hasData && (
            <div className="text-[10px] text-green-400 font-mono bg-green-500/10 px-2 py-0.5 rounded whitespace-nowrap">
              ${(totalVolume / 1_000_000).toFixed(2)}M
            </div>
          )}
        </div>
      </div>

      {loading && !hasData ? (
        <div className="flex-1 flex items-center justify-center text-xs text-gray-500">
          Loading hourly aggregate…
        </div>
      ) : error ? (
        <div className="flex-1 flex items-center justify-center text-xs text-red-400 text-center px-4">
          Subgraph error: {error.message}
        </div>
      ) : !hasData ? (
        <div className="flex-1 flex items-center justify-center text-xs text-gray-500 text-center px-4">
          No data in the last {rangeTitle} — check NEXT_PUBLIC_USDC_SUBGRAPH_URL
          or wait for the indexer to sync.
        </div>
      ) : (
        <>
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorWhale" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.5} />
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>
                </defs>

                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#1e293b"
                  vertical={false}
                />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: '#64748b' }}
                  minTickGap={28}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: '#64748b' }}
                  tickFormatter={(v: number) => `$${(v / 1e6).toFixed(1)}M`}
                  width={60}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    border: '1px solid #1e293b',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                  formatter={(v: number) =>
                    `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                  }
                />

                <Area
                  type="monotone"
                  dataKey="total"
                  name="All transfers"
                  stroke="#3b82f6"
                  fillOpacity={1}
                  fill="url(#colorTotal)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="whale"
                  name={`Whale (${WHALE_LABEL})`}
                  stroke="#22c55e"
                  fillOpacity={1}
                  fill="url(#colorWhale)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="flex justify-center gap-6 mt-2">
            <Legend color="bg-blue-500" label="All transfers" />
            <Legend color="bg-green-500" label={`Whale (${WHALE_LABEL})`} />
          </div>
        </>
      )}
    </div>
  );
};

function labelFor(tsSeconds: number, range: Range): string {
  const d = new Date(tsSeconds * 1000);
  if (range === '24H') {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  if (range === '7D') {
    // e.g. "Mon 18:00"
    return d.toLocaleString([], {
      weekday: 'short',
      hour: '2-digit',
    });
  }
  // 30D → daily
  return d.toLocaleDateString([], { month: 'short', day: '2-digit' });
}

function RangePicker({
  value,
  onChange,
}: {
  value: Range;
  onChange: (r: Range) => void;
}) {
  const ranges: Range[] = ['24H', '7D', '30D'];
  return (
    <div
      role="group"
      aria-label="Time range"
      className="inline-flex rounded-md border border-gray-800 overflow-hidden"
    >
      {ranges.map((r) => {
        const active = r === value;
        return (
          <button
            key={r}
            onClick={() => onChange(r)}
            className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest transition-colors ${
              active
                ? 'bg-blue-600 text-white'
                : 'bg-transparent text-gray-500 hover:text-white hover:bg-gray-800/50'
            }`}
            aria-pressed={active}
          >
            {r}
          </button>
        );
      })}
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2 text-[10px] text-gray-500 font-bold uppercase tracking-widest">
      <div className={`w-2 h-2 rounded-full ${color}`} />
      {label}
    </div>
  );
}

export default LiquidityFlow;
