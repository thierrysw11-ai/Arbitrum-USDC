'use client';

/**
 * Monte Carlo simulation panel — the paid premium feature in the Sentinel
 * Elite Analysis modal.
 *
 * Click "Run Monte Carlo" → x402 dance: wallet signs an EIP-3009
 * transferWithAuthorization for 0.01 USDC, header attached, server runs
 * 1000 GBM paths over 30 days, returns the full distribution.
 *
 * Three visuals:
 *   1. Headline stats — P(liquidation), 5%/50% percentile, expected HF
 *   2. Histogram — terminal HF distribution, color-coded by safety zone
 *   3. Sample paths — 50 lines showing HF over 30 days
 */

import React, { useState, useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ReferenceLine,
  Cell,
  ResponsiveContainer,
  Tooltip,
  LineChart,
  Line,
  CartesianGrid,
  ScatterChart,
  Scatter,
  ZAxis,
  Label,
} from 'recharts';
import {
  Sparkles,
  ExternalLink,
  AlertTriangle,
  Loader2,
  TrendingUp,
} from 'lucide-react';
import { useAccount, useSignTypedData } from 'wagmi';

import { paidFetchBrowser } from '@/lib/x402/browser-fetch';

// =========================================================================
// Wire shape
// =========================================================================

type MaybeInf = number | 'INFINITY';

interface FrontierPoint {
  leverageScale: number;
  scaledDebtUsd: number;
  annualizedReturn: number;
  annualizedVolatility: number;
  sharpeRatio: number;
  pLiquidation: number;
  expectedTerminalHf: MaybeInf;
  initialHf: MaybeInf;
  isCurrent: boolean;
}

interface MonteCarloResponse {
  address: string;
  simulation: {
    config: {
      paths: number;
      horizonDays: number;
      volatilities: Record<string, number>;
      nonStableAssets: string[];
    };
    pLiquidation: number;
    percentiles: {
      p5: MaybeInf;
      p25: MaybeInf;
      p50: MaybeInf;
      p75: MaybeInf;
      p95: MaybeInf;
    };
    expectedTerminalHf: MaybeInf;
    worstTerminalHf: MaybeInf;
    bestTerminalHf: MaybeInf;
    histogram: { bins: number[]; counts: number[] };
    samplePaths: Array<{
      pathId: number;
      daily: Array<{ day: number; hf: number }>;
      minHf: number;
      terminalHf: number;
      liquidated: boolean;
    }>;
    riskAdjusted: {
      initialNetWorthUsd: number;
      annualizedReturnMean: number;
      annualizedReturnVolatility: number;
      sharpeRatio: number;
      riskFreeRateAnnual: number;
    };
  };
  efficientFrontier: {
    points: FrontierPoint[];
    riskFreeRateAnnual: number;
    currentIndex: number;
    optimalIndex: number;
  };
  meta: {
    elapsedMs: number;
    currentHealthFactor: number;
  };
}

const HF_COLORS = {
  safe: '#22c55e',
  caution: '#f59e0b',
  risky: '#ef4444',
} as const;

function hfColor(hf: number): string {
  if (hf < 1.2) return HF_COLORS.risky;
  if (hf < 1.5) return HF_COLORS.caution;
  return HF_COLORS.safe;
}

function unwrap(v: MaybeInf): number {
  return v === 'INFINITY' ? Infinity : v;
}

function fmtHf(n: number): string {
  if (!Number.isFinite(n)) return '∞';
  return n.toFixed(2);
}

// =========================================================================
// Component
// =========================================================================

interface Props {
  hasPosition: boolean;
}

