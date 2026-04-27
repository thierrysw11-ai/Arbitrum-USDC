'use client';

import React, { useMemo, useState } from 'react';
import { useQuery, gql } from '@apollo/client';
import { useReadContracts } from 'wagmi';
import { arbitrum } from 'wagmi/chains';
import { aaveClient } from '@/lib/apollo';
import { TrendingUp, ArrowDown, ArrowUp } from 'lucide-react';

/**
 * Market-wide view of every Aave V3 reserve on Arbitrum — supply APY, borrow
 * APY, total supplied / borrowed, utilization, and a 7-day activity sparkline.
 *
 * Data sources
 * ============
 * 1. Subgraph (your own deployment, Hr4ZdB...): provides per-reserve metadata
 *    (`symbol`, `name`, `decimals`), the live `liquidityRate` /
 *    `variableBorrowRate` (ray-scaled APR), and aggregate `totalSupply` /
 *    `totalBorrow` in raw token units. Plus `dailyStats` (last 7 days of
 *    `supplyVolume` + `borrowVolume`) for the activity sparkline.
 *
 * 2. Chainlink price feeds (read on-chain via wagmi multicall): one feed per
 *    token symbol → USD price with 8 decimals. Tokens without a Chainlink USD
 *    feed (e.g. wstETH on Arbitrum is an ETH-rate, not a USD feed) display
 *    raw token amounts instead.
 *
 * Rate math
 * =========
 * Aave stores `liquidityRate` and `variableBorrowRate` as ray-scaled (1e27)
 * APR. We convert APR → APY under per-second compounding:
 *   apy = (1 + apr / SEC_PER_YEAR)^SEC_PER_YEAR − 1
 *
 * Schema notes (your subgraph at Hr4ZdBkwkeENLSXwRLCPUQ1Xh5ep9S36dMz7PMcxwCp3)
 * - No stable borrow rate field — only variable. Fine; new Aave V3 markets
 *   are mostly variable-rate anyway.
 * - No `availableLiquidity` / `utilizationRate` / `isActive` flags. We derive
 *   utilization client-side and filter by `totalSupply > 0`.
 * - No on-chain price field on Reserve. Hence the Chainlink multicall above.
 */

const GET_AAVE_MARKETS = gql`
  query GetAaveMarkets {
    reserves(
      first: 50
      orderBy: totalSupply
      orderDirection: desc
    ) {
      id
      symbol
      name
      decimals
      asset
      liquidityRate
      variableBorrowRate
      totalSupply
      totalBorrow
      lastUpdatedAt
      dailyStats(first: 7, orderBy: date, orderDirection: desc) {
        date
        supplyVolume
        borrowVolume
      }
    }
  }
`;

interface DailyStat {
  date: string;
  supplyVolume: string;
  borrowVolume: string;
}

interface ReserveRow {
  id: string;
  symbol: string;
  name: string;
  decimals: number;
  asset: string;
  liquidityRate: string;
  variableBorrowRate: string;
  totalSupply: string;
  totalBorrow: string;
  lastUpdatedAt: string;
  dailyStats: DailyStat[] | null;
}

// ---------------------------------------------------------------------------
// Chainlink USD price feeds on Arbitrum One.
// All feeds return USD with 8 decimals via `latestRoundData()`.
// ---------------------------------------------------------------------------

const PRICE_FEEDS: Record<string, `0x${string}`> = {
  USDC: '0x50834F3163758fcC1Df9973b6e91f0F0F0434aD3',
  USDT: '0x3f3f5dF88dC9F13eac63DF89EC16ef6e7E25DdE7',
  DAI: '0xc5C8E77B397E531B8EC06BFb0048328B30E9eCfB',
  WETH: '0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612',
  WBTC: '0x6ce185860a4963106506C203335A2910413708e9',
  ARB: '0xb2A824043730FE05F3DA2efaFa1CBbe83fa548D6',
  LINK: '0x86E53CF1B870786351Da77A57575e79CB55812CB',
  AAVE: '0xaD1d5344AaDE45F43E596773Bcc4c423EAbdD034',
  FRAX: '0x0809E3d38d1B4214958faf06D8b1B1a2b73f2ab8',
  GMX: '0xDB98056FecFff59D032aB628337A4887110df3dB',
};

