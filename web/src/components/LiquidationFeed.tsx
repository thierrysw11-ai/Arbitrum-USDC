'use client';

/**
 * Live feed of recent Aave V3 liquidations on Arbitrum.
 *
 * Replaces the original USDC whale-transfer feed — that one's a stablecoin
 * moving between addresses, no risk story to tell. Liquidations are visceral
 * and directly position USDC Guardian's product: "this person didn't see it
 * coming. Run the report to see if you're next."
 *
 * Data path:
 *   - Aave V3 Arbitrum subgraph → `liquidations` (custom schema, see
 *     /aave-subgraph/schema.graphql).
 *   - Chainlink USD price feeds (multicall) → convert collateral seized to USD.
 *   - Polls every 60s.
 *
 * Each row tells one story: $X of <COLLATERAL> seized from <BORROWER> a
 * few minutes ago because their HF crossed 1.0. The CTA underneath ties
 * back to the report ("see your liquidation buffer").
 */

import React, { useMemo } from 'react';
import { useQuery, gql } from '@apollo/client';
import { useReadContracts } from 'wagmi';
import { arbitrum } from 'wagmi/chains';
import { ExternalLink, AlertTriangle, ShieldAlert } from 'lucide-react';
import Link from 'next/link';

import { aaveClient } from '@/lib/apollo';

// =========================================================================
// GraphQL — pull the most recent liquidations
// =========================================================================

const FEED_SIZE = 12;

const GET_RECENT_LIQUIDATIONS = gql`
  query RecentLiquidations($first: Int!) {
    liquidations(
      first: $first
      orderBy: timestamp
      orderDirection: desc
    ) {
      id
      collateralAsset {
        id
        symbol
        decimals
      }
      debtAsset {
        id
        symbol
      }
      user {
        id
      }
      liquidator
      liquidatedCollateralAmount
      debtToCover
      timestamp
      txHash
    }
  }
`;

interface LiquidationRow {
  id: string;
  collateralAsset: { id: string; symbol: string; decimals: number };
  debtAsset: { id: string; symbol: string };
  user: { id: string };
  liquidator: string;
  liquidatedCollateralAmount: string;
  debtToCover: string;
  timestamp: string;
  txHash: string;
}

// =========================================================================
// Chainlink USD feeds — same set as AaveMarketsOverview
// =========================================================================

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