export function MonteCarloPanel({ hasPosition }: Props) {
  const { address, isConnected } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();

  const [data, setData] = useState<MonteCarloResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [paymentInfo, setPaymentInfo] = useState<{
    txHash?: string;
    network?: string;
  } | null>(null);

  const run = async () => {
    if (!address || !isConnected) {
      setError('Connect a wallet first.');
      return;
    }
    setIsLoading(true);
    setError(null);
    setData(null);
    setPaymentInfo(null);

    try {
      const result = await paidFetchBrowser(
        '/api/agent/monte-carlo',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address: address.toLowerCase() }),
        },
        {
          payerAddress: address,
          signTypedData: async (typedData) => {
            // wagmi's signTypedDataAsync expects the same shape — pass through.
            const sig = await signTypedDataAsync({
              domain: typedData.domain as Parameters<typeof signTypedDataAsync>[0]['domain'],
              types: typedData.types as Parameters<typeof signTypedDataAsync>[0]['types'],
              primaryType: typedData.primaryType,
              message: typedData.message as Parameters<typeof signTypedDataAsync>[0]['message'],
            });
            return sig as `0x${string}`;
          },
          preferredNetwork: 'arbitrum-one',
        }
      );

      if (!result.response.ok) {
        const json = (await result.response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(
          json.error || `HTTP ${result.response.status}`
        );
      }

      const json = (await result.response.json()) as MonteCarloResponse;
      setData(json);
      if (result.payment.paymentResponse?.txHash) {
        setPaymentInfo({
          txHash: result.payment.paymentResponse.txHash,
          network: result.payment.paymentResponse.network,
        });
      }
    } catch (err) {
      const msg = (err as Error).message || 'Simulation failed';
      // wagmi rejection messages are verbose; surface the friendly bit
      const friendly = /rejected|denied|user rejected/i.test(msg)
        ? 'You rejected the signature in your wallet. The 0.01 USDC payment is required to run the simulation.'
        : msg;
      setError(friendly);
    } finally {
      setIsLoading(false);
    }
  };

  // ─── Empty / pre-run states ─────────────────────────────────────────
  if (!hasPosition) {
    return (
      <Shell>
        <div className="text-center py-8">
          <Sparkles className="w-10 h-10 text-purple-400 mx-auto mb-3" />
          <p className="text-zinc-300 font-semibold">No Aave V3 position to simulate</p>
          <p className="text-zinc-500 text-xs mt-1">
            Supply collateral and borrow on Aave V3 to unlock Monte Carlo
            risk analysis.
          </p>
        </div>
      </Shell>
    );
  }

  if (!data && !isLoading && !error) {
    return (
      <Shell>
        <div className="text-center py-6">
          <Sparkles className="w-10 h-10 text-purple-400 mx-auto mb-3" />
          <h3 className="text-xl font-bold mb-2">
            Probabilistic Risk: Monte Carlo Simulation
          </h3>
          <p className="text-zinc-400 text-sm max-w-lg mx-auto mb-1">
            1,000 GBM-simulated price paths over 30 days, daily resolution,
            using realized volatilities for each non-stable collateral.
            Returns the full HF distribution, P(liquidation), and 50 sample
            paths for visualization.
          </p>
          <p className="text-zinc-500 text-xs mb-6">
            Settled on-chain via x402: 0.01 USDC from your wallet →{' '}
            <code className="font-mono text-zinc-400">X402_RECEIVER_ADDRESS</code>{' '}
            on Arbitrum One.
          </p>
          <button
            onClick={run}
            className="px-8 py-3 bg-gradient-to-r from-purple-600 to-violet-600 rounded-2xl font-semibold text-white inline-flex items-center gap-2 shadow-lg shadow-purple-500/30 active:scale-95 transition-transform"
          >
            <Sparkles className="w-4 h-4" />
            Run Monte Carlo (0.01 USDC)
          </button>
        </div>
      </Shell>
    );
  }

  if (isLoading) {
    return (
      <Shell>
        <div className="text-center py-10">
          <Loader2 className="w-10 h-10 text-purple-400 mx-auto mb-4 animate-spin" />
          <p className="text-zinc-300 font-semibold">Settling 0.01 USDC payment…</p>
          <p className="text-zinc-500 text-sm mt-1">
            Sign in your wallet, then the simulation runs server-side
            (~1–3s for 1000 paths).
          </p>
        </div>
      </Shell>
    );
  }

  if (error) {
    return (
      <Shell>
        <div className="space-y-3">
          <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 text-red-300 rounded-xl p-4">
            <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
            <p className="text-sm">{error}</p>
          </div>
          <button
            onClick={run}
            className="w-full px-6 py-3 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-zinc-200 font-semibold transition-colors"
          >
            Retry
          </button>
        </div>
      </Shell>
    );
  }

  if (!data) return null;

  // ─── Result rendering ──────────────────────────────────────────────
  return <MonteCarloResult data={data} paymentInfo={paymentInfo} />;
}