// Map common alternate symbols → the feed key above. Aave reserves frequently
// use ".e" / ".E" suffixes for bridged variants which still track the base
// asset's price closely.
const SYMBOL_ALIAS: Record<string, string> = {
  'USDC.E': 'USDC',
  'USDCN': 'USDC',
  ETH: 'WETH',
  'WETH.E': 'WETH',
};

const FEED_ENTRIES = Object.entries(PRICE_FEEDS) as [string, `0x${string}`][];

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

// Minimal ERC20 ABI for resolving token metadata on-chain. We use this when
// the subgraph mapping returned empty `symbol` / `name` strings (which is
// the case for Hr4ZdB...'s current deployment).
const ERC20_META_ABI = [
  {
    name: 'symbol',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'string' }],
  },
  {
    name: 'name',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'string' }],
  },
] as const;

const FEED_DECIMALS = 8;

// ---------------------------------------------------------------------------
// Math helpers
// ---------------------------------------------------------------------------

const SECONDS_PER_YEAR = 31_536_000;
const RAY = 1e27;

const rayToApr = (rayStr: string): number => Number(rayStr) / RAY;
const aprToApy = (apr: number): number =>
  Math.pow(1 + apr / SECONDS_PER_YEAR, SECONDS_PER_YEAR) - 1;

const symbolKey = (s: string): string => {
  const upper = (s || '').toUpperCase().trim();
  return SYMBOL_ALIAS[upper] ?? upper;
};

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

const formatPct = (frac: number): string => `${(frac * 100).toFixed(2)}%`;

const formatUsd = (n: number | null): string => {
  if (n === null || !isFinite(n)) return '—';
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  return n > 0 ? `$${n.toFixed(4)}` : '—';
};

