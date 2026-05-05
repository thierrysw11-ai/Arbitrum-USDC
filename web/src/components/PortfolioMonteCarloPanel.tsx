'use client';

/**
 * Portfolio Monte Carlo panel — drawdown / value-at-risk for the wider
 * wallet, no Aave position required.
 *
 * Click "Run Portfolio Monte Carlo" → x402 dance: 0.01 USDC paid via
 * EIP-3009 transferWithAuthorization → server runs 1000 correlated GBM
 * paths over 30 days, tracking total portfolio USD value → returns the
 * full drawdown distribution + sample paths + Sharpe.
 *
 * Uses the wallet-holdings + asset-momentum endpoints (already warm from
 * other panels) to build the input. Server endpoint is pure compute —
 * no extra network round-trips after the request lands.
 */

import React, { useState, useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Cell,
  ResponsiveContainer,
  Tooltip,
  LineChart,
  Line,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';
import {
  Sparkles,
  ExternalLink,
  AlertTriangle,
  Loader2,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { useAccount, useSignTypedData } from 'wagmi';

import { paidFetchBrowser } from '@/lib/x402/browser-fetch';
import type { PortfolioMonteCarloResult } from '@/lib/portfolio/montecarlo';

// =========================================================================
// Wire shape
// =========================================================================

export interface PortfolioMonteCarloResponse {
  address: string;
  simulation: PortfolioMonteCarloResult;
  meta: { elapsedMs: number };
}

// Minimal shapes for the two endpoints we hit to assemble the request body.
interface HoldingsWire {
  chains: Array<{
    chainSlug: string;
    nativeBalance: {
      symbol: string;
      balanceFormatted: number;
      usdValue: number | null;
    };
    erc20: Array<{
      contract: string;
      symbol: string;
      balanceFormatted: number;
      priceUsd: number | null;
      usdValue: number | null;
      isSpam: boolean;
    }>;
    error?: string;
  }>;
  error?: string;
}

interface MomentumWire {
  results: Array<{
    symbol: string;
    chainSlug: string;
    contractAddress: string;
    priceHistory: Array<{ timestamp: number; price: number }>;
    error?: string;
  }>;
  error?: string;
}

// Native-token contract sentinels — we use them as the "key" for native
// balances so we can later match them to a price-history entry.
const NATIVE_KEY_BY_CHAIN: Record<string, { contract: string; symbol: string }> = {
  'ethereum-mainnet': { contract: 'native:eth', symbol: 'ETH' },
  'arbitrum-one': { contract: 'native:eth', symbol: 'ETH' },
  base: { contract: 'native:eth', symbol: 'ETH' },
  optimism: { contract: 'native:eth', symbol: 'ETH' },
  polygon: { contract: 'native:pol', symbol: 'POL' },
};

function holdingKey(chainSlug: string, contract: string): string {
  return `${chainSlug}:${contract.toLowerCase()}`;
}

// WETH addresses per chain — used so native ETH balances can borrow vol
// from the WETH price history (otherwise they have no history at all).
const WETH_BY_CHAIN: Record<string, string> = {
  'ethereum-mainnet': '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
  'arbitrum-one': '0x82af49447d8a07e3bd95bd0d56f35241523fbab1',
  base: '0x4200000000000000000000000000000000000006',
  optimism: '0x4200000000000000000000000000000000000006',
  polygon: '0x7ceb23fd6bc0add59e62ac25578270cff1b9f619',
};

// WBTC on Arbitrum — used as the BTC benchmark for Jensen's alpha / Beta /
// Treynor / Information Ratio. It tracks BTC closely and Alchemy has a
// reliable price history for it.
const WBTC_ARBITRUM = '0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f';
const BTC_BENCHMARK_KEY = `arbitrum-one:${WBTC_ARBITRUM}`;

const COLORS = {
  safe: '#22c55e',
  caution: '#f59e0b',
  risky: '#ef4444',
  blue: '#3b82f6',
} as const;

function levelColor(level: PortfolioMonteCarloResult['interpretation']['level']): string {
  switch (level) {
    case 'safe':
      return COLORS.safe;
    case 'caution':
      return COLORS.caution;
    case 'risky':
      return COLORS.risky;
    case 'critical':
      return COLORS.risky;
  }
}

const fmtUsd = (n: number): string => {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(2)}K`;
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
};

const fmtPct = (n: number) => `${n.toFixed(2)}%`;

// =========================================================================
// Component
// =========================================================================

interface Props {
  /**
   * Optional spectator-mode subject. When set, the simulation runs against
   * THIS address (not the connected wallet). Connected wallet is still the
   * x402 payer / signer.
   */
  subjectAddress?: `0x${string}`;
  onResult?: (
    result: {
      data: PortfolioMonteCarloResponse;
      payment: { txHash?: string; network?: string } | null;
    } | null
  ) => void;
  /**
   * Manual off-chain holdings the user declared via the "Add manual
   * holdings" input — typically native BTC since we don't scan the
   * Bitcoin network. Each entry has a USD value already computed at the
   * input layer (Chainlink price × declared amount).
   */
  manualHoldings?: Array<{
    symbol: string;
    usdValue: number;
    /** Used as the engine key. Synthetic since these are off-EVM. */
    key: string;
  }>;
}

export function PortfolioMonteCarloPanel({
  subjectAddress,
  onResult,
  manualHoldings,
}: Props) {
  const { address, isConnected } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();

  const subject = subjectAddress ?? address;
  const isSpectator = !!subjectAddress && subjectAddress !== address;

  const [data, setData] = useState<PortfolioMonteCarloResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<
    'idle' | 'fetching' | 'paying' | 'simulating' | 'done' | 'error'
  >('idle');
  const [paymentInfo, setPaymentInfo] = useState<{
    txHash?: string;
    network?: string;
  } | null>(null);

  const isLoading = stage === 'fetching' || stage === 'paying' || stage === 'simulating';

  const run = async () => {
    if (!address || !isConnected) {
      setError('Connect a wallet first.');
      return;
    }
    if (!subject) {
      setError('No subject address to simulate.');
      return;
    }

    setError(null);
    setData(null);
    setPaymentInfo(null);
    onResult?.(null);
    setStage('fetching');

    try {
      // ---------------------------------------------------------------------
      // 1. Build the simulation input from the existing free endpoints.
      //    /api/wallet-holdings → priced holdings across 5 chains
      //    /api/asset-momentum → 14d price history per asset
      // ---------------------------------------------------------------------
      const holdingsRes = await fetch('/api/wallet-holdings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: subject }),
      });
      const holdings = (await holdingsRes.json()) as HoldingsWire;
      if (!holdingsRes.ok || holdings.error) {
        throw new Error(holdings.error || `wallet-holdings HTTP ${holdingsRes.status}`);
      }

      // Flatten holdings into the engine's input shape.
      const inputHoldings: Array<{ symbol: string; usdValue: number; key: string }> = [];
      const assetSpecs: Array<{ chainSlug: string; contractAddress: string; symbol: string }> = [];
      const seenAssetKeys = new Set<string>();
      const queueAsset = (chainSlug: string, contract: string, symbol: string) => {
        const k = holdingKey(chainSlug, contract);
        if (seenAssetKeys.has(k)) return;
        seenAssetKeys.add(k);
        // Only ask asset-momentum for real ERC-20s — the native sentinel
        // routes to WETH instead.
        if (contract.startsWith('0x')) {
          assetSpecs.push({ chainSlug, contractAddress: contract, symbol });
        }
      };

      for (const c of holdings.chains) {
        const native = c.nativeBalance;
        if (
          native?.usdValue &&
          native.usdValue > 0 &&
          native.balanceFormatted > 0
        ) {
          const sentinel = NATIVE_KEY_BY_CHAIN[c.chainSlug];
          // Use the WETH address as the price-history source for native ETH
          // (no asset-momentum endpoint coverage for "native:eth").
          const sourceContract =
            (sentinel?.symbol === 'ETH' || native.symbol === 'ETH')
              ? WETH_BY_CHAIN[c.chainSlug] ?? sentinel?.contract ?? `native:${native.symbol}`
              : sentinel?.contract ?? `native:${native.symbol}`;
          inputHoldings.push({
            symbol: native.symbol,
            usdValue: native.usdValue,
            key: holdingKey(c.chainSlug, sourceContract),
          });
          if (sourceContract.startsWith('0x')) {
            queueAsset(c.chainSlug, sourceContract, native.symbol);
          }
        }
        for (const t of c.erc20) {
          if (t.isSpam) continue;
          if (t.usdValue === null || t.usdValue <= 0) continue;
          inputHoldings.push({
            symbol: t.symbol,
            usdValue: t.usdValue,
            key: holdingKey(c.chainSlug, t.contract),
          });
          queueAsset(c.chainSlug, t.contract, t.symbol);
        }
      }

      // Append manually-declared off-EVM holdings (e.g. native BTC). These
      // bypass asset-momentum (no real contract address) and rely on the
      // engine's per-symbol fallback vol — BTC = 0.7, an industry-standard
      // realized vol for the asset.
      const manual = manualHoldings ?? [];
      for (const m of manual) {
        if (m.usdValue > 0) {
          inputHoldings.push({
            symbol: m.symbol,
            usdValue: m.usdValue,
            key: m.key,
          });
        }
      }

      if (inputHoldings.length === 0) {
        // Diagnostic: distinguish "wallet is genuinely empty" from
        // "wallet has tokens but nothing got priced" (Alchemy hiccup,
        // unusual tokens, etc.). The user deserves to know which.
        let nonZeroNative = 0;
        let nonZeroErc20 = 0;
        let unpriced = 0;
        const chainErrors: string[] = [];
        for (const c of holdings.chains) {
          if (c.error) chainErrors.push(`${c.chainSlug}: ${c.error}`);
          if (c.nativeBalance.balanceFormatted > 0) {
            nonZeroNative++;
            if (c.nativeBalance.usdValue === null) unpriced++;
          }
          for (const t of c.erc20) {
            if (t.isSpam) continue;
            if (t.balanceFormatted > 0) {
              nonZeroErc20++;
              if (t.usdValue === null) unpriced++;
            }
          }
        }
        if (chainErrors.length > 0) {
          throw new Error(
            `Some chains failed to scan: ${chainErrors.slice(0, 2).join('; ')}${chainErrors.length > 2 ? ` (+${chainErrors.length - 2} more)` : ''}. Try Retry — Alchemy may be rate-limiting.`
          );
        }
        if (nonZeroNative + nonZeroErc20 === 0) {
          throw new Error(
            'Wallet appears empty across all 5 EVM chains scanned. If you hold native BTC or other off-EVM assets, add them via the input above.'
          );
        }
        throw new Error(
          `Wallet has ${nonZeroNative + nonZeroErc20} non-zero holdings, but ${unpriced} of them couldn't be priced (Alchemy may be rate-limiting). Try Retry in a few seconds, or add manual BTC if you hold any.`
        );
      }

      // Pull the price histories. Cap at 20 most-valuable assets (matches
      // engine cap, keeps payload small).
      const topAssets = [...inputHoldings]
        .sort((a, b) => b.usdValue - a.usdValue)
        .slice(0, 20)
        .map((h) => h.key);
      const topAssetSet = new Set(topAssets);
      const limitedSpecs = assetSpecs.filter((s) =>
        topAssetSet.has(holdingKey(s.chainSlug, s.contractAddress))
      );

      // Always query WBTC on Arbitrum as the BTC benchmark — even if the
      // user doesn't hold any BTC variant. Beta/Alpha/Treynor need it.
      if (
        !limitedSpecs.find(
          (s) => holdingKey(s.chainSlug, s.contractAddress) === BTC_BENCHMARK_KEY
        )
      ) {
        limitedSpecs.push({
          symbol: 'WBTC',
          chainSlug: 'arbitrum-one',
          contractAddress: WBTC_ARBITRUM,
        });
      }

      let priceHistoryByKey: Record<
        string,
        Array<{ timestamp: number; price: number }>
      > = {};
      let benchmarkPriceHistory:
        | Array<{ timestamp: number; price: number }>
        | undefined;
      if (limitedSpecs.length > 0) {
        const momRes = await fetch('/api/asset-momentum', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ assets: limitedSpecs }),
        });
        const mom = (await momRes.json()) as MomentumWire;
        if (momRes.ok && !mom.error) {
          for (const r of mom.results) {
            const k = holdingKey(r.chainSlug, r.contractAddress);
            priceHistoryByKey[k] = r.priceHistory;
            if (k === BTC_BENCHMARK_KEY) benchmarkPriceHistory = r.priceHistory;
          }
        }
        // Soft-fail — engine will use fallback vols for assets without history.
      }

      // ---------------------------------------------------------------------
      // 2. Pay + run the simulation.
      // ---------------------------------------------------------------------
      setStage('paying');
      const result = await paidFetchBrowser(
        '/api/agent/portfolio-monte-carlo',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            address: subject.toLowerCase(),
            holdings: inputHoldings,
            priceHistoryByKey,
            benchmarkSymbol: 'BTC',
            benchmarkPriceHistory,
          }),
        },
        {
          payerAddress: address,
          signTypedData: async (typedData) => {
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
      setStage('simulating');

      if (!result.response.ok) {
        const json = (await result.response.json().catch(() => ({}))) as { error?: string };
        throw new Error(json.error || `HTTP ${result.response.status}`);
      }

      const json = (await result.response.json()) as PortfolioMonteCarloResponse;
      setData(json);
      const payment = result.payment.paymentResponse?.txHash
        ? {
            txHash: result.payment.paymentResponse.txHash,
            network: result.payment.paymentResponse.network,
          }
        : null;
      if (payment) setPaymentInfo(payment);
      setStage('done');
      onResult?.({ data: json, payment });
    } catch (err) {
      const msg = (err as Error).message || 'Simulation failed';
      const friendly = /rejected|denied|user rejected/i.test(msg)
        ? 'You rejected the signature in your wallet. The 0.01 USDC payment is required to run the simulation.'
        : msg;
      setError(friendly);
      setStage('error');
    }
  };

  // ─── Pre-run state ────────────────────────────────────────────────
  if (!data && !isLoading && !error) {
    return (
      <Shell>
        <div className="text-center py-6">
          <TrendingDown className="w-10 h-10 text-purple-400 mx-auto mb-3" />
          <h3 className="text-xl font-bold mb-2">
            Portfolio Drawdown Simulation
          </h3>
          {isSpectator && subject && (
            <p className="text-amber-300/80 text-xs mb-2">
              Spectator mode — simulating{' '}
              <code className="font-mono">
                {subject.slice(0, 6)}…{subject.slice(-4)}
              </code>
              . You pay from your connected wallet.
            </p>
          )}
          <p className="text-zinc-400 text-sm max-w-lg mx-auto mb-2">
            1,000 GBM-simulated paths over 30 days, with{' '}
            <span className="text-zinc-200 font-semibold">correlated</span>{' '}
            asset moves driven by realized 14-day correlations. Tracks total
            portfolio USD value to compute Value-at-Risk, drawdown probabilities,
            and risk-adjusted return.
          </p>
          <p className="text-zinc-500 text-xs mb-6">
            Works for any wallet — no Aave position required. Settled on-chain via
            x402: 0.01 USDC.
          </p>
          <button
            onClick={run}
            className="px-8 py-3 bg-gradient-to-r from-purple-600 to-violet-600 rounded-2xl font-semibold text-white inline-flex items-center gap-2 shadow-lg shadow-purple-500/30 active:scale-95 transition-transform"
          >
            <Sparkles className="w-4 h-4" />
            Run Portfolio Monte Carlo (0.01 USDC)
          </button>
        </div>
      </Shell>
    );
  }

  if (isLoading) {
    // TS narrows `stage` here to the in-flight subset, so type the lookup
    // against the full union explicitly to keep the table complete.
    const stageLabel: Record<
      'idle' | 'fetching' | 'paying' | 'simulating' | 'done' | 'error',
      string
    > = {
      idle: '',
      fetching: 'Fetching live wallet holdings + 14-day price history…',
      paying: 'Settling 0.01 USDC payment — sign in your wallet…',
      simulating: 'Running 1,000 correlated paths…',
      done: '',
      error: '',
    };
    return (
      <Shell>
        <div className="text-center py-10">
          <Loader2 className="w-10 h-10 text-purple-400 mx-auto mb-4 animate-spin" />
          <p className="text-zinc-300 font-semibold">{stageLabel[stage]}</p>
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
  return <Result data={data} paymentInfo={paymentInfo} />;
}

// =========================================================================
// Result rendering
// =========================================================================

function Result({
  data,
  paymentInfo,
}: {
  data: PortfolioMonteCarloResponse;
  paymentInfo: { txHash?: string; network?: string } | null;
}) {
  const sim = data.simulation;
  const interp = sim.interpretation;
  const accent = levelColor(interp.level);
  const initial = sim.initialPortfolioUsd;

  // Histogram chart data
  const histData = useMemo(() => {
    return sim.histogram.bins.map((upperUsd, i) => {
      const dropPct = ((initial - upperUsd) / initial) * 100;
      return {
        upperUsd,
        // negative loss = gain. positive = loss.
        dropPct,
        count: sim.histogram.counts[i] ?? 0,
        label: dropPct >= 0 ? `-${dropPct.toFixed(0)}%` : `+${Math.abs(dropPct).toFixed(0)}%`,
      };
    });
  }, [sim.histogram, initial]);

  // Sample paths chart — pivot to row-per-day
  const pathChart = useMemo(() => {
    const horizon = sim.config.horizonDays;
    const rows: Array<Record<string, number>> = [];
    for (let day = 0; day <= horizon; day++) {
      const row: Record<string, number> = { day };
      for (const p of sim.samplePaths) {
        // Express path as % of initial portfolio (cleaner axes than raw USD).
        const v = p.daily[day];
        if (typeof v === 'number') row[`p${p.pathId}`] = (v / initial) * 100;
      }
      rows.push(row);
    }
    return rows;
  }, [sim.samplePaths, sim.config.horizonDays, initial]);

  return (
    <Shell>
      {/* Headline metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Metric
          label="Value-at-Risk (95%)"
          value={fmtPct(sim.var95Pct)}
          accent={sim.var95Pct > 25 ? COLORS.risky : sim.var95Pct > 10 ? COLORS.caution : COLORS.safe}
          hint="Worst-case loss in the bottom 5% of paths"
        />
        <Metric
          label="P(Loss ≥ 20%)"
          value={fmtPct(sim.pLossGte.p20 * 100)}
          accent={sim.pLossGte.p20 > 0.1 ? COLORS.risky : sim.pLossGte.p20 > 0.02 ? COLORS.caution : COLORS.safe}
        />
        <Metric
          label="Median Outcome"
          value={fmtUsd(sim.percentiles.p50)}
          accent="#a78bfa"
          hint={`from ${fmtUsd(initial)} start`}
        />
        <Metric
          label="Median Max Drawdown"
          value={`${sim.maxDrawdown.p50Pct.toFixed(1)}%`}
          accent={sim.maxDrawdown.p50Pct > 20 ? COLORS.caution : COLORS.safe}
        />
      </div>

      {/* Interpretation card */}
      <div
        className="rounded-2xl p-4 mb-5 border"
        style={{
          backgroundColor: `${accent}10`,
          borderColor: `${accent}30`,
        }}
      >
        <div className="flex items-start gap-2 mb-3">
          <div
            className="text-[9px] uppercase tracking-widest font-bold px-2 py-0.5 rounded-full whitespace-nowrap"
            style={{
              backgroundColor: `${accent}20`,
              color: accent,
            }}
          >
            {interp.level}
          </div>
          <p
            className="text-sm font-bold leading-tight"
            style={{ color: accent }}
          >
            {interp.headline}
          </p>
        </div>
        <ul className="space-y-1.5 text-[13px] text-zinc-200 leading-relaxed">
          {interp.details.map((d, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-zinc-500 mt-0.5 flex-shrink-0">·</span>
              <span>{d}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 pt-3 border-t border-white/5">
          <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-1">
            Recommendation
          </p>
          <p className="text-[13px] text-zinc-100 leading-relaxed">
            {interp.recommendation}
          </p>
        </div>
      </div>

      {/* Histogram of terminal portfolio value */}
      <div className="mb-5">
        <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-2">
          Terminal Portfolio Value Distribution
        </p>
        <div className="h-[180px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={histData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
              <CartesianGrid stroke="#27272a" strokeDasharray="2 4" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 9, fill: '#9ca3af' }}
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
                formatter={(value: number, _name: string) => [`${value} paths`, 'Count']}
                labelFormatter={(label) => `Outcome: ${label}`}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {histData.map((d, i) => (
                  <Cell
                    key={i}
                    fill={
                      d.dropPct >= 30
                        ? COLORS.risky
                        : d.dropPct >= 10
                          ? COLORS.caution
                          : COLORS.safe
                    }
                  />
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
            {sim.samplePaths.length} sample paths · % of initial value
          </p>
          <p className="text-[10px] text-red-400 font-bold">
            -30% drawdown line
          </p>
        </div>
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={pathChart} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
              <CartesianGrid stroke="#27272a" strokeDasharray="2 4" vertical={false} />
              <XAxis
                dataKey="day"
                tick={{ fontSize: 10, fill: '#9ca3af' }}
                axisLine={false}
                tickLine={false}
                label={{ value: 'Day', position: 'insideBottom', offset: -5, fontSize: 10, fill: '#9ca3af' }}
              />
              <YAxis
                tick={{ fontSize: 10, fill: '#9ca3af' }}
                axisLine={false}
                tickLine={false}
                domain={[0, 200]}
              />
              <ReferenceLine y={100} stroke="#71717a" strokeDasharray="3 3" />
              <ReferenceLine
                y={70}
                stroke="#ef4444"
                strokeDasharray="3 3"
                label={{ value: '-30%', position: 'right', fill: '#ef4444', fontSize: 10 }}
              />
              {sim.samplePaths.map((p) => (
                <Line
                  key={p.pathId}
                  type="monotone"
                  dataKey={`p${p.pathId}`}
                  stroke={p.breachedDrawdown ? '#ef4444' : '#a1a1aa'}
                  strokeWidth={p.breachedDrawdown ? 1.2 : 0.5}
                  strokeOpacity={p.breachedDrawdown ? 0.7 : 0.3}
                  dot={false}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Risk-adjusted return */}
      <SharpeBlock sharpe={sim.riskAdjusted} />

      {/* Wealth-manager quant metrics */}
      <QuantBlock quant={sim.quant} />

      {/* Config + settlement footer */}
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-[11px] text-zinc-500 border-t border-white/5 pt-4">
        <div>
          <span className="text-zinc-600 mr-1">Paths:</span>
          <span className="font-mono text-zinc-300">{sim.config.paths}</span>
        </div>
        <div>
          <span className="text-zinc-600 mr-1">Horizon:</span>
          <span className="font-mono text-zinc-300">{sim.config.horizonDays} days</span>
        </div>
        <div>
          <span className="text-zinc-600 mr-1">Assets simulated:</span>
          <span className="font-mono text-zinc-300">{sim.config.assetsAnalyzed.length}</span>
        </div>
        <div>
          <span className="text-zinc-600 mr-1">Compute:</span>
          <span className="font-mono text-zinc-300">{data.meta.elapsedMs}ms</span>
        </div>
        {sim.config.totalUsdSkipped > 0 && (
          <div>
            <span className="text-amber-500 mr-1">Skipped:</span>
            <span className="font-mono text-amber-400">
              {fmtUsd(sim.config.totalUsdSkipped)} · no vol data
            </span>
          </div>
        )}
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

function SharpeBlock({
  sharpe,
}: {
  sharpe: PortfolioMonteCarloResult['riskAdjusted'];
}) {
  const fmt = (n: number) => `${(n * 100).toFixed(2)}%`;
  const sharpeQuality =
    sharpe.sharpeRatio < 0
      ? { color: COLORS.risky, label: 'NEGATIVE' }
      : sharpe.sharpeRatio < 0.5
        ? { color: COLORS.caution, label: 'WEAK' }
        : sharpe.sharpeRatio < 1
          ? { color: COLORS.caution, label: 'FAIR' }
          : { color: COLORS.safe, label: 'STRONG' };

  return (
    <div className="bg-zinc-900/50 border border-white/5 rounded-2xl p-5 mb-5">
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp size={14} className="text-zinc-500" />
        <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">
          Risk-Adjusted Return (annualized)
        </p>
        <span
          className="ml-auto text-[9px] uppercase tracking-widest font-bold px-2 py-0.5 rounded-full"
          style={{ backgroundColor: `${sharpeQuality.color}20`, color: sharpeQuality.color }}
        >
          {sharpeQuality.label}
        </span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Metric
          label="Sharpe Ratio"
          value={Number.isFinite(sharpe.sharpeRatio) ? sharpe.sharpeRatio.toFixed(2) : '—'}
          accent={sharpeQuality.color}
        />
        <Metric
          label="Expected Return"
          value={fmt(sharpe.annualizedReturnMean)}
          accent={
            sharpe.annualizedReturnMean >= sharpe.riskFreeRateAnnual ? COLORS.safe : COLORS.risky
          }
        />
        <Metric
          label="Volatility"
          value={fmt(sharpe.annualizedReturnVolatility)}
          accent="#a78bfa"
        />
        <Metric
          label="Risk-Free Rate"
          value={fmt(sharpe.riskFreeRateAnnual)}
          accent="#71717a"
        />
      </div>
    </div>
  );
}

// =========================================================================
// Shared small UI atoms
// =========================================================================

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-gradient-to-b from-purple-950/20 to-zinc-900/50 border border-purple-500/20 rounded-2xl p-5 mb-5">
      <div className="flex items-center gap-2 mb-4">
        <TrendingDown size={14} className="text-purple-400" />
        <p className="text-[10px] uppercase tracking-widest text-purple-300 font-bold">
          Premium · Portfolio Drawdown
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
  hint,
}: {
  label: string;
  value: string;
  accent: string;
  hint?: string;
}) {
  return (
    <div className="bg-zinc-900/60 border border-white/5 rounded-xl p-3">
      <p className="text-[9px] uppercase tracking-widest text-zinc-500 font-bold">
        {label}
      </p>
      <p className="text-2xl font-mono font-black mt-1" style={{ color: accent }}>
        {value}
      </p>
      {hint && <p className="text-[9px] text-zinc-600 mt-1">{hint}</p>}
    </div>
  );
}

// =========================================================================
// Quant metrics block — TradFi-grade stats
// =========================================================================

function QuantBlock({
  quant,
}: {
  quant: PortfolioMonteCarloResult['quant'];
}) {
  const fmtPct = (n: number) => `${(n * 100).toFixed(2)}%`;
  const fmtNum = (n: number, dp = 2) =>
    Number.isFinite(n) ? n.toFixed(dp) : '—';

  return (
    <div className="bg-zinc-900/50 border border-white/5 rounded-2xl p-5 mb-5">
      <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-3">
        Quant Metrics — wealth-manager grade
      </p>

      {/* Distribution moments */}
      <p className="text-[9px] uppercase tracking-widest text-zinc-600 font-bold mb-2">
        Distribution moments (annualized)
      </p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Metric
          label="Stddev"
          value={fmtPct(quant.stddevAnnual)}
          accent="#a78bfa"
          hint="Annualized return volatility"
        />
        <Metric
          label="Variance"
          value={fmtPct(quant.varianceAnnual)}
          accent="#a78bfa"
          hint="= Stddev²"
        />
        <Metric
          label="Skewness"
          value={fmtNum(quant.skewness)}
          accent={quant.skewness < -0.5 ? COLORS.risky : quant.skewness > 0.5 ? COLORS.safe : COLORS.caution}
          hint={quant.skewness < 0 ? 'Left-tailed (downside)' : 'Right-tailed (upside)'}
        />
        <Metric
          label="Excess Kurtosis"
          value={fmtNum(quant.excessKurtosis)}
          accent={quant.excessKurtosis > 1 ? COLORS.risky : COLORS.safe}
          hint={quant.excessKurtosis > 1 ? 'Heavy tails — outlier risk' : 'Near-normal tails'}
        />
      </div>

      {/* Downside risk */}
      <p className="text-[9px] uppercase tracking-widest text-zinc-600 font-bold mb-2">
        Downside risk
      </p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Metric
          label="Downside Deviation"
          value={fmtPct(quant.downsideDeviationAnnual)}
          accent={COLORS.caution}
          hint="Annualized · only neg returns"
        />
        <Metric
          label="Sortino Ratio"
          value={fmtNum(quant.sortinoRatio)}
          accent={
            quant.sortinoRatio >= 1
              ? COLORS.safe
              : quant.sortinoRatio >= 0
                ? COLORS.caution
                : COLORS.risky
          }
          hint="(R-Rf) / downside dev"
        />
        <Metric
          label="VaR (99%)"
          value={`${quant.var99Pct.toFixed(2)}%`}
          accent={quant.var99Pct > 35 ? COLORS.risky : quant.var99Pct > 20 ? COLORS.caution : COLORS.safe}
          hint="1%-tile loss over horizon"
        />
        <Metric
          label="Expected Shortfall (99%)"
          value={`${quant.cvar99Pct.toFixed(2)}%`}
          accent={quant.cvar99Pct > 50 ? COLORS.risky : quant.cvar99Pct > 30 ? COLORS.caution : COLORS.safe}
          hint="Avg loss in worst 1%"
        />
      </div>

      {/* Benchmark-relative */}
      <p className="text-[9px] uppercase tracking-widest text-zinc-600 font-bold mb-2">
        Benchmark — {quant.benchmark?.symbol ?? 'BTC'}
      </p>
      {quant.benchmark ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
            <Metric
              label="Beta"
              value={fmtNum(quant.benchmark.beta)}
              accent={
                Math.abs(quant.benchmark.beta - 1) < 0.2
                  ? COLORS.safe
                  : quant.benchmark.beta > 1.5 || quant.benchmark.beta < 0
                    ? COLORS.risky
                    : COLORS.caution
              }
              hint={
                quant.benchmark.beta > 1
                  ? `Moves ${quant.benchmark.beta.toFixed(2)}× the benchmark`
                  : quant.benchmark.beta < 0
                    ? 'Inversely related'
                    : 'Less reactive than benchmark'
              }
            />
            <Metric
              label="Jensen's Alpha"
              value={fmtPct(quant.benchmark.jensenAlphaAnnual)}
              accent={quant.benchmark.jensenAlphaAnnual > 0 ? COLORS.safe : COLORS.risky}
              hint="Excess vs CAPM-fair return"
            />
            <Metric
              label="Treynor Ratio"
              value={fmtNum(quant.benchmark.treynorRatio)}
              accent={quant.benchmark.treynorRatio > 0 ? COLORS.safe : COLORS.risky}
              hint="(R-Rf) / β"
            />
            <Metric
              label="Information Ratio"
              value={fmtNum(quant.benchmark.informationRatio)}
              accent={
                quant.benchmark.informationRatio > 0.5
                  ? COLORS.safe
                  : quant.benchmark.informationRatio > 0
                    ? COLORS.caution
                    : COLORS.risky
              }
              hint="Active return / tracking error"
            />
          </div>
          <p className="text-[11px] text-zinc-400 leading-relaxed">
            Portfolio correlates{' '}
            <span className="font-mono text-zinc-200">
              {quant.benchmark.correlation.toFixed(2)}
            </span>{' '}
            with {quant.benchmark.symbol} (R² ={' '}
            <span className="font-mono text-zinc-200">
              {(quant.benchmark.rSquared * 100).toFixed(0)}%
            </span>
            ). Higher β means more amplified moves vs the benchmark; positive α
            means the portfolio outperforms what β alone would predict.
          </p>
        </>
      ) : (
        <p className="text-[11px] text-zinc-500">
          Benchmark unavailable — couldn't fetch BTC price history.
        </p>
      )}
    </div>
  );
}
