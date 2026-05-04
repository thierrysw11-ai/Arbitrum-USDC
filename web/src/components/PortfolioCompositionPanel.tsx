'use client';

/**
 * Portfolio Composition panel — DeFi mirror of a TradFi wealth-manager
 * report. Three sections borrowed from the standard X-ray-style report:
 *
 *   1. Sector allocation (Supersector → Sector → %, with bars)
 *   2. Market-cap breakdown (Large / Mid / Small / Micro / Unknown)
 *   3. Concentration metrics (HHI, top-3 share, effective N, verdict)
 *
 * Plus:
 *   4. Top holdings ranked with sector tag (TradFi top-N table)
 *
 * Pure client-side: composes from wallet-holdings data + the composition
 * registry in lib/aave/composition.ts. Fetches its own /api/wallet-holdings
 * (browser caching keeps it cheap if WalletHoldingsPanel already fetched
 * the same payload).
 */

import React, { useEffect, useMemo, useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Layers, Loader2, AlertTriangle, Eye, EyeOff } from 'lucide-react';

import {
  analyzeComposition,
  type CompositionAnalysis,
  type Supersector,
  type MarketCapBucket,
} from '@/lib/aave/composition';

interface ChainHoldings {
  chainSlug: string;
  chainName: string;
  nativeBalance: {
    symbol: string;
    balanceFormatted: number;
    usdValue: number | null;
  };
  erc20: Array<{
    symbol: string;
    name: string | null;
    usdValue: number | null;
    isSpam: boolean;
  }>;
  legitimateUsd: number;
  spamUsd: number;
  error?: string;
}

interface WalletHoldingsResponse {
  chains: ChainHoldings[];
  legitimateUsd: number;
  spamUsd: number;
  totalUsd: number;
  error?: string;
}

const SUPERSECTOR_COLORS: Record<Supersector, string> = {
  Stablecoins: '#22c55e',
  'Smart Contract Platforms': '#3b82f6',
  Bitcoin: '#f59e0b',
  'Liquid Staking': '#a855f7',
  'Liquid Restaking': '#d946ef',
  DeFi: '#06b6d4',
  Infrastructure: '#0ea5e9',
  Memecoins: '#ec4899',
  Governance: '#84cc16',
  'Aave Receipt Tokens': '#8b5cf6',
  Other: '#71717a',
};

const MC_COLORS: Record<MarketCapBucket, string> = {
  large: '#22c55e',
  mid: '#3b82f6',
  small: '#f59e0b',
  micro: '#ef4444',
  unknown: '#71717a',
};

const VERDICT_COLORS: Record<
  NonNullable<CompositionAnalysis['concentration']>['verdict'],
  string
> = {
  'highly diversified': '#22c55e',
  diversified: '#84cc16',
  moderate: '#f59e0b',
  concentrated: '#f97316',
  'highly concentrated': '#ef4444',
};

