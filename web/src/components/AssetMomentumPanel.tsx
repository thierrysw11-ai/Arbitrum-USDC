'use client';

/**
 * Force-and-Velocity panel.
 *
 * Borrows the physics metaphor: each asset gets a velocity (7-day price
 * change) and a force (acceleration — how velocity itself is changing).
 * Plotted on a quadrant chart so the user can read directional state at
 * a glance:
 *
 *   Top-right    rising AND accelerating  →  bullish momentum
 *   Top-left     falling but decelerating →  potential bottom
 *   Bottom-right rising but losing steam  →  potential reversal
 *   Bottom-left  falling AND accelerating →  most dangerous
 *
 * Data: client calls `/api/asset-momentum` on mount with the user's Aave
 * positions (plus a small "market context" set so the chart isn't empty
 * for stable-only positions).
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Cell,
  ZAxis,
  Label,
} from 'recharts';
import { Activity, TrendingUp, TrendingDown, Loader2 } from 'lucide-react';

import type { Portfolio } from '@/lib/aave/types';

// =========================================================================
// Wire types
// =========================================================================

interface AssetSpec {
  chainSlug: string;
  contractAddress: string;
  symbol: string;
}

interface MomentumPoint {
  symbol: string;
  chainSlug: string;
  contractAddress: string;
  currentPriceUsd: number | null;
  priceHistory: Array<{ timestamp: number; price: number }>;
  velocity7dPct: number | null;
  velocity1dPct: number | null;
  forcePct: number | null;
  quadrant:
    | 'rising_accelerating'
    | 'rising_decelerating'
    | 'falling_decelerating'
    | 'falling_accelerating'
    | 'flat'
    | null;
  error?: string;
}

interface MomentumResponse {
  results: MomentumPoint[];
  error?: string;
}

// =========================================================================
// Market-context assets — added to whatever the user holds so the chart
// always has signal even for stable-only positions. Arbitrum addresses.
// =========================================================================

const MARKET_CONTEXT_ASSETS: AssetSpec[] = [
  {
    symbol: 'WETH',
    chainSlug: 'arbitrum-one',
    contractAddress: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
  },
  {
    symbol: 'WBTC',
    chainSlug: 'arbitrum-one',
    contractAddress: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f',
  },
  {
    symbol: 'ARB',
    chainSlug: 'arbitrum-one',
    contractAddress: '0x912CE59144191C1204E64559FE8253a0e49E6548',
  },
];

// =========================================================================
// Quadrant colors
// =========================================================================

const QUADRANT_COLORS: Record<NonNullable<MomentumPoint['quadrant']>, string> =
  {
    rising_accelerating: '#22c55e',
    rising_decelerating: '#84cc16',
    falling_decelerating: '#f59e0b',
    falling_accelerating: '#ef4444',
    flat: '#71717a',
  };

const QUADRANT_LABELS: Record<NonNullable<MomentumPoint['quadrant']>, string> =
  {
    rising_accelerating: 'Rising & accelerating',
    rising_decelerating: 'Rising, losing steam',
    falling_decelerating: 'Falling, decelerating',
    falling_accelerating: 'Falling & accelerating',
    flat: 'Flat',
  };

// =========================================================================
// Wallet-discovery types — what we read from /api/wallet-holdings to
// figure out which tokens to fetch momentum for.
// =========================================================================

interface WalletErc20Token {
  contract: string;
  symbol: string;
  name: string | null;
  priceUsd: number | null;
  usdValue: number | null;
  isSpam: boolean;
}

interface WalletChainHoldings {
  chainSlug: string;
  chainName: string;
  erc20: WalletErc20Token[];
}

interface WalletHoldingsResponse {
  chains: WalletChainHoldings[];
  error?: string;
}

// Cap on assets sent to /api/asset-momentum so the chart doesn't crowd and
// Alchemy's historical endpoint isn't hammered.
const MAX_ASSETS_FOR_MOMENTUM = 15;
// Don't bother analyzing tokens worth less than this — too small to matter
// AND likely to have noisy/missing price history.
const MIN_USD_VALUE_FOR_INCLUSION = 1.0;

// =========================================================================
// Component
// =========================================================================

export function AssetMomentumPanel({
  positions,
  walletAddress,
}: {
  positions: Portfolio['positions'];
  /**
   * If supplied, the panel ALSO fetches /api/wallet-holdings to discover
   * every priced ERC-20 the wallet holds across all 5 supported chains,
   * then includes the most valuable non-spam ones in the momentum analysis.
   * Without this prop the panel falls back to Aave positions + market context.
   */
  walletAddress?: `0x${string}`;
}) {
  const [data, setData] = useState<MomentumResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [discoveredAssets, setDiscoveredAssets] = useState<AssetSpec[]>([]);
  const [discoveryNote, setDiscoveryNote] = useState<string | null>(null);

  // ─── Step 1: discover the asset list ────────────────────────────────
  // Combines:
  //   - user's Aave positions (collateral or debt)
  //   - top-N priced non-spam tokens from the multi-chain wallet scan
  //     (only fetched when walletAddress is provided)
  //   - market-context assets (WETH/WBTC/ARB on Arbitrum)
  // Deduplicated by chain+contract, capped at MAX_ASSETS_FOR_MOMENTUM,
  // sorted with the user's biggest USD positions first.
  useEffect(() => {
    let cancelled = false;

    const fromPositions: AssetSpec[] = positions
      .filter((p) => p.aTokenBalance > 0n || p.variableDebtBalance > 0n)
      .map((p) => ({
        symbol: p.symbol,
        chainSlug: 'arbitrum-one', // usePortfolio is Arbitrum-only by default
        contractAddress: p.asset,
      }));

    (async () => {
      let fromWallet: Array<AssetSpec & { usdValue: number }> = [];
      let walletErr: string | null = null;

      if (walletAddress) {
        try {
          const res = await fetch('/api/wallet-holdings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address: walletAddress }),
          });
          const json = (await res.json()) as WalletHoldingsResponse;
          if (!res.ok || json.error) {
            walletErr = json.error || `wallet scan HTTP ${res.status}`;
          } else {
            for (const chain of json.chains) {
              for (const t of chain.erc20) {
                if (t.isSpam) continue;
                if (t.priceUsd === null) continue;
                if ((t.usdValue ?? 0) < MIN_USD_VALUE_FOR_INCLUSION) continue;
                fromWallet.push({
                  chainSlug: chain.chainSlug,
                  contractAddress: t.contract,
                  symbol: t.symbol,
                  usdValue: t.usdValue ?? 0,
                });
              }
            }
            // Biggest USD value first, so when we hit the cap we keep the
            // user's most-meaningful holdings.
            fromWallet.sort((a, b) => b.usdValue - a.usdValue);
          }
        } catch (e) {
          walletErr = (e as Error).message;
        }
      }

      // Merge with dedup. Order = positions first (always include user's
      // Aave assets), then wallet holdings by USD value, then market context.
      const seen = new Set<string>();
      const merged: AssetSpec[] = [];
      const push = (a: AssetSpec) => {
        const key = `${a.chainSlug}:${a.contractAddress.toLowerCase()}`;
        if (seen.has(key)) return;
        seen.add(key);
        merged.push(a);
      };
      for (const a of fromPositions) push(a);
      for (const a of fromWallet) push(a);
      for (const a of MARKET_CONTEXT_ASSETS) push(a);

      const capped = merged.slice(0, MAX_ASSETS_FOR_MOMENTUM);

      if (cancelled) return;
      setDiscoveredAssets(capped);
      // Surface a discovery note so the user knows what's been included.
      const noteParts: string[] = [];
      if (fromWallet.length > 0) {
        noteParts.push(
          `${Math.min(fromWallet.length, MAX_ASSETS_FOR_MOMENTUM - fromPositions.length)} priced wallet token${fromWallet.length === 1 ? '' : 's'} included`
        );
      }
      if (walletErr) {
        noteParts.push(`wallet scan partial: ${walletErr}`);
      }
      if (merged.length > MAX_ASSETS_FOR_MOMENTUM) {
        noteParts.push(
          `capped at top ${MAX_ASSETS_FOR_MOMENTUM} of ${merged.length} candidates`
        );
      }
      setDiscoveryNote(noteParts.length > 0 ? noteParts.join(' · ') : null);
    })();

    return () => {
      cancelled = true;
    };
  }, [positions, walletAddress]);

  // ─── Step 2: fetch momentum for the discovered assets ───────────────
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    setData(null);

    if (discoveredAssets.length === 0) {
      setIsLoading(false);
      return;
    }

    (async () => {
      try {
        const res = await fetch('/api/asset-momentum', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ assets: discoveredAssets }),
        });
        const json = (await res.json()) as MomentumResponse;
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
  }, [discoveredAssets]);

  return (
    <div className="bg-zinc-900/50 border border-white/5 rounded-2xl p-5 mb-5">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <div className="flex items-center gap-2">
          <Activity size={14} className="text-zinc-500" />
          <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">
            Asset Momentum — Velocity &amp; Force
          </p>
        </div>
        <p className="text-[10px] text-zinc-500">
          7-day window · daily price data
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-[260px] text-zinc-500">
          <Loader2 size={18} className="animate-spin mr-2" /> Fetching price
          history…
        </div>
      ) : error ? (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-[12px] text-amber-300">
          Couldn&apos;t fetch momentum data: {error}
        </div>
      ) : !data || data.results.length === 0 ? (
        <p className="text-zinc-500 text-sm py-8 text-center">
          No momentum data available — your positions may all be on chains
          without Alchemy historical price coverage.
        </p>
      ) : (
        <>
          <MomentumContent points={data.results} />
          {discoveryNote && (
            <p className="text-[10px] text-zinc-500 mt-3">{discoveryNote}</p>
          )}
        </>
      )}
    </div>
  );
}

