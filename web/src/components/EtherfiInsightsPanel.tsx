'use client';

/**
 * ether.fi insights panel — shows in the Wallet tab when the user holds
 * weETH on Arbitrum (or wants to inspect the protocol's network state
 * regardless).
 *
 * Two information levels:
 *   1. Protocol context (always shown) — total holders, total supply,
 *      lifetime transfer activity. Useful even for non-holders.
 *   2. User position (only when the wallet has touched weETH on Arbitrum
 *      at any point) — current balance, lifetime received, last activity.
 */

import React, { useEffect, useState } from 'react';
import {
  Sparkles,
  Loader2,
  AlertTriangle,
  TrendingUp,
  Users,
  Activity,
  Clock,
} from 'lucide-react';

import {
  fetchEtherfiArbInsights,
  type EtherfiArbInsights,
} from '@/lib/etherfi/subgraph';

export function EtherfiInsightsPanel({
  walletAddress,
}: {
  walletAddress: string;
}) {
  const [data, setData] = useState<EtherfiArbInsights | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    setData(null);
    (async () => {
      try {
        const result = await fetchEtherfiArbInsights(walletAddress);
        if (!cancelled) setData(result);
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [walletAddress]);

  return (
    <div className="bg-gradient-to-b from-blue-950/20 to-zinc-900/50 border border-blue-500/20 rounded-2xl p-5 mb-5">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles size={14} className="text-blue-400" />
        <p className="text-[10px] uppercase tracking-widest text-blue-300 font-bold">
          ether.fi · weETH · Arbitrum
        </p>
        <span className="ml-auto text-[10px] uppercase tracking-widest text-blue-400/70 font-bold border border-blue-500/20 px-2 py-0.5 rounded">
          live subgraph
        </span>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-10 text-zinc-500">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          Querying ether.fi subgraph…
        </div>
      ) : error ? (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-[12px] text-amber-300 flex items-start gap-2">
          <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Couldn&apos;t reach ether.fi subgraph.</p>
            <p className="text-amber-300/70 text-[11px] mt-0.5">{error}</p>
            <p className="text-zinc-500 text-[11px] mt-1">
              Make sure{' '}
              <code className="font-mono">NEXT_PUBLIC_GRAPH_API_KEY</code> is
              set on the server / Vercel.
            </p>
          </div>
        </div>
      ) : !data ? null : (
        <Insights data={data} />
      )}
    </div>
  );
}

// =========================================================================
// Inner content
// =========================================================================