export function PortfolioCompositionPanel({
  walletAddress,
}: {
  walletAddress: `0x${string}`;
}) {
  const [data, setData] = useState<WalletHoldingsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [xray, setXray] = useState(true); // default ON — match TradFi convention

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    setData(null);
    (async () => {
      try {
        const res = await fetch('/api/wallet-holdings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address: walletAddress }),
        });
        const json = (await res.json()) as WalletHoldingsResponse;
        if (cancelled) return;
        if (!res.ok || json.error) {
          setError(json.error || `HTTP ${res.status}`);
        } else {
          setData(json);
        }
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

  // Build the input to analyzeComposition: native + ERC-20 (non-spam, priced)
  // across all chains, flattened with chain-prefixed symbols where ambiguous.
  const composition = useMemo<CompositionAnalysis | null>(() => {
    if (!data) return null;
    const holdings: Array<{ symbol: string; usdValue: number }> = [];
    for (const c of data.chains) {
      if (
        c.nativeBalance.usdValue &&
        c.nativeBalance.usdValue > 0 &&
        c.nativeBalance.balanceFormatted > 0
      ) {
        holdings.push({
          symbol: c.nativeBalance.symbol,
          usdValue: c.nativeBalance.usdValue,
        });
      }
      for (const t of c.erc20) {
        if (t.isSpam) continue;
        if (t.usdValue === null || t.usdValue <= 0) continue;
        holdings.push({ symbol: t.symbol, usdValue: t.usdValue });
      }
    }
    return analyzeComposition(holdings, { xray });
  }, [data, xray]);

  return (
    <div className="bg-zinc-900/50 border border-white/5 rounded-2xl p-5 mb-5">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <div className="flex items-center gap-2">
          <Layers size={14} className="text-zinc-500" />
          <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">
            Portfolio Composition — Sector / Market-Cap / Concentration
          </p>
        </div>
        {/* X-ray toggle: when ON, looks through Aave aTokens to their
            underlying classification (matches TradFi report convention
            where funds are decomposed to constituent equities). */}
        <button
          onClick={() => setXray((v) => !v)}
          className={`inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-bold px-2 py-1 rounded-full border transition-colors ${
            xray
              ? 'border-purple-500/40 bg-purple-500/10 text-purple-300'
              : 'border-zinc-700 text-zinc-500 hover:text-zinc-300'
          }`}
          title={
            xray
              ? 'X-ray ON: aTokens decomposed to underlying (USDC, ETH, etc.)'
              : 'X-ray OFF: aTokens shown as their own supersector'
          }
        >
          {xray ? <Eye size={11} /> : <EyeOff size={11} />}
          X-ray {xray ? 'on' : 'off'}
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-zinc-500">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          Aggregating holdings across chains…
        </div>
      ) : error ? (
        <div className="bg-red-500/10 border border-red-500/30 text-red-300 rounded-lg p-3 text-[12px] flex items-start gap-2">
          <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      ) : !composition || composition.totalUsd === 0 ? (
        <p className="text-zinc-500 text-sm py-8 text-center">
          No priced holdings to analyze. Once your wallet has identifiable
          tokens with USD prices, composition will populate here.
        </p>
      ) : (
        <CompositionResult comp={composition} />
      )}
    </div>
  );
}

// =========================================================================
// Result rendering
// =========================================================================