const formatToken = (n: number, sym: string): string => {
  const s = sym || '';
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B ${s}`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M ${s}`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K ${s}`;
  if (n >= 1) return `${n.toFixed(2)} ${s}`;
  if (n > 0) return `${n.toFixed(4)} ${s}`;
  return `0 ${s}`;
};

// ---------------------------------------------------------------------------
// Computed shape for the table
// ---------------------------------------------------------------------------

interface MarketComputed {
  id: string;
  symbol: string;
  name: string;
  supplyApy: number;
  borrowApy: number;
  totalSuppliedNative: number;
  totalBorrowedNative: number;
  totalSuppliedUsd: number | null;
  totalBorrowedUsd: number | null;
  utilization: number; // 0..1
  activitySpark: number[]; // 7 daily values, oldest → newest
}

type SortKey = 'totalSuppliedUsd' | 'supplyApy' | 'borrowApy' | 'utilization';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const AaveMarketsOverview = () => {
  const { data, loading, error } = useQuery<{ reserves: ReserveRow[] }>(
    GET_AAVE_MARKETS,
    {
      client: aaveClient,
      pollInterval: 60_000,
    },
  );

  // Single multicall reads every Chainlink USD feed in PRICE_FEEDS.
  const { data: feedData } = useReadContracts({
    contracts: FEED_ENTRIES.map(([, addr]) => ({
      address: addr,
      abi: AGGREGATOR_V3_ABI,
      functionName: 'latestRoundData' as const,
      chainId: arbitrum.id,
    })),
    query: { refetchInterval: 60_000, staleTime: 30_000 },
  });

  // Fallback ERC20 metadata multicall: the subgraph's mapping returns empty
  // `symbol` / `name` for some reserves, so we read these directly from the
  // underlying token contracts. Token metadata is immutable, hence the long
  // staleTime.
  const assetAddresses = useMemo<`0x${string}`[]>(() => {
    if (!data?.reserves?.length) return [];
    const seen = new Set<string>();
    const out: `0x${string}`[] = [];
    for (const r of data.reserves) {
      const a = (r.asset || '').toLowerCase();
      if (a.startsWith('0x') && a.length === 42 && !seen.has(a)) {
        seen.add(a);
        out.push(a as `0x${string}`);
      }
    }
    return out;
  }, [data]);

  const { data: erc20MetaData } = useReadContracts({
    contracts: assetAddresses.flatMap((addr) => [
      {
        address: addr,
        abi: ERC20_META_ABI,
        functionName: 'symbol' as const,
        chainId: arbitrum.id,
      },
      {
        address: addr,
        abi: ERC20_META_ABI,
        functionName: 'name' as const,
        chainId: arbitrum.id,
      },
    ]),
    query: {
      enabled: assetAddresses.length > 0,
      staleTime: 60 * 60 * 1000, // 1h — symbol/name are effectively immutable
    },
  });

  const tokenMetaByAddress = useMemo<
    Map<string, { symbol: string; name: string }>
  >(() => {
    const out = new Map<string, { symbol: string; name: string }>();
    if (!erc20MetaData) return out;
    assetAddresses.forEach((addr, i) => {
      const symResult = erc20MetaData[i * 2];
      const nameResult = erc20MetaData[i * 2 + 1];
      const symbol =
        symResult?.status === 'success' && typeof symResult.result === 'string'
          ? symResult.result
          : '';
      const name =
        nameResult?.status === 'success' &&
        typeof nameResult.result === 'string'
          ? nameResult.result
          : '';
      out.set(addr.toLowerCase(), { symbol, name });
    });
    return out;
  }, [assetAddresses, erc20MetaData]);

  const priceBySymbol = useMemo<Map<string, number>>(() => {
    const out = new Map<string, number>();
    if (!feedData) return out;
    FEED_ENTRIES.forEach(([sym], i) => {
      const r = feedData[i];
      if (r?.status === 'success' && r.result) {
        const tuple = r.result as readonly unknown[];
        const answer = tuple[1] as bigint;
        const price = Number(answer) / Math.pow(10, FEED_DECIMALS);
        if (isFinite(price) && price > 0) out.set(sym, price);
      }
    });
    return out;
  }, [feedData]);

  const [sortKey, setSortKey] = useState<SortKey>('totalSuppliedUsd');

  const markets = useMemo<MarketComputed[]>(() => {
    if (!data?.reserves?.length) return [];

    return data.reserves
      .map<MarketComputed | null>((r) => {
        try {
          const decimals = r.decimals ?? 18;
          const divisor = Math.pow(10, decimals);
          const supplyN = Number(r.totalSupply) / divisor;
          const borrowN = Number(r.totalBorrow) / divisor;

          // Hide reserves with zero supply (deprecated / unused).
          if (!isFinite(supplyN) || supplyN <= 0) return null;

          const supplyApy = aprToApy(rayToApr(r.liquidityRate));
          const borrowApy = aprToApy(rayToApr(r.variableBorrowRate));
          const utilization = supplyN > 0 ? borrowN / supplyN : 0;

          // Resolve symbol/name: prefer subgraph values, fall back to the
          // on-chain ERC20 metadata multicall.
          const onchainMeta =
            tokenMetaByAddress.get((r.asset || '').toLowerCase()) ?? {
              symbol: '',
              name: '',
            };
          const resolvedSymbol = r.symbol || onchainMeta.symbol || '';
          const resolvedName = r.name || onchainMeta.name || '';

          const priceUsd =
            priceBySymbol.get(symbolKey(resolvedSymbol)) ?? null;
          const totalSuppliedUsd =
            priceUsd !== null ? supplyN * priceUsd : null;
          const totalBorrowedUsd =
            priceUsd !== null ? borrowN * priceUsd : null;

          // dailyStats arrives newest-first; reverse so the sparkline reads
          // left = oldest, right = today.
          const stats = (r.dailyStats ?? []).slice().reverse();
          const activitySpark = stats.map((s) => {
            const sup = Number(s.supplyVolume) / divisor;
            const bor = Number(s.borrowVolume) / divisor;
            const total = sup + bor;
            return isFinite(total) ? total : 0;
          });

          return {
            id: r.id,
            symbol: resolvedSymbol || '???',
            name: resolvedName,
            supplyApy,
            borrowApy,
            totalSuppliedNative: supplyN,
            totalBorrowedNative: borrowN,
            totalSuppliedUsd,
            totalBorrowedUsd,
            utilization: Math.max(0, Math.min(1, utilization)),
            activitySpark,
          };
        } catch {
          return null;
        }
      })
      .filter((m): m is MarketComputed => m !== null)
      .sort((a, b) => {
        if (sortKey === 'totalSuppliedUsd') {
          // Reserves without a USD price get sorted to the bottom of the
          // USD-sorted view (they still appear, just below priced markets).
          const av = a.totalSuppliedUsd ?? -1;
          const bv = b.totalSuppliedUsd ?? -1;
          return bv - av;
        }
        return (b[sortKey] as number) - (a[sortKey] as number);
      });
  }, [data, priceBySymbol, tokenMetaByAddress, sortKey]);

  const totals = useMemo(() => {
    let supplied = 0;
    let borrowed = 0;
    let priced = 0;
    for (const m of markets) {
      if (m.totalSuppliedUsd !== null) {
        supplied += m.totalSuppliedUsd;
        priced++;
      }
      if (m.totalBorrowedUsd !== null) borrowed += m.totalBorrowedUsd;
    }
    return { supplied, borrowed, priced };
  }, [markets]);

  const hasData = markets.length > 0;
  const unpricedCount = markets.length - totals.priced;

  return (
    <div className="bg-[#0f172a] border border-gray-800 rounded-xl p-6 shadow-2xl">
      <div className="flex justify-between items-start mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-2 text-gray-400">
          <TrendingUp size={16} className="text-blue-500" />
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-widest">
              Aave V3 Markets · Arbitrum
            </h2>
            <p className="text-[10px] text-gray-600 mt-0.5">
              {hasData
                ? `${markets.length} active reserves · indexed by your subgraph`
                : 'Live supply & borrow rates across every reserve'}
            </p>
          </div>
        </div>
        {hasData && totals.priced > 0 && (
          <div className="flex gap-2 text-[10px] font-mono">
            <div className="bg-blue-500/10 text-blue-300 px-2 py-0.5 rounded whitespace-nowrap">
              Supplied {formatUsd(totals.supplied)}
            </div>
            <div className="bg-amber-500/10 text-amber-300 px-2 py-0.5 rounded whitespace-nowrap">
              Borrowed {formatUsd(totals.borrowed)}
            </div>
          </div>
        )}
      </div>

      {loading && !hasData ? (
        <div className="py-12 text-center text-xs text-gray-500">
          Loading Aave reserves…
        </div>
      ) : error ? (
        <div className="py-12 text-center text-xs text-red-400 px-4">
          Aave subgraph error: {error.message}
        </div>
      ) : !hasData ? (
        <div className="py-12 text-center text-xs text-gray-500 px-4">
          No active reserves returned.
        </div>
      ) : (
        <div className="overflow-x-auto -mx-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] font-bold text-gray-600 uppercase tracking-widest">
                <th className="text-left px-2 py-2">Asset</th>
                <HeaderCell
                  label="Supply APY"
                  sortKey="supplyApy"
                  active={sortKey === 'supplyApy'}
                  onClick={setSortKey}
                  align="right"
                />
                <HeaderCell
                  label="Borrow APY"
                  sortKey="borrowApy"
                  active={sortKey === 'borrowApy'}
                  onClick={setSortKey}
                  align="right"
                />
                <HeaderCell
                  label="Supplied"
                  sortKey="totalSuppliedUsd"
                  active={sortKey === 'totalSuppliedUsd'}
                  onClick={setSortKey}
                  align="right"
                />
                <th className="text-right px-2 py-2">Borrowed</th>
                <HeaderCell
                  label="Utilization"
                  sortKey="utilization"
                  active={sortKey === 'utilization'}
                  onClick={setSortKey}
                  align="right"
                />
                <th className="text-right px-2 py-2">7d Activity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/60">
              {markets.map((m) => (
                <MarketRow key={m.id} m={m} />
              ))}
            </tbody>
          </table>
          {unpricedCount > 0 && (
            <p className="mt-3 text-[10px] text-gray-600">
              {unpricedCount} reserve{unpricedCount === 1 ? '' : 's'} without a
              Chainlink USD feed display token amounts only.
            </p>
          )}
        </div>
      )}
    </div>
  );
};

function HeaderCell({
  label,
  sortKey,
  active,
  onClick,
  align,
}: {
  label: string;
  sortKey: SortKey;
  active: boolean;
  onClick: (k: SortKey) => void;
  align: 'left' | 'right';
}) {
  const alignCls = align === 'right' ? 'text-right' : 'text-left';
  return (
    <th className={`${alignCls} px-2 py-2`}>
      <button
        onClick={() => onClick(sortKey)}
        className={`inline-flex items-center gap-1 hover:text-white transition-colors ${
          active ? 'text-blue-400' : ''
        }`}
      >
        {label}
        {active && <ArrowDown size={10} />}
      </button>
    </th>
  );
}

function MarketRow({ m }: { m: MarketComputed }) {
  const utilPct = m.utilization;
  const utilColor =
    utilPct >= 0.9
      ? 'bg-red-500'
      : utilPct >= 0.7
      ? 'bg-amber-500'
      : 'bg-blue-500';

  return (
    <tr className="text-xs font-mono">
      <td className="px-2 py-3 text-white font-bold">
        <div className="flex items-baseline gap-2">
          <span>{m.symbol}</span>
          {m.name && m.name !== m.symbol && (
            <span className="text-[9px] text-gray-600 font-normal truncate max-w-[140px]">
              {m.name}
            </span>
          )}
        </div>
      </td>
      <td className="px-2 py-3 text-right text-green-400">
        <span className="inline-flex items-center gap-1">
          <ArrowUp size={10} />
          {formatPct(m.supplyApy)}
        </span>
      </td>
      <td className="px-2 py-3 text-right text-amber-400">
        <span className="inline-flex items-center gap-1">
          <ArrowDown size={10} />
          {formatPct(m.borrowApy)}
        </span>
      </td>
      <td className="px-2 py-3 text-right text-gray-300">
        {m.totalSuppliedUsd !== null
          ? formatUsd(m.totalSuppliedUsd)
          : formatToken(m.totalSuppliedNative, m.symbol)}
      </td>
      <td className="px-2 py-3 text-right text-gray-300">
        {m.totalBorrowedUsd !== null
          ? formatUsd(m.totalBorrowedUsd)
          : formatToken(m.totalBorrowedNative, m.symbol)}
      </td>
      <td className="px-2 py-3 text-right w-40">
        <div className="flex items-center gap-2 justify-end">
          <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden max-w-[80px]">
            <div
              className={`h-full ${utilColor} transition-all`}
              style={{ width: `${utilPct * 100}%` }}
            />
          </div>
          <span className="text-gray-400 text-[11px] w-12 text-right">
            {(utilPct * 100).toFixed(1)}%
          </span>
        </div>
      </td>
      <td className="px-2 py-3 text-right">
        <Sparkline values={m.activitySpark} />
      </td>
    </tr>
  );
}

/**
 * Tiny inline sparkline. Pure SVG, no external deps. Renders a polyline of
 * the supplied values normalized to its own min/max so even small markets
 * show shape, not a flat line at zero.
 */
function Sparkline({ values }: { values: number[] }) {
  if (!values || values.length < 2) {
    return <span className="text-[10px] text-gray-700">—</span>;
  }
  const w = 60;
  const h = 16;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  const stepX = w / (values.length - 1);
  const points = values
    .map((v, i) => {
      const x = i * stepX;
      // Pin flat-line cases to mid-height so they're visible.
      const y = range > 0 ? h - ((v - min) / range) * h : h / 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className="inline-block text-blue-400"
      aria-hidden
    >
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}

export default AaveMarketsOverview;