// =========================================================================
// Result
// =========================================================================

// Plain-English interpretation of the simulation. Pure function of the
// numbers — no LLM call, no async. Returns a risk level + headline +
// supporting bullets + a recommendation category.
interface Interpretation {
  level: 'safe' | 'caution' | 'risky' | 'critical';
  accent: string;
  headline: string;
  details: string[];
  recommendation: string;
}

function interpret(
  sim: MonteCarloResponse['simulation'],
  currentHf: number
): Interpretation {
  const pLiq = sim.pLiquidation;
  const p5 = unwrap(sim.percentiles.p5);
  const p50 = unwrap(sim.percentiles.p50);
  const p95 = unwrap(sim.percentiles.p95);
  const horizon = sim.config.horizonDays;

  const pctFmt = (p: number) => `${(p * 100).toFixed(2)}%`;
  const dropFromCurrent = (target: number) => {
    if (!Number.isFinite(currentHf) || !Number.isFinite(target)) return null;
    if (currentHf <= 0) return null;
    return ((currentHf - target) / currentHf) * 100;
  };

  const p5DropPct = dropFromCurrent(p5);
  const dropLine =
    p5DropPct !== null
      ? `That's a ${p5DropPct.toFixed(0)}% drop from your current HF of ${currentHf.toFixed(2)}.`
      : `Current HF: ${Number.isFinite(currentHf) ? currentHf.toFixed(2) : '∞'}.`;

  if (pLiq < 0.005) {
    return {
      level: 'safe',
      accent: HF_COLORS.safe,
      headline: `Robust. Liquidation extremely unlikely over ${horizon} days.`,
      details: [
        `Probability of liquidation in the next ${horizon} days: ${pctFmt(pLiq)} — under half a percent.`,
        `Even in the worst 5% of simulated futures, your HF stays at ${fmtHf(p5)}. ${dropLine}`,
        `Median outcome: HF lands near ${fmtHf(p50)}. Top 5% of paths: HF ≥ ${fmtHf(p95)}.`,
      ],
      recommendation:
        'No defensive action needed. You have headroom for additional borrowing if you want — your safety buffer is generous.',
    };
  }
  if (pLiq < 0.02) {
    return {
      level: 'safe',
      accent: HF_COLORS.safe,
      headline: `Healthy. Liquidation risk is low but non-zero.`,
      details: [
        `Probability of liquidation: ${pctFmt(pLiq)} — about 1 in ${Math.round(1 / pLiq)} simulated paths.`,
        `Worst 5% of scenarios bring HF to ${fmtHf(p5)}. ${dropLine}`,
        `Median outcome: HF ${fmtHf(p50)}. Best 5%: HF ≥ ${fmtHf(p95)}.`,
      ],
      recommendation:
        'You\'re in a comfortable zone. Consider keeping at least your current collateral buffer — you have room to ride through normal market volatility without action.',
    };
  }
  if (pLiq < 0.05) {
    return {
      level: 'caution',
      accent: HF_COLORS.caution,
      headline: `Moderate risk. About 1 in ${Math.round(1 / pLiq)} ${horizon}-day futures liquidate you.`,
      details: [
        `Probability of liquidation: ${pctFmt(pLiq)}.`,
        `In the worst 5% of scenarios, HF drops to ${fmtHf(p5)} — close to liquidation territory. ${dropLine}`,
        `Median outcome is still healthy at HF ${fmtHf(p50)}, but the left tail is real.`,
      ],
      recommendation:
        'Worth de-risking. Consider reducing variable debt or adding stablecoin collateral to push the 5th-percentile HF further above 1.0.',
    };
  }
  if (pLiq < 0.15) {
    return {
      level: 'risky',
      accent: HF_COLORS.risky,
      headline: `Elevated liquidation risk over ${horizon} days.`,
      details: [
        `Probability of liquidation: ${pctFmt(pLiq)} — roughly 1 in ${Math.round(1 / pLiq)} ${horizon}-day paths.`,
        `Worst 5% of scenarios: HF ${fmtHf(p5)}. ${dropLine}`,
        `Even the median outcome lands at ${fmtHf(p50)}, leaving little headroom.`,
      ],
      recommendation:
        'Defensive action recommended. The simplest mitigations: partial debt repayment, or supplementing collateral with stablecoin assets to raise the weighted liquidation threshold.',
    };
  }
  return {
    level: 'critical',
    accent: HF_COLORS.risky,
    headline: `High liquidation probability — review urgently.`,
    details: [
      `Probability of liquidation: ${pctFmt(pLiq)}. Roughly ${Math.round(pLiq * 100)} out of every 100 simulated 30-day paths cross the 1.0 threshold.`,
      `5th-percentile HF: ${fmtHf(p5)}. Median: ${fmtHf(p50)}. ${dropLine}`,
      `This level of risk persists across volatility regimes — it's a structural debt-vs-collateral imbalance, not just bad-luck tail risk.`,
    ],
    recommendation:
      'Strongly consider unwinding part of the position. Either reduce debt directly or switch to lower-volatility collateral. Continuing without action exposes you to a meaningful chance of a forced liquidation event.',
  };
}