function CompositionResult({ comp }: { comp: CompositionAnalysis }) {
  const fmtUsd = (n: number): string => {
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
    if (n >= 1_000) return `$${(n / 1_000).toFixed(2)}K`;
    return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  };

  return (
    <div className="space-y-5">
      {/* Asset Class allocation — top-level supersector pie + table.
          Mirrors the TradFi report's page-1 "Asset allocation" view that
          summarizes the portfolio at the highest level before drilling
          into granular sectors below. */}
      <AssetClassPie comp={comp} />

      {/* Concentration headline */}
      {comp.concentration && (
        <ConcentrationCard
          stats={comp.concentration}
          totalUsd={comp.totalUsd}
        />
      )}

      {/* Sector allocation — Supersector → Sector → % */}
      <div>
        <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-2">
          Sector Allocation
        </p>
        <div className="overflow-hidden rounded-lg border border-white/5">
          <div className="grid grid-cols-[auto_1fr_auto_2fr] gap-3 px-3 py-2 bg-zinc-900/80 text-[9px] uppercase tracking-widest text-zinc-500 font-bold">
            <span>Supersector</span>
            <span>Sector</span>
            <span className="text-right">%</span>
            <span>Chart</span>
          </div>
          <div className="max-h-[280px] overflow-y-auto">
            {comp.bySector.map((row, i) => {
              const color = SUPERSECTOR_COLORS[row.supersector] ?? '#71717a';
              return (
                <div
                  key={`${row.supersector}-${row.sector}-${i}`}
                  className="grid grid-cols-[auto_1fr_auto_2fr] gap-3 px-3 py-2 text-[12px] border-t border-white/5 items-center"
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: color }}
                    />
                    <span className="text-zinc-400 truncate text-[11px]">
                      {row.supersector}
                    </span>
                  </div>
                  <span className="text-zinc-200 font-mono truncate">
                    {row.sector}
                  </span>
                  <span className="text-zinc-100 font-mono font-bold text-right whitespace-nowrap">
                    {row.pct.toFixed(1)}%
                  </span>
                  <div className="flex items-center">
                    <div
                      className="h-3 rounded transition-all"
                      style={{
                        width: `${Math.max(2, row.pct)}%`,
                        backgroundColor: color,
                      }}
                      title={`${row.sector}: ${fmtUsd(row.usd)}`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Market-cap breakdown */}
      <div>
        <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-2">
          Breakdown by Market Capitalisation
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {comp.byMarketCap.map((r) => (
            <div
              key={r.bucket}
              className="grid grid-cols-[auto_1fr_auto] gap-3 items-center px-3 py-2 bg-zinc-900/40 border border-white/5 rounded-lg text-[12px]"
            >
              <span
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: MC_COLORS[r.bucket] }}
              />
              <span className="text-zinc-300 truncate">{r.label}</span>
              <span className="text-zinc-100 font-mono font-bold text-right whitespace-nowrap">
                {r.pct.toFixed(1)}%
              </span>
              <div />
              <div className="col-span-2">
                <div
                  className="h-1.5 rounded transition-all"
                  style={{
                    width: `${Math.max(0.5, r.pct)}%`,
                    backgroundColor: MC_COLORS[r.bucket],
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Top holdings */}
      <div>
        <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-2">
          Top Holdings
        </p>
        <div className="overflow-hidden rounded-lg border border-white/5">
          <div className="grid grid-cols-[auto_1fr_auto_auto] gap-3 px-3 py-2 bg-zinc-900/80 text-[9px] uppercase tracking-widest text-zinc-500 font-bold">
            <span>#</span>
            <span>Token</span>
            <span className="text-right">USD</span>
            <span className="text-right">%</span>
          </div>
          <div className="max-h-[260px] overflow-y-auto">
            {comp.topHoldings.map((h, i) => (
              <div
                key={`${h.symbol}-${i}`}
                className="grid grid-cols-[auto_1fr_auto_auto] gap-3 px-3 py-2 text-[12px] border-t border-white/5 items-center"
              >
                <span className="text-zinc-500 font-mono w-5 text-right">
                  {i + 1}
                </span>
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{
                      backgroundColor:
                        SUPERSECTOR_COLORS[h.supersector] ?? '#71717a',
                    }}
                  />
                  <span className="text-zinc-100 font-mono font-bold truncate">
                    {h.symbol}
                  </span>
                  <span className="text-zinc-500 text-[11px] truncate">
                    {h.sector}
                  </span>
                </div>
                <span className="text-zinc-300 font-mono text-right whitespace-nowrap">
                  {fmtUsd(h.usd)}
                </span>
                <span className="text-zinc-100 font-mono font-bold text-right whitespace-nowrap">
                  {h.pct.toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ConcentrationCard({
  stats,
  totalUsd,
}: {
  stats: NonNullable<CompositionAnalysis['concentration']>;
  totalUsd: number;
}) {
  const verdictColor = VERDICT_COLORS[stats.verdict];
  const fmtUsd = (n: number): string => {
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
    if (n >= 1_000) return `$${(n / 1_000).toFixed(2)}K`;
    return `$${n.toFixed(2)}`;
  };
  return (
    <div
      className="rounded-2xl p-4 border"
      style={{
        backgroundColor: `${verdictColor}10`,
        borderColor: `${verdictColor}30`,
      }}
    >
      <div className="flex items-center gap-2 mb-3">
        <span
          className="text-[9px] uppercase tracking-widest font-bold px-2 py-0.5 rounded-full"
          style={{
            backgroundColor: `${verdictColor}25`,
            color: verdictColor,
          }}
        >
          {stats.verdict}
        </span>
        <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">
          · Total: {fmtUsd(totalUsd)}
        </span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Metric
          label="Top-3 Share"
          value={`${stats.topThreePct.toFixed(1)}%`}
          accent={verdictColor}
        />
        <Metric
          label="Effective N"
          value={stats.effectiveN.toFixed(1)}
          accent={verdictColor}
          hint="≈ N equally-weighted assets"
        />
        <Metric
          label="HHI"
          value={Math.round(stats.hhi).toString()}
          accent={verdictColor}
          hint="0–10000, higher = more concentrated"
        />
        <Metric
          label="Largest Position"
          value={`${stats.largestHolding.symbol}: ${stats.largestHolding.pct.toFixed(1)}%`}
          accent={verdictColor}
        />
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  accent,
  hint,
}: {
  label: string;
  value: string;
  accent: string;
  hint?: string;
}) {
  return (
    <div>
      <p className="text-[9px] uppercase tracking-widest text-zinc-500 font-bold">
        {label}
      </p>
      <p
        className="text-lg font-mono font-bold mt-0.5"
        style={{ color: accent }}
      >
        {value}
      </p>
      {hint && (
        <p className="text-[9px] text-zinc-600 mt-0.5">{hint}</p>
      )}
    </div>
  );
}

// =========================================================================
// Asset Class Pie — TradFi page-1 mirror. Pie + adjacent legend table
// using only the top-level Supersector totals, so the user gets the
// high-level allocation summary before drilling into sector detail.
// =========================================================================

function AssetClassPie({ comp }: { comp: CompositionAnalysis }) {
  const fmtUsd = (n: number): string => {
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
    if (n >= 1_000) return `$${(n / 1_000).toFixed(2)}K`;
    return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  };

  // Pie data — sized by USD value, named by supersector.
  const pieData = comp.bySupersector.map((row) => ({
    name: row.supersector,
    value: row.usd,
    pct: row.pct,
    color: SUPERSECTOR_COLORS[row.supersector] ?? '#71717a',
  }));

  return (
    <div>
      <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-3">
        Asset Class Allocation
      </p>
      <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-4 items-center">
        {/* Pie */}
        <div className="h-[180px] mx-auto md:mx-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={pieData}
                dataKey="value"
                nameKey="name"
                innerRadius={45}
                outerRadius={80}
                paddingAngle={1}
                stroke="#0a0a0a"
                strokeWidth={2}
              >
                {pieData.map((d, i) => (
                  <Cell key={i} fill={d.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0f172a',
                  border: '1px solid #1e293b',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
                formatter={(value: number, _name: string, item) => {
                  const d = item.payload as { pct: number };
                  return [
                    `${fmtUsd(value)} (${d.pct.toFixed(1)}%)`,
                    item.payload.name,
                  ];
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Legend table — mirrors the TradFi "Key / Asset holdings / %" 3-col layout */}
        <div className="overflow-hidden rounded-lg border border-white/5">
          <div className="grid grid-cols-[auto_1fr_auto_auto] gap-3 px-3 py-2 bg-zinc-900/80 text-[9px] uppercase tracking-widest text-zinc-500 font-bold">
            <span>Key</span>
            <span>Asset class</span>
            <span className="text-right">USD</span>
            <span className="text-right">%</span>
          </div>
          {comp.bySupersector.map((row) => {
            const color = SUPERSECTOR_COLORS[row.supersector] ?? '#71717a';
            return (
              <div
                key={row.supersector}
                className="grid grid-cols-[auto_1fr_auto_auto] gap-3 px-3 py-1.5 text-[12px] border-t border-white/5 items-center"
              >
                <span
                  className="w-3 h-3 rounded-sm flex-shrink-0"
                  style={{ backgroundColor: color }}
                />
                <span className="text-zinc-200 font-mono truncate">
                  {row.supersector}
                </span>
                <span className="text-zinc-300 font-mono text-right whitespace-nowrap">
                  {fmtUsd(row.usd)}
                </span>
                <span className="text-zinc-100 font-mono font-bold text-right whitespace-nowrap">
                  {row.pct.toFixed(1)}%
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