const SYMBOL_ALIAS: Record<string, string> = {
  'USDC.E': 'USDC',
  USDCN: 'USDC',
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

const FEED_DECIMALS = 8;

const symbolKey = (s: string): string => {
  const upper = (s || '').toUpperCase().trim();
  return SYMBOL_ALIAS[upper] ?? upper;
};

// =========================================================================
// Formatters
// =========================================================================

const ARBISCAN_TX = (h: string) => `https://arbiscan.io/tx/${h}`;
const ARBISCAN_ADDR = (a: string) => `https://arbiscan.io/address/${a}`;

const shorten = (addr: string) => `${addr.slice(0, 6)}…${addr.slice(-4)}`;

const formatUsd = (n: number): string => {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  return n > 0 ? `$${n.toFixed(4)}` : '—';
};

const formatToken = (n: number, sym: string): string => {
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M ${sym}`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K ${sym}`;
  if (n >= 1) return `${n.toFixed(2)} ${sym}`;
  return `${n.toFixed(4)} ${sym}`;
};

const relativeTime = (unixSec: number, now: number): string => {
  const diff = Math.max(0, Math.floor((now - unixSec * 1000) / 1000));
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
};

const tokenToFloat = (raw: string, decimals: number): number => {
  // Two-step divide to keep precision for very large bigints.
  if (decimals <= 0) return Number(raw);
  const big = BigInt(raw);
  const denom = 10n ** BigInt(decimals);
  const head = Number(big / denom);
  const tail = Number(big % denom) / Number(denom);
  return head + tail;
};

// =========================================================================
// Component
// =========================================================================

const LiquidationFeed = () => {
  const { data, loading, error } = useQuery<{ liquidations: LiquidationRow[] }>(
    GET_RECENT_LIQUIDATIONS,
    {
      client: aaveClient,
      variables: { first: FEED_SIZE },
      pollInterval: 60_000,
    },
  );

  const { data: feedData } = useReadContracts({
    contracts: FEED_ENTRIES.map(([, addr]) => ({
      address: addr,
      abi: AGGREGATOR_V3_ABI,
      functionName: 'latestRoundData' as const,
      chainId: arbitrum.id,
    })),
    query: { refetchInterval: 60_000, staleTime: 30_000 },
  });

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

  // Derived rows with USD value computed
  const now = useMemo(() => Date.now(), [data]);
  const rows = useMemo(() => {
    const liqs = data?.liquidations ?? [];
    return liqs.map((l) => {
      const collFloat = tokenToFloat(
        l.liquidatedCollateralAmount,
        l.collateralAsset.decimals
      );
      const sym = symbolKey(l.collateralAsset.symbol || '');
      const price = priceBySymbol.get(sym) ?? null;
      const usd = price !== null ? collFloat * price : null;
      return {
        id: l.id,
        collateralSymbol: l.collateralAsset.symbol || '?',
        collateralFloat: collFloat,
        debtSymbol: l.debtAsset.symbol || '?',
        borrower: l.user.id,
        usd,
        ts: Number(l.timestamp),
        txHash: l.txHash,
      };
    });
  }, [data, priceBySymbol]);

  // Headline summary — total seized USD and biggest hit in the last day,
  // plus a 24h count vs the displayed window so the user sees activity at a glance.
  const summary = useMemo(() => {
    const oneDayAgo = now / 1000 - 86400;
    const last24h = rows.filter((r) => r.ts >= oneDayAgo);
    const totalUsd24h = last24h.reduce((acc, r) => acc + (r.usd ?? 0), 0);
    const biggest = rows.reduce<typeof rows[number] | null>((acc, r) => {
      if (r.usd === null) return acc;
      if (acc === null || (r.usd ?? 0) > (acc.usd ?? 0)) return r;
      return acc;
    }, null);
    return { count24h: last24h.length, totalUsd24h, biggest };
  }, [rows, now]);

  const hasData = rows.length > 0;

  return (
    <div className="bg-[#0f172a] border border-gray-800 rounded-xl p-6 shadow-2xl">
      {/* Header */}
      <div className="flex justify-between items-start mb-2">
        <div className="flex items-center gap-2 text-gray-400">
          <ShieldAlert size={16} className="text-red-400" />
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-widest">
              Recent Aave Liquidations
            </h2>
            <p className="text-[10px] text-gray-600 mt-0.5">
              Arbitrum One · live · borrowers whose HF crossed 1.0
            </p>
          </div>
        </div>
        {hasData && (
          <div className="text-[10px] text-red-400 font-mono bg-red-500/10 px-2 py-0.5 rounded whitespace-nowrap">
            {rows.length} latest
          </div>
        )}
      </div>

      {/* Headline strip — the "so what" */}
      {hasData && summary.count24h > 0 && (
        <div className="flex items-center gap-3 text-[11px] text-zinc-300 bg-red-500/5 border border-red-500/20 rounded-lg px-3 py-2 mb-4">
          <AlertTriangle size={12} className="text-red-400 flex-shrink-0" />
          <span>
            <span className="font-mono font-bold text-red-300">
              {summary.count24h}
            </span>{' '}
            borrower{summary.count24h === 1 ? '' : 's'} liquidated in the last 24h
            {summary.totalUsd24h > 0 && (
              <>
                {' '}
                ·{' '}
                <span className="font-mono font-bold text-red-300">
                  {formatUsd(summary.totalUsd24h)}
                </span>{' '}
                in collateral seized
              </>
            )}
            {summary.biggest && summary.biggest.usd !== null && (
              <>
                {' '}
                · biggest hit:{' '}
                <span className="font-mono font-bold text-red-300">
                  {formatUsd(summary.biggest.usd)}
                </span>
              </>
            )}
          </span>
        </div>
      )}

      {/* Body */}
      {loading && !hasData ? (
        <div className="py-12 text-center text-xs text-gray-500">
          Loading liquidation activity…
        </div>
      ) : error ? (
        <div className="py-12 text-center text-xs text-red-400 px-4">
          Subgraph error: {error.message}
        </div>
      ) : !hasData ? (
        <div className="py-12 text-center text-xs text-gray-500 px-4">
          No recent liquidations indexed. Calm market — for now.
        </div>
      ) : (
        <div className="divide-y divide-gray-800/60">
          {rows.map((r) => (
            <Row key={r.id} row={r} now={now} />
          ))}
        </div>
      )}

      {/* CTA — tie back to the paid report */}
      {hasData && (
        <div className="mt-4 pt-4 border-t border-zinc-800/60 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <p className="text-[11px] text-zinc-400 leading-relaxed">
            Each row was a borrower who didn't see it coming.{' '}
            <span className="text-zinc-300">See your own liquidation buffer.</span>
          </p>
          <Link
            href="/portfolio"
            className="text-[11px] font-bold uppercase tracking-widest text-purple-300 hover:text-purple-200 border border-purple-500/30 hover:border-purple-500/60 rounded-md px-3 py-1.5 whitespace-nowrap transition-colors"
          >
            Run the report →
          </Link>
        </div>
      )}
    </div>
  );
};

// =========================================================================
// Row
// =========================================================================

interface RowData {
  id: string;
  collateralSymbol: string;
  collateralFloat: number;
  debtSymbol: string;
  borrower: string;
  usd: number | null;
  ts: number;
  txHash: string;
}

function Row({ row, now }: { row: RowData; now: number }) {
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-4 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0 flex items-center gap-3">
        <div className="font-mono text-sm font-bold text-red-300 w-20 flex-shrink-0">
          {row.usd !== null ? formatUsd(row.usd) : '—'}
        </div>
        <div className="min-w-0 text-[11px] text-gray-400 leading-tight">
          <div className="font-mono text-zinc-200 truncate">
            {formatToken(row.collateralFloat, row.collateralSymbol)}
            <span className="text-zinc-600"> seized · debt {row.debtSymbol}</span>
          </div>
          <div className="text-[10px] text-gray-600 font-mono truncate">
            <a
              href={ARBISCAN_ADDR(row.borrower)}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-zinc-300 transition-colors"
              title={row.borrower}
            >
              {shorten(row.borrower)}
            </a>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 text-[10px] text-gray-600 font-mono whitespace-nowrap">
        <span>{relativeTime(row.ts, now)}</span>
        <a
          href={ARBISCAN_TX(row.txHash)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-gray-600 hover:text-blue-400 transition-colors"
          aria-label="View liquidation on Arbiscan"
        >
          <ExternalLink size={11} />
        </a>
      </div>
    </div>
  );
}

export default LiquidationFeed;