function Insights({ data }: { data: EtherfiArbInsights }) {
  const { protocol, token, account, hasEverHeld } = data;
  const decimals = token?.decimals ?? 18;
  const fmtNum = (n: number, max = 4): string =>
    n.toLocaleString(undefined, { maximumFractionDigits: max });
  const fmtCount = (n: number): string => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toLocaleString();
  };
  const fmtRelative = (unixSecs: number): string => {
    if (!Number.isFinite(unixSecs) || unixSecs === 0) return '—';
    const now = Math.floor(Date.now() / 1000);
    const diff = Math.max(0, now - unixSecs);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  // Format raw (uint256) volume to weETH
  const totalVolFormatted =
    protocol && token
      ? Number(protocol.totalVolumeTransferred) / 10 ** decimals
      : 0;

  return (
    <div className="space-y-4">
      {/* Protocol-level context — always shown */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <ContextStat
          icon={<Users size={12} />}
          label="Holders"
          value={protocol ? fmtCount(protocol.totalHolders) : '—'}
          accent="#60a5fa"
        />
        <ContextStat
          icon={<TrendingUp size={12} />}
          label="Total Supply"
          value={
            token
              ? `${fmtNum(token.totalSupplyFormatted, 0)} ${token.symbol}`
              : '—'
          }
          accent="#a78bfa"
        />
        <ContextStat
          icon={<Activity size={12} />}
          label="Lifetime Transfers"
          value={protocol ? fmtCount(protocol.totalTransferCount) : '—'}
          accent="#34d399"
        />
        <ContextStat
          icon={<TrendingUp size={12} />}
          label="Volume Transferred"
          value={
            token ? `${fmtCount(totalVolFormatted)} ${token.symbol}` : '—'
          }
          accent="#fbbf24"
          hint={
            token && protocol
              ? `${(totalVolFormatted / token.totalSupplyFormatted).toFixed(0)}× total supply velocity`
              : undefined
          }
        />
      </div>

      {/* User-specific section */}
      <div className="border-t border-white/5 pt-4">
        <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-2">
          Your weETH on Arbitrum
        </p>
        {hasEverHeld && account ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <UserStat
              label="Current balance"
              value={`${fmtNum(account.balanceFormatted, 6)} ${token?.symbol ?? 'weETH'}`}
              hint={
                token && account.balanceFormatted > 0
                  ? `${((account.balanceFormatted / token.totalSupplyFormatted) * 100).toExponential(2)}% of total supply`
                  : account.balanceFormatted === 0
                    ? 'currently zero — historical holder'
                    : undefined
              }
              accent={account.balanceFormatted > 0 ? '#34d399' : '#71717a'}
            />
            <UserStat
              label="Lifetime received"
              value={`${fmtNum(account.totalReceivedFormatted, 4)} ${token?.symbol ?? 'weETH'}`}
              hint="includes any redeemed/sent amounts"
              accent="#60a5fa"
            />
            <UserStat
              label="Last activity"
              value={fmtRelative(account.lastSeenAt)}
              icon={<Clock size={11} />}
              accent="#a78bfa"
            />
          </div>
        ) : (
          <div className="text-[12px] text-zinc-500 bg-zinc-900/40 border border-white/5 rounded-lg p-3">
            This wallet has never held weETH on Arbitrum. To see your own
            weETH activity here, bridge weETH to Arbitrum (mainnet → L2 via
            ether.fi&apos;s OFT or LayerZero), or connect a wallet that does.
          </div>
        )}
      </div>

      <p className="text-[10px] text-zinc-600 mt-1">
        Data: <span className="font-mono">etherfi-Arbitrum</span> subgraph on
        The Graph (deployment{' '}
        <span className="font-mono">8dZJWk…v7B5</span>) · weETH contract{' '}
        <span className="font-mono">0x3575…4dbe</span>
      </p>
    </div>
  );
}

// =========================================================================
// Small presentational helpers
// =========================================================================

function ContextStat({
  icon,
  label,
  value,
  accent,
  hint,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  accent: string;
  hint?: string;
}) {
  return (
    <div className="bg-zinc-900/40 border border-white/5 rounded-xl p-3">
      <div className="flex items-center gap-1 text-[9px] uppercase tracking-widest text-zinc-500 font-bold">
        {icon && <span style={{ color: accent }}>{icon}</span>}
        <span>{label}</span>
      </div>
      <p
        className="text-base font-mono font-bold mt-1 truncate"
        style={{ color: accent }}
        title={value}
      >
        {value}
      </p>
      {hint && <p className="text-[9px] text-zinc-600 mt-0.5">{hint}</p>}
    </div>
  );
}

function UserStat({
  label,
  value,
  hint,
  accent,
  icon,
}: {
  label: string;
  value: string;
  hint?: string;
  accent: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="bg-zinc-900/40 border border-white/5 rounded-xl p-3">
      <div className="flex items-center gap-1 text-[9px] uppercase tracking-widest text-zinc-500 font-bold">
        {icon && <span style={{ color: accent }}>{icon}</span>}
        <span>{label}</span>
      </div>
      <p
        className="text-base font-mono font-bold mt-1"
        style={{ color: accent }}
      >
        {value}
      </p>
      {hint && <p className="text-[10px] text-zinc-500 mt-0.5">{hint}</p>}
    </div>
  );
}