function MonteCarloResult({
  data,
  paymentInfo,
}: {
  data: MonteCarloResponse;
  paymentInfo: { txHash?: string; network?: string } | null;
}) {
  const sim = data.simulation;
  const p5 = unwrap(sim.percentiles.p5);
  const p50 = unwrap(sim.percentiles.p50);
  const p95 = unwrap(sim.percentiles.p95);
  const expected = unwrap(sim.expectedTerminalHf);
  const interpretation = interpret(sim, data.meta.currentHealthFactor);

  // Histogram chart data
  const histData = useMemo(() => {
    return sim.histogram.bins.map((bin, i) => {
      const prev = i === 0 ? 0 : sim.histogram.bins[i - 1];
      return {
        label: i === 0 ? `≤${bin}` : `${prev}–${bin}`,
        upperBin: bin,
        count: sim.histogram.counts[i] ?? 0,
      };
    });
  }, [sim.histogram]);

  // Sample-path chart data — pivot so each day is a row, each path a column.
  const pathChartData = useMemo(() => {
    const horizon = sim.config.horizonDays;
    const rows: Array<Record<string, number>> = [];
    for (let day = 0; day <= horizon; day++) {
      const row: Record<string, number> = { day };
      for (const p of sim.samplePaths) {
        const point = p.daily.find((d) => d.day === day);
        // Cap at 5 for display so a single insanely-healthy path doesn't
        // squash the others.
        if (point && Number.isFinite(point.hf)) {
          row[`p${p.pathId}`] = Math.min(point.hf, 5);
        }
      }
      rows.push(row);
    }
    return rows;
  }, [sim.samplePaths, sim.config.horizonDays]);

  const liqPct = (sim.pLiquidation * 100).toFixed(2);

  return (
    <Shell>
      {/* Headline metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Metric
          label="P(Liquidation)"
          value={`${liqPct}%`}
          accent={
            sim.pLiquidation > 0.05
              ? HF_COLORS.risky
              : sim.pLiquidation > 0.01
                ? HF_COLORS.caution
                : HF_COLORS.safe
          }
        />
        <Metric label="5th Percentile HF" value={fmtHf(p5)} accent={hfColor(p5)} />
        <Metric label="Median HF" value={fmtHf(p50)} accent={hfColor(p50)} />
        <Metric
          label="Expected HF"
          value={fmtHf(expected)}
          accent={hfColor(expected)}
        />
      </div>

      {/* Interpretation — plain English read of the numbers */}
      <div
        className="rounded-2xl p-4 mb-5 border"
        style={{
          backgroundColor: `${interpretation.accent}10`,
          borderColor: `${interpretation.accent}30`,
        }}
      >
        <div className="flex items-start gap-2 mb-3">
          <div
            className="text-[9px] uppercase tracking-widest font-bold px-2 py-0.5 rounded-full whitespace-nowrap"
            style={{
              backgroundColor: `${interpretation.accent}20`,
              color: interpretation.accent,
            }}
          >
            {interpretation.level}
          </div>
          <p
            className="text-sm font-bold leading-tight"
            style={{ color: interpretation.accent }}
          >
            {interpretation.headline}
          </p>
        </div>
        <ul className="space-y-1.5 text-[13px] text-zinc-200 leading-relaxed">
          {interpretation.details.map((d, i) => (
            <li key={i} className="flex gap-2">
              <span
                className="text-zinc-500 mt-0.5 flex-shrink-0"
                aria-hidden="true"
              >
                ·
              </span>
              <span>{d}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 pt-3 border-t border-white/5">
          <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-1">
            Recommendation
          </p>
          <p className="text-[13px] text-zinc-100 leading-relaxed">
            {interpretation.recommendation}
          </p>
        </div>
      </div>

      {/* Histogram */}
      <div className="mb-5">
        <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-2">
          Terminal Health Factor Distribution
        </p>
        <div className="h-[180px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={histData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
              <CartesianGrid stroke="#27272a" strokeDasharray="2 4" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: '#9ca3af' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: '#9ca3af' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                contentStyle={{
                  backgroundColor: '#0f172a',
                  border: '1px solid #1e293b',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {histData.map((d, i) => (
                  <Cell key={i} fill={hfColor(d.upperBin)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Sample paths */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">
            50 Sample Paths · {sim.config.horizonDays}-Day Horizon
          </p>
          <p className="text-[10px] text-red-400 font-bold">
            Liquidation: HF &lt; 1.00
          </p>
        </div>
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={pathChartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
              <CartesianGrid stroke="#27272a" strokeDasharray="2 4" vertical={false} />
              <XAxis
                dataKey="day"
                tick={{ fontSize: 10, fill: '#9ca3af' }}
                axisLine={false}
                tickLine={false}
                label={{ value: 'Day', position: 'insideBottom', offset: -5, fontSize: 10, fill: '#9ca3af' }}
              />
              <YAxis
                domain={[0, 5]}
                tick={{ fontSize: 10, fill: '#9ca3af' }}
                axisLine={false}
                tickLine={false}
              />
              <ReferenceLine
                y={1}
                stroke="#ef4444"
                strokeDasharray="3 3"
                label={{ value: 'LIQ', position: 'right', fill: '#ef4444', fontSize: 10 }}
              />
              {sim.samplePaths.map((p) => (
                <Line
                  key={p.pathId}
                  type="monotone"
                  dataKey={`p${p.pathId}`}
                  stroke={p.liquidated ? '#ef4444' : '#a1a1aa'}
                  strokeWidth={p.liquidated ? 1.5 : 0.6}
                  strokeOpacity={p.liquidated ? 0.7 : 0.3}
                  dot={false}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Risk-adjusted return — Sharpe ratio block */}
      <SharpePanel sharpe={sim.riskAdjusted} />

      {/* Efficient frontier */}
      <EfficientFrontierChart frontier={data.efficientFrontier} />

      {/* Settlement info + config */}
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-[11px] text-zinc-500 border-t border-white/5 pt-4">
        <div>
          <span className="text-zinc-600 mr-1">Paths:</span>
          <span className="font-mono text-zinc-300">{sim.config.paths}</span>
        </div>
        <div>
          <span className="text-zinc-600 mr-1">Horizon:</span>
          <span className="font-mono text-zinc-300">
            {sim.config.horizonDays} days
          </span>
        </div>
        <div>
          <span className="text-zinc-600 mr-1">Compute:</span>
          <span className="font-mono text-zinc-300">{data.meta.elapsedMs}ms</span>
        </div>
        <div>
          <span className="text-zinc-600 mr-1">Shocked assets:</span>
          <span className="font-mono text-zinc-300">
            {sim.config.nonStableAssets.join(', ') || '—'}
          </span>
        </div>
        {paymentInfo?.txHash && (
          <div className="ml-auto">
            <a
              href={`https://${paymentInfo.network === 'base' ? 'basescan.org' : 'arbiscan.io'}/tx/${paymentInfo.txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-emerald-400 hover:text-emerald-300 font-mono"
            >
              x402 settlement <ExternalLink size={10} />
            </a>
          </div>
        )}
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-gradient-to-b from-purple-950/20 to-zinc-900/50 border border-purple-500/20 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles size={14} className="text-purple-400" />
        <p className="text-[10px] uppercase tracking-widest text-purple-300 font-bold">
          Premium · Monte Carlo Simulation
        </p>
        <span className="ml-auto text-[10px] uppercase tracking-widest text-purple-400/70 font-bold border border-purple-500/20 px-2 py-0.5 rounded">
          x402 paid
        </span>
      </div>
      {children}
    </div>
  );
}

function Metric({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div className="bg-zinc-900/60 border border-white/5 rounded-xl p-3">
      <p className="text-[9px] uppercase tracking-widest text-zinc-500 font-bold">
        {label}
      </p>
      <p
        className="text-2xl font-mono font-black mt-1"
        style={{ color: accent }}
      >
        {value}
      </p>
    </div>
  );
}

// =========================================================================
// Sharpe / risk-adjusted return panel
// =========================================================================

function sharpeQualifier(s: number): {
  label: string;
  color: string;
  blurb: string;
} {
  if (!Number.isFinite(s) || s === 0) {
    return {
      label: 'N/A',
      color: '#71717a',
      blurb:
        'Sharpe is undefined when the position has zero return volatility — typically a stable-only, no-debt portfolio. The metric only shines when there\'s real risk to be compensated for.',
    };
  }
  if (s < 0) {
    return {
      label: 'NEGATIVE',
      color: HF_COLORS.risky,
      blurb:
        'Expected return is below the 4% risk-free rate — you\'re taking volatility risk and not being paid for it. Reducing leverage or switching to lower-volatility collateral would improve risk-adjusted returns.',
    };
  }
  if (s < 0.5) {
    return {
      label: 'WEAK',
      color: HF_COLORS.caution,
      blurb:
        'Below 0.5: you\'re earning some excess return over the risk-free rate, but the volatility you\'re absorbing is large relative to the reward.',
    };
  }
  if (s < 1.0) {
    return {
      label: 'FAIR',
      color: HF_COLORS.caution,
      blurb:
        '0.5–1.0 is a reasonable Sharpe for a leveraged DeFi position. You\'re being compensated for risk, but there\'s room to optimize.',
    };
  }
  if (s < 2.0) {
    return {
      label: 'STRONG',
      color: HF_COLORS.safe,
      blurb:
        'Above 1.0 is genuinely good. Your position is delivering meaningful risk-adjusted return.',
    };
  }
  return {
    label: 'EXCELLENT',
    color: HF_COLORS.safe,
    blurb:
      'Sharpe > 2 is excellent for a DeFi position. Either you have unusually low debt-side risk or your collateral mix is very conservative.',
  };
}

function SharpePanel({
  sharpe,
}: {
  sharpe: MonteCarloResponse['simulation']['riskAdjusted'];
}) {
  const q = sharpeQualifier(sharpe.sharpeRatio);
  const fmtPct = (n: number) => `${(n * 100).toFixed(2)}%`;
  return (
    <div className="bg-zinc-900/50 border border-white/5 rounded-2xl p-5 mb-5">
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp size={14} className="text-zinc-500" />
        <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">
          Risk-Adjusted Return
        </p>
        <span
          className="ml-auto text-[9px] uppercase tracking-widest font-bold px-2 py-0.5 rounded-full"
          style={{
            backgroundColor: `${q.color}20`,
            color: q.color,
          }}
        >
          {q.label}
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        <Metric
          label="Sharpe Ratio"
          value={Number.isFinite(sharpe.sharpeRatio) ? sharpe.sharpeRatio.toFixed(2) : '—'}
          accent={q.color}
        />
        <Metric
          label="Expected Return (ann.)"
          value={fmtPct(sharpe.annualizedReturnMean)}
          accent={
            sharpe.annualizedReturnMean >= sharpe.riskFreeRateAnnual
              ? HF_COLORS.safe
              : HF_COLORS.risky
          }
        />
        <Metric
          label="Volatility (ann.)"
          value={fmtPct(sharpe.annualizedReturnVolatility)}
          accent="#a78bfa"
        />
        <Metric
          label="Risk-Free Rate"
          value={fmtPct(sharpe.riskFreeRateAnnual)}
          accent="#71717a"
        />
      </div>

      <p className="text-[12px] text-zinc-300 leading-relaxed">{q.blurb}</p>

      <p className="text-[10px] text-zinc-600 mt-2">
        Sharpe = (Expected Return − Risk-Free Rate) / Volatility, all annualized.
        Computed over {sharpe.initialNetWorthUsd > 0 ? `$${sharpe.initialNetWorthUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '$0'} of starting net worth (collateral − debt).
      </p>
    </div>
  );
}

// =========================================================================
// Efficient frontier scatter
// =========================================================================

function unwrapPoint(p: FrontierPoint) {
  return {
    ...p,
    expectedTerminalHf: unwrap(p.expectedTerminalHf),
    initialHf: unwrap(p.initialHf),
  };
}

function EfficientFrontierChart({
  frontier,
}: {
  frontier: MonteCarloResponse['efficientFrontier'];
}) {
  const points = frontier.points.map(unwrapPoint);
  const current = points[frontier.currentIndex];
  const optimal = points[frontier.optimalIndex];

  // Recharts scatter expects { x, y, ...meta }
  const chartData = points.map((p) => ({
    x: p.annualizedVolatility * 100, // percent on chart axes
    y: p.annualizedReturn * 100,
    leverage: p.leverageScale,
    sharpe: p.sharpeRatio,
    pLiq: p.pLiquidation,
    initialHf: p.initialHf,
    isCurrent: p.isCurrent,
    isOptimal: frontier.points[frontier.optimalIndex] === p,
    feasible: p.pLiquidation < 0.05 && Number.isFinite(p.initialHf) && p.initialHf > 1.0,
  }));

  // Color logic per point
  const colorFor = (d: (typeof chartData)[number]): string => {
    if (!d.feasible) return HF_COLORS.risky;
    if (d.isCurrent) return '#3b82f6'; // blue
    if (d.isOptimal) return HF_COLORS.safe;
    return '#71717a';
  };

  const sameLeverage =
    frontier.currentIndex === frontier.optimalIndex;
  const verdict = sameLeverage
    ? 'Your current leverage is already on the efficient frontier — well-tuned for risk-adjusted return.'
    : optimal && current
      ? `Switching to ${optimal.leverageScale.toFixed(2)}× of your current debt would improve Sharpe from ${current.sharpeRatio.toFixed(2)} to ${optimal.sharpeRatio.toFixed(2)}, while keeping P(liq) ${optimal.pLiquidation < 0.01 ? 'below 1%' : `at ${(optimal.pLiquidation * 100).toFixed(1)}%`}.`
      : 'Frontier sweep complete.';

  return (
    <div className="bg-zinc-900/50 border border-white/5 rounded-2xl p-5 mb-5">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-zinc-500" />
          <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">
            Efficient Frontier — Leverage Sweep
          </p>
        </div>
        <p className="text-[10px] text-zinc-500">
          One point per debt-scaling level
        </p>
      </div>

      <div className="h-[240px] mb-3">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 10, right: 20, bottom: 30, left: 5 }}>
            <CartesianGrid stroke="#27272a" strokeDasharray="2 4" />
            <XAxis
              type="number"
              dataKey="x"
              name="Volatility"
              unit="%"
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              axisLine={{ stroke: '#3f3f46' }}
              tickLine={false}
            >
              <Label
                value="Annualized Volatility (%)"
                position="insideBottom"
                offset={-15}
                fill="#9ca3af"
                fontSize={10}
              />
            </XAxis>
            <YAxis
              type="number"
              dataKey="y"
              name="Return"
              unit="%"
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              axisLine={{ stroke: '#3f3f46' }}
              tickLine={false}
            >
              <Label
                value="Expected Return (%)"
                angle={-90}
                position="insideLeft"
                style={{ textAnchor: 'middle' }}
                fill="#9ca3af"
                fontSize={10}
              />
            </YAxis>
            <ZAxis range={[60, 400]} />
            <Tooltip
              cursor={{ strokeDasharray: '3 3' }}
              contentStyle={{
                backgroundColor: '#0f172a',
                border: '1px solid #1e293b',
                borderRadius: '8px',
                fontSize: '12px',
              }}
              formatter={(value: number, name: string, item) => {
                const d = item.payload as (typeof chartData)[number];
                if (name === 'Volatility') return [`${value.toFixed(1)}%`, 'Vol (ann.)'];
                if (name === 'Return') return [`${value.toFixed(1)}%`, 'Return (ann.)'];
                return [value, name];
              }}
              labelFormatter={(_, payload) => {
                if (!payload || !payload[0]) return '';
                const d = payload[0].payload as (typeof chartData)[number];
                return `Leverage ${d.leverage.toFixed(2)}× · Sharpe ${d.sharpe.toFixed(2)} · P(liq) ${(d.pLiq * 100).toFixed(1)}%`;
              }}
            />
            <Scatter
              data={chartData}
              shape={(props: { cx?: number; cy?: number; payload?: (typeof chartData)[number] }) => {
                const cx = props.cx ?? 0;
                const cy = props.cy ?? 0;
                const d = props.payload!;
                const r = d.isCurrent || d.isOptimal ? 9 : 6;
                return (
                  <g>
                    <circle
                      cx={cx}
                      cy={cy}
                      r={r}
                      fill={colorFor(d)}
                      stroke={d.isCurrent || d.isOptimal ? '#fff' : 'none'}
                      strokeWidth={d.isCurrent || d.isOptimal ? 2 : 0}
                      opacity={d.feasible ? 1 : 0.45}
                    />
                  </g>
                );
              }}
            />
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] mb-3">
        <LegendDot color="#3b82f6" label="Current position" />
        <LegendDot color={HF_COLORS.safe} label="Optimal Sharpe (feasible)" />
        <LegendDot color="#71717a" label="Other leverage levels" />
        <LegendDot color={HF_COLORS.risky} label="Infeasible (P(liq) > 5% or HF₀ < 1)" />
      </div>

      <p className="text-[12px] text-zinc-200 leading-relaxed border-t border-white/5 pt-3">
        {verdict}
      </p>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
        style={{ backgroundColor: color }}
      />
      <span className="text-zinc-400">{label}</span>
    </div>
  );
}
