'use client';

import React, { useMemo } from 'react';
import { useQuery, gql } from '@apollo/client';
import { ArrowRight, ExternalLink, Waves } from 'lucide-react';

/**
 * Live feed of the last N USDC transfers ≥ $1M on Arbitrum.
 *
 * Queries the project's custom USDC subgraph (`Transfer` entity) rather than
 * bucketing client-side. Polls every 30s to stay in sync with the volume chart.
 *
 * Transfer.value is raw uint256 — USDC has 6 decimals, so 1M USDC = 10^12.
 */
const WHALE_THRESHOLD_RAW = '1000000000000'; // 1,000,000 USDC @ 6 decimals
const FEED_SIZE = 10;

const GET_WHALE_TRANSFERS = gql`
  query GetWhaleTransfers($threshold: BigInt!, $first: Int!) {
    transfers(
      first: $first
      orderBy: timestamp
      orderDirection: desc
      where: { value_gte: $threshold }
    ) {
      id
      from
      to
      value
      timestamp
      txHash
    }
  }
`;

interface TransferRow {
  id: string;
  from: string;
  to: string;
  value: string;
  timestamp: string;
  txHash: string;
}

const ARBISCAN_TX = (hash: string) => `https://arbiscan.io/tx/${hash}`;
const ARBISCAN_ADDR = (addr: string) => `https://arbiscan.io/address/${addr}`;

const shorten = (addr: string) => `${addr.slice(0, 6)}…${addr.slice(-4)}`;

const formatAmount = (rawValue: string): string => {
  const usdc = Number(rawValue) / 1e6;
  if (usdc >= 1e9) return `$${(usdc / 1e9).toFixed(2)}B`;
  if (usdc >= 1e6) return `$${(usdc / 1e6).toFixed(2)}M`;
  if (usdc >= 1e3) return `$${(usdc / 1e3).toFixed(1)}K`;
  return `$${usdc.toFixed(0)}`;
};

const relativeTime = (unixSeconds: number, now: number): string => {
  const diff = Math.max(0, Math.floor((now - unixSeconds * 1000) / 1000));
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
};

const WhaleFeed = () => {
  const { data, loading, error } = useQuery<{ transfers: TransferRow[] }>(
    GET_WHALE_TRANSFERS,
    {
      variables: { threshold: WHALE_THRESHOLD_RAW, first: FEED_SIZE },
      pollInterval: 30_000,
    },
  );

  // Cache "now" per render so all relative timestamps update together every poll.
  const now = useMemo(() => Date.now(), [data]);

  const transfers = data?.transfers ?? [];
  const hasData = transfers.length > 0;

  return (
    <div className="bg-[#0f172a] border border-gray-800 rounded-xl p-6 shadow-2xl">
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-2 text-gray-400">
          <Waves size={16} className="text-green-500" />
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-widest">
              Recent Whale Transfers
            </h2>
            <p className="text-[10px] text-gray-600 mt-0.5">
              Live feed · threshold ≥ $1M
            </p>
          </div>
        </div>
        {hasData && (
          <div className="text-[10px] text-green-400 font-mono bg-green-500/10 px-2 py-0.5 rounded whitespace-nowrap">
            {transfers.length} latest
          </div>
        )}
      </div>

      {loading && !hasData ? (
        <div className="py-12 text-center text-xs text-gray-500">
          Loading whale activity…
        </div>
      ) : error ? (
        <div className="py-12 text-center text-xs text-red-400 px-4">
          Subgraph error: {error.message}
        </div>
      ) : !hasData ? (
        <div className="py-12 text-center text-xs text-gray-500 px-4">
          No transfers ≥ $1M in the indexed range yet.
        </div>
      ) : (
        <div className="divide-y divide-gray-800/60">
          {transfers.map((t) => (
            <Row key={t.id} transfer={t} now={now} />
          ))}
        </div>
      )}
    </div>
  );
};

function Row({ transfer, now }: { transfer: TransferRow; now: number }) {
  const ts = Number(transfer.timestamp);
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-4 py-3 first:pt-0 last:pb-0">
      {/* Left: amount + from → to */}
      <div className="min-w-0 flex items-center gap-3">
        <div className="font-mono text-sm font-bold text-green-400 w-20 flex-shrink-0">
          {formatAmount(transfer.value)}
        </div>
        <div className="min-w-0 flex items-center gap-1.5 text-[11px] font-mono text-gray-400">
          <a
            href={ARBISCAN_ADDR(transfer.from)}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-white transition-colors truncate"
            title={transfer.from}
          >
            {shorten(transfer.from)}
          </a>
          <ArrowRight size={10} className="text-gray-600 flex-shrink-0" />
          <a
            href={ARBISCAN_ADDR(transfer.to)}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-white transition-colors truncate"
            title={transfer.to}
          >
            {shorten(transfer.to)}
          </a>
        </div>
      </div>

      {/* Right: time + tx link */}
      <div className="flex items-center gap-3 text-[10px] text-gray-600 font-mono whitespace-nowrap">
        <span>{relativeTime(ts, now)}</span>
        <a
          href={ARBISCAN_TX(transfer.txHash)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-gray-600 hover:text-blue-400 transition-colors"
          aria-label="View transaction on Arbiscan"
        >
          <ExternalLink size={11} />
        </a>
      </div>
    </div>
  );
}

export default WhaleFeed;