// =========================================================================
// Inner content — chart + table
// =========================================================================

function MomentumContent({ points }: { points: MomentumPoint[] }) {
  // Filter out points with no usable signal for the chart, but keep them
  // visible in the table so the user knows what was attempted.
  const charted = points.filter(
    (p) =>
      p.velocity7dPct !== null &&
      p.forcePct !== null &&
      Number.isFinite(p.velocity7dPct) &&
      Number.isFinite(p.forcePct)
  );

  // Determine axis bounds with a sensible padding so dots don't sit on
  // the edge.
  const vMax =
    charted.length > 0
      ? Math.max(...charted.map((p) => Math.abs(p.velocity7dPct ?? 0)))
      : 5;
  const fMax =
    charted.length > 0
      ? Math.max(...charted.map((p) => Math.abs(p.forcePct ?? 0)))
      : 5;
  const xBound = Math.max(5, vMax * 1.2);
  const yBound = Math.max(5, fMax * 1.2);

  const chartData = charted.map((p) => ({
    x: p.velocity7dPct ?? 0,
    y: p.forcePct ?? 0,
    symbol: p.symbol,
    quadrant: p.quadrant ?? 'flat',
    v1d: p.velocity1dPct,
    price: p.currentPriceUsd,
  }));

  return (
    <>
      {/* Quadrant scatter chart */}
      <div className="h-[280px] mb-4">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 10, right: 20, bottom: 30, left: 5 }}>
            <CartesianGrid stroke="#27272a" strokeDasharray="2 4" />
            <XAxis
              type="number"
              dataKey="x"
              name="Velocity"
              unit="%"
              domain={[-xBound, xBound]}
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              axisLine={{ stroke: '#3f3f46' }}
              tickLine={false}
            >
              <Label
                value="Velocity (7d % change)"
                position="insideBottom"
                offset={-15}
                fill="#9ca3af"
                fontSize={10}
              />
            </XAxis>
            <YAxis
              type="number"
              dataKey="y"
              name="Force"
              unit="pp"
              domain={[-yBound, yBound]}
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              axisLine={{ stroke: '#3f3f46' }}
              tickLine={false}
            >
              <Label
                value="Force (Δ velocity, pp)"
                angle={-90}
                position="insideLeft"
                style={{ textAnchor: 'middle' }}
                fill="#9ca3af"
                fontSize={10}
              />
            </YAxis>
            <ZAxis range={[60, 60]} />
            <ReferenceLine x={0} stroke="#52525b" strokeDasharray="4 4" />
            <ReferenceLine y={0} stroke="#52525b" strokeDasharray="4 4" />
            <Tooltip
              cursor={{ strokeDasharray: '3 3' }}
              contentStyle={{
                backgroundColor: '#0f172a',
                border: '1px solid #1e293b',
                borderRadius: '8px',
                fontSize: '12px',
              }}
              formatter={(value: number, name: string) => {
                if (name === 'Velocity') return [`${value.toFixed(2)}%`, 'Velocity 7d'];
                if (name === 'Force') return [`${value.toFixed(2)} pp`, 'Force'];
                return [value, name];
              }}
              labelFormatter={(_, payload) => {
                if (!payload || !payload[0]) return '';
                const d = payload[0].payload as (typeof chartData)[number];
                return `${d.symbol} · ${QUADRANT_LABELS[d.quadrant as keyof typeof QUADRANT_LABELS]}`;
              }}
            />
            <Scatter
              data={chartData}
              shape={(props: {
                cx?: number;
                cy?: number;
                payload?: (typeof chartData)[number];
              }) => {
                const cx = props.cx ?? 0;
                const cy = props.cy ?? 0;
                const d = props.payload!;
                const color =
                  QUADRANT_COLORS[
                    d.quadrant as keyof typeof QUADRANT_COLORS
                  ] ?? '#71717a';
                return (
                  <g>
                    <circle
                      cx={cx}
                      cy={cy}
                      r={6}
                      fill={color}
                      stroke="#fff"
                      strokeWidth={1}
                    />
                    <text
                      x={cx + 9}
                      y={cy + 3}
                      fill="#e4e4e7"
                      fontSize={11}
                      fontWeight={600}
                      style={{ pointerEvents: 'none' }}
                    >
                      {d.symbol}
                    </text>
                  </g>
                );
              }}
            >
              {chartData.map((d, i) => (
                <Cell
                  key={i}
                  fill={
                    QUADRANT_COLORS[
                      d.quadrant as keyof typeof QUADRANT_COLORS
                    ] ?? '#71717a'
                  }
                />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      {/* Quadrant legend */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[10px] mb-4">
        <QuadrantLegend
          color={QUADRANT_COLORS.rising_accelerating}
          label="Rising & accelerating"
          hint="bullish momentum"
        />
        <QuadrantLegend
          color={QUADRANT_COLORS.rising_decelerating}
          label="Rising, losing steam"
          hint="potential reversal"
        />
        <QuadrantLegend
          color={QUADRANT_COLORS.falling_decelerating}
          label="Falling, decelerating"
          hint="potential bottom"
        />
        <QuadrantLegend
          color={QUADRANT_COLORS.falling_accelerating}
          label="Falling & accelerating"
          hint="risk-off, dangerous"
        />
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-white/5">
        <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 px-3 py-2 bg-zinc-900/80 text-[9px] uppercase tracking-widest text-zinc-500 font-bold">
          <span>Asset</span>
          <span className="text-right">Price</span>
          <span className="text-right">1d</span>
          <span className="text-right">Velocity (7d)</span>
          <span className="text-right">Force</span>
        </div>
        <div className="max-h-[200px] overflow-y-auto">
          {points
            .slice()
            .sort((a, b) => {
              // Errors at the bottom; valid points by absolute velocity desc.
              if (a.error && !b.error) return 1;
              if (b.error && !a.error) return -1;
              return Math.abs(b.velocity7dPct ?? 0) - Math.abs(a.velocity7dPct ?? 0);
            })
            .map((p) => (
              <MomentumRow key={`${p.chainSlug}:${p.contractAddress}`} p={p} />
            ))}
        </div>
      </div>
    </>
  );
}

function MomentumRow({ p }: { p: MomentumPoint }) {
  const v7 = p.velocity7dPct;
  const v1 = p.velocity1dPct;
  const f = p.forcePct;
  return (
    <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 px-3 py-2 text-[12px] border-t border-white/5 hover:bg-white/[0.02]">
      <div className="flex items-center gap-2 min-w-0">
        <div
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{
            backgroundColor: p.quadrant
              ? QUADRANT_COLORS[p.quadrant]
              : '#71717a',
          }}
        />
        <span className="font-mono text-zinc-200 font-bold">{p.symbol}</span>
        {p.error && (
          <span className="text-[9px] text-amber-400 font-bold uppercase">
            no data
          </span>
        )}
      </div>
      <div className="text-right font-mono text-zinc-300 whitespace-nowrap">
        {p.currentPriceUsd !== null
          ? p.currentPriceUsd >= 1
            ? `$${p.currentPriceUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
            : `$${p.currentPriceUsd.toFixed(4)}`
          : '—'}
      </div>
      <div
        className="text-right font-mono whitespace-nowrap"
        style={{ color: signColor(v1) }}
      >
        {v1 !== null && Number.isFinite(v1) ? `${v1 > 0 ? '+' : ''}${v1.toFixed(2)}%` : '—'}
      </div>
      <div
        className="text-right font-mono font-bold whitespace-nowrap inline-flex items-center justify-end gap-1"
        style={{ color: signColor(v7) }}
      >
        {v7 !== null && Number.isFinite(v7)
          ? (
              <>
                {v7 > 0 ? <TrendingUp size={10} /> : v7 < 0 ? <TrendingDown size={10} /> : null}
                {`${v7 > 0 ? '+' : ''}${v7.toFixed(2)}%`}
              </>
            )
          : '—'}
      </div>
      <div
        className="text-right font-mono whitespace-nowrap"
        style={{ color: signColor(f) }}
      >
        {f !== null && Number.isFinite(f) ? `${f > 0 ? '+' : ''}${f.toFixed(2)} pp` : '—'}
      </div>
    </div>
  );
}

function QuadrantLegend({
  color,
  label,
  hint,
}: {
  color: string;
  label: string;
  hint: string;
}) {
  return (
    <div className="flex items-start gap-1.5 px-2 py-1.5 rounded-lg bg-zinc-900/60">
      <span
        className="w-2 h-2 rounded-full flex-shrink-0 mt-1"
        style={{ backgroundColor: color }}
      />
      <div className="min-w-0">
        <p className="text-zinc-300 font-semibold leading-tight">{label}</p>
        <p className="text-zinc-500 text-[9px] leading-tight">{hint}</p>
      </div>
    </div>
  );
}

function signColor(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return '#71717a';
  if (n > 0.5) return '#22c55e';
  if (n < -0.5) return '#ef4444';
  return '#a1a1aa';
}
