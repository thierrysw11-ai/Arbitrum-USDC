'use client';

/**
 * Visual companion to the Sentinel Elite Analysis modal.
 *
 * Three visuals, ordered by "what does the user need to know in the first
 * 5 seconds":
 *   1. Mini HF gauge   — current health factor on a 1.0–3.0 arc
 *   2. Key stats grid  — collateral, debt, liq threshold
 *   3. Shock waterfall — HF at Now / -10% / -30% / -50% market drops,
 *                        with a dashed line at the 1.00 liquidation threshold
 *   4. Collateral bar  — horizontal stacked bar showing per-asset composition
 *
 * All client-side. Uses `applyPriceShock` from `lib/aave/math.ts` so the
 * shock simulation matches what the agent's `simulate_price_shock` tool
 * computes — no parallel implementation drift.
 */

import React, { useEffect, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ReferenceLine,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { Wallet as WalletIcon, AlertTriangle } from 'lucide-react';

import {
  applyPriceShock,
  baseToUsd,
  tokenToFloat,
  wadToFloat,
} from '@/lib/aave/math';
import type { Portfolio } from '@/lib/aave/types';

interface Props {
  portfolio: Portfolio & {
    address?: `0x${string}`;
    chainName?: string;
    chainSlug?: string;
    isUnsupportedChain?: boolean;
  };
  // Address used for the wallet-holdings scan. May differ from
  // the portfolio's resolved address in spectator mode.
  walletAddress?: `0x${string}`;
  // The chain slug to scan for wallet holdings — usually whichever chain
  // usePortfolio resolved to.
  walletChainSlug?: string;
  loading?: boolean;
}

// Wire shape returned by /api/wallet-holdings (multi-chain)
interface ChainHoldings {
  chainSlug: string;
  chainName: string;
  chainId: number;
  nativeBalance: {
    symbol: string;
    balance: string;
    balanceFormatted: number;
    priceUsd: number | null;
    usdValue: number | null;
  };
  erc20Count: number;
  erc20Truncated: boolean;
  erc20: Array<{
    contract: string;
    symbol: string;
    name: string | null;
    decimals: number;
    balance: string;
    balanceFormatted: number;
    priceUsd: number | null;
    usdValue: number | null;
    isSpam: boolean;
  }>;
  legitimateUsd: number;
  spamUsd: number;
  totalUsd: number;
  error?: string;
}

interface WalletHoldingsResponse {
  address: string;
  chains: ChainHoldings[];
  legitimateUsd: number;
  spamUsd: number;
  totalUsd: number;
  error?: string;
}

// Chain-badge color map for the unified table
const CHAIN_BADGE_COLORS: Record<string, string> = {
  'ethereum-mainnet': '#627eea',
  'arbitrum-one': '#28a0f0',
  base: '#0052ff',
  optimism: '#ff0420',
  polygon: '#8247e5',
};

const CHAIN_SHORT_LABELS: Record<string, string> = {
  'ethereum-mainnet': 'ETH',
  'arbitrum-one': 'ARB',
  base: 'BASE',
  optimism: 'OP',
  polygon: 'POLY',
};

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

const ASSET_PALETTE = [
  '#3b82f6', // blue
  '#22c55e', // green
  '#a855f7', // purple
  '#f59e0b', // amber
  '#06b6d4', // cyan
  '#ec4899', // pink
  '#84cc16', // lime
  '#f97316', // orange
];

// =========================================================================
// Top-level
// =========================================================================

export function SentinelAnalysisVisuals({
  portfolio,
  walletAddress,
  walletChainSlug,
  loading,
}: Props) {
  const { account, positions, isUnsupportedChain, chainName } = portfolio;

  if (loading) {
    return <Skeleton />;
  }

  if (isUnsupportedChain) {
    return (
      <EmptyState message="Switch to a supported chain (Arbitrum / Base / Optimism / Polygon) to see visual analysis." />
    );
  }

  const totalCollateralBase = account.totalCollateralBase;
  const totalDebtBase = account.totalDebtBase;
  const hasPosition = totalCollateralBase > 0n || totalDebtBase > 0n;

  // Even without an Aave position we want to show wallet holdings — that's
  // exactly the scenario where "what do I actually hold?" matters most.
  const scanAddress = walletAddress ?? portfolio.address;
  const scanSlug =
    walletChainSlug ?? portfolio.chainSlug ?? 'arbitrum-one';

  if (!hasPosition) {
    return (
      <div className="space-y-4">
        <EmptyState
          message={`No active Aave V3 position on ${chainName ?? 'this chain'}. Showing wallet holdings only.`}
        />
        {scanAddress && (
          <WalletHoldingsPanel
            address={scanAddress}
            chainSlug={scanSlug}
            chainName={chainName ?? 'this chain'}
          />
        )}
      </div>
    );
  }

  const currentHF = wadToFloat(account.healthFactor);
  const hasDebt = totalDebtBase > 0n;

  // ─── Shock scenarios ────────────────────────────────────────────────
  // Without debt the HF is effectively infinite; shocks are meaningless.
  const scenarios = hasDebt
    ? [
        { label: 'Now', hf: currentHF, pct: 0 },
        ...[-10, -30, -50].map((pct) => {
          const shocked = applyPriceShock(positions, {
            assetSymbol: 'ALL_NON_STABLE',
            pctChange: pct,
          });
          return {
            label: `${pct}%`,
            hf: wadToFloat(shocked.shockedHealthFactor),
            pct,
          };
        }),
      ]
    : [];

  // ─── Collateral breakdown ───────────────────────────────────────────
  const totalCollateralUsd = baseToUsd(totalCollateralBase);
  const collateralAssets = positions
    .filter((p) => p.aTokenBalance > 0n && p.usageAsCollateralEnabled)
    .map((p) => {
      const supplied = tokenToFloat(p.aTokenBalance, p.decimals);
      const priceUsd = Number(p.priceBase) / 1e8;
      const usd = supplied * priceUsd;
      return {
        symbol: p.symbol,
        usd,
        pct: totalCollateralUsd > 0 ? (usd / totalCollateralUsd) * 100 : 0,
      };
    })
    .filter((a) => a.usd > 0)
    .sort((a, b) => b.usd - a.usd);

  return (
    <div className="space-y-4">
      {/* Top row: HF gauge + key stats */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="md:col-span-2">
          <MiniHfGauge hf={currentHF} hasDebt={hasDebt} />
        </div>
        <div className="md:col-span-3">
          <KeyStats account={account} />
        </div>
      </div>

      {/* Shock waterfall — only when there's debt to stress-test */}
      {scenarios.length > 0 && <ShockWaterfall scenarios={scenarios} />}

      {/* Collateral composition */}
      {collateralAssets.length > 0 && (
        <CollateralBar assets={collateralAssets} />
      )}

      {/* Wallet holdings (everything outside Aave) */}
      {scanAddress && (
        <WalletHoldingsPanel
          address={scanAddress}
          chainSlug={scanSlug}
          chainName={chainName ?? 'this chain'}
        />
      )}
    </div>
  );
}

// =========================================================================
// Wallet holdings panel — fetches /api/wallet-holdings, renders ranked list
// with a horizontal stacked bar of USD value composition.
// =========================================================================

function WalletHoldingsPanel({
  address,
}: {
  address: string;
  // chainSlug + chainName kept on the call site for layout purposes; the
  // multi-chain scan ignores them and pulls all 5.
  chainSlug?: string;
  chainName?: string;
}) {
  const [data, setData] = useState<WalletHoldingsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // Spam-toggle state — must live up here, alongside the other useStates,
  // so it's called unconditionally on every render. React's rules-of-hooks
  // forbid hook calls after early `return null` paths below.
  const [showSpam, setShowSpam] = useState(false);

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
          // Empty `chains` means "scan all 5" (Ethereum + the 4 Aave chains).
          body: JSON.stringify({ address }),
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
  }, [address]);

  if (isLoading) {
    return (
      <div className="bg-zinc-900/50 border border-white/5 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <WalletIcon size={14} className="text-zinc-500" />
          <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">
            Wallet Holdings — Multi-Chain Scan
          </p>
        </div>
        <div className="h-[120px] animate-pulse bg-zinc-800/40 rounded-xl" />
        <p className="text-[10px] text-zinc-500 mt-2">
          Scanning Ethereum, Arbitrum, Base, Optimism, Polygon in parallel…
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-zinc-900/50 border border-white/5 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <WalletIcon size={14} className="text-zinc-500" />
          <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">
            Wallet Holdings — Multi-Chain Scan
          </p>
        </div>
        <div className="flex items-start gap-2 text-[12px] text-amber-400 bg-amber-500/5 border border-amber-500/20 rounded-lg p-3">
          <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Couldn&apos;t fetch wallet holdings.</p>
            <p className="text-amber-400/70 text-[11px] mt-0.5">{error}</p>
            <p className="text-zinc-500 text-[11px] mt-1">
              Check that <code className="font-mono">ALCHEMY_API_KEY</code> is
              set in <code className="font-mono">.env.local</code>.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  // Flatten all chains into a single rows list, tagged with chain.
  type Row = {
    key: string;
    chainSlug: string;
    chainName: string;
    symbol: string;
    name: string | null;
    balanceFormatted: number;
    priceUsd: number | null;
    usdValue: number | null;
    isNative: boolean;
    isSpam: boolean;
  };
  const rows: Row[] = [];
  for (const c of data.chains) {
    if (c.nativeBalance.balanceFormatted > 0) {
      rows.push({
        key: `${c.chainSlug}:native`,
        chainSlug: c.chainSlug,
        chainName: c.chainName,
        symbol: c.nativeBalance.symbol,
        name: 'Native',
        balanceFormatted: c.nativeBalance.balanceFormatted,
        priceUsd: c.nativeBalance.priceUsd,
        usdValue: c.nativeBalance.usdValue,
        isNative: true,
        isSpam: false,
      });
    }
    for (const e of c.erc20) {
      rows.push({
        key: `${c.chainSlug}:${e.contract}`,
        chainSlug: c.chainSlug,
        chainName: c.chainName,
        symbol: e.symbol,
        name: e.name,
        balanceFormatted: e.balanceFormatted,
        priceUsd: e.priceUsd,
        usdValue: e.usdValue,
        isNative: false,
        isSpam: e.isSpam,
      });
    }
  }
  // Sort: legit first by USD desc, then spam by stated USD desc.
  rows.sort((a, b) => {
    if (a.isSpam !== b.isSpam) return a.isSpam ? 1 : -1;
    return (b.usdValue ?? 0) - (a.usdValue ?? 0);
  });

  const legitRows = rows.filter((r) => !r.isSpam);
  const spamRows = rows.filter((r) => r.isSpam);
  const visibleRows = showSpam ? rows : legitRows;

  // Per-chain sub-totals for the chain stack-bar — use legitimate value
  // only so spam doesn't dominate the visualization.
  type ChainTotal = { slug: string; name: string; usd: number; pct: number };
  const chainTotals: ChainTotal[] = data.chains
    .map((c) => ({
      slug: c.chainSlug,
      name: c.chainName,
      usd: c.legitimateUsd,
      pct:
        data.legitimateUsd > 0
          ? (c.legitimateUsd / data.legitimateUsd) * 100
          : 0,
    }))
    .filter((c) => c.usd > 0)
    .sort((a, b) => b.usd - a.usd);

  const unpricedCount = legitRows.filter(
    (r) => r.usdValue === null || r.usdValue === 0
  ).length;
  const anyChainTruncated = data.chains.some((c) => c.erc20Truncated);
  const anyChainErrored = data.chains.some((c) => c.error);

  return (
    <div className="bg-zinc-900/50 border border-white/5 rounded-2xl p-5">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <div className="flex items-center gap-2">
          <WalletIcon size={14} className="text-zinc-500" />
          <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">
            Wallet Holdings — Multi-Chain Scan
          </p>
        </div>
        <div className="text-right">
          <p className="text-base font-mono font-bold text-zinc-100">
            {fmtUsd(data.legitimateUsd)}{' '}
            <span className="text-[10px] text-zinc-500 font-normal">
              real
            </span>
          </p>
          {data.spamUsd > 0 && (
            <p className="text-[11px] font-mono text-zinc-500 mt-0.5">
              + {fmtUsd(data.spamUsd)} flagged as likely spam
            </p>
          )}
        </div>
      </div>

      {/* Per-chain stack bar — legitimate value only */}
      {chainTotals.length > 0 ? (
        <div className="mb-4">
          <div className="flex h-8 rounded-lg overflow-hidden border border-white/5 mb-2">
            {chainTotals.map((c) => (
              <div
                key={c.slug}
                className="flex items-center justify-center text-[11px] font-bold text-white/95 transition-all hover:brightness-110"
                style={{
                  width: `${c.pct}%`,
                  backgroundColor:
                    CHAIN_BADGE_COLORS[c.slug] ?? '#52525b',
                }}
                title={`${c.name}: ${fmtUsd(c.usd)} (${c.pct.toFixed(1)}%)`}
              >
                {c.pct >= 10 && (CHAIN_SHORT_LABELS[c.slug] ?? c.slug)}
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[11px]">
            {chainTotals.map((c) => (
              <div key={c.slug} className="flex items-center gap-1.5">
                <div
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{
                    backgroundColor:
                      CHAIN_BADGE_COLORS[c.slug] ?? '#52525b',
                  }}
                />
                <span className="font-mono text-zinc-300 font-semibold">
                  {c.name}
                </span>
                <span className="font-mono text-zinc-400">{fmtUsd(c.usd)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-zinc-500 text-xs italic mb-3">
          No priceable legitimate tokens detected.
        </p>
      )}

      {/* Toggle: show / hide spam */}
      {spamRows.length > 0 && (
        <div className="flex items-center gap-2 mb-2 px-3 py-2 bg-amber-500/5 border border-amber-500/20 rounded-lg text-[11px] text-amber-300">
          <AlertTriangle size={12} className="flex-shrink-0" />
          <span>
            <span className="font-bold">
              {spamRows.length} likely-spam token
              {spamRows.length === 1 ? '' : 's'}
            </span>{' '}
            detected (Minereum-style airdrops with fabricated DEX prices) —
            stated USD ≈ {fmtUsd(data.spamUsd)} not realistically realizable.
          </span>
          <button
            onClick={() => setShowSpam((v) => !v)}
            className="ml-auto text-amber-300 hover:text-amber-200 font-bold whitespace-nowrap"
          >
            {showSpam ? 'Hide spam' : 'Show spam'}
          </button>
        </div>
      )}

      {/* Unified table */}
      <div className="overflow-hidden rounded-lg border border-white/5">
        <div className="grid grid-cols-[auto_1fr_auto_auto] gap-3 px-3 py-2 bg-zinc-900/80 text-[9px] uppercase tracking-widest text-zinc-500 font-bold">
          <span>Chain</span>
          <span>Token</span>
          <span className="text-right">Balance</span>
          <span className="text-right">USD Value</span>
        </div>
        <div className="max-h-[280px] overflow-y-auto">
          {visibleRows.slice(0, 40).map((r) => (
            <div
              key={r.key}
              className={`grid grid-cols-[auto_1fr_auto_auto] gap-3 px-3 py-2 text-[12px] border-t border-white/5 hover:bg-white/[0.02] ${
                r.isSpam ? 'opacity-50' : ''
              }`}
            >
              <div
                className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded self-center whitespace-nowrap"
                style={{
                  backgroundColor: `${CHAIN_BADGE_COLORS[r.chainSlug] ?? '#52525b'}33`,
                  color: CHAIN_BADGE_COLORS[r.chainSlug] ?? '#a1a1aa',
                }}
                title={r.chainName}
              >
                {CHAIN_SHORT_LABELS[r.chainSlug] ?? r.chainSlug}
              </div>
              <div className="min-w-0 flex items-center gap-2">
                <span
                  className={`font-mono font-bold truncate ${
                    r.isSpam ? 'text-zinc-500 line-through' : 'text-zinc-200'
                  }`}
                >
                  {r.symbol}
                </span>
                {r.isNative && (
                  <span className="text-[9px] uppercase tracking-widest text-emerald-400 font-bold">
                    native
                  </span>
                )}
                {r.isSpam && (
                  <span className="text-[9px] uppercase tracking-widest text-amber-400 font-bold border border-amber-400/30 px-1 rounded">
                    spam
                  </span>
                )}
                {r.name && !r.isNative && (
                  <span className="text-zinc-500 text-[11px] truncate">
                    {r.name}
                  </span>
                )}
              </div>
              <div className="text-right font-mono text-zinc-300 whitespace-nowrap self-center">
                {fmtTokenAmount(r.balanceFormatted)}
              </div>
              <div
                className={`text-right font-mono whitespace-nowrap self-center ${
                  r.isSpam ? 'text-zinc-600 line-through' : 'text-zinc-100'
                }`}
              >
                {r.usdValue !== null ? fmtUsd(r.usdValue) : '—'}
              </div>
            </div>
          ))}
        </div>
      </div>

      {(visibleRows.length > 40 ||
        unpricedCount > 0 ||
        anyChainTruncated ||
        anyChainErrored) && (
        <p className="text-[10px] text-zinc-500 mt-2">
          {visibleRows.length > 40 &&
            `Showing top 40 of ${visibleRows.length} tokens. `}
          {unpricedCount > 0 &&
            `${unpricedCount} legit token${unpricedCount === 1 ? '' : 's'} without a USD price. `}
          {anyChainTruncated && `Some chains capped at top 75 by token count. `}
          {anyChainErrored && `One or more chains failed to scan. `}
        </p>
      )}
    </div>
  );
}

// =========================================================================
// Mini HF gauge — same arc math as the dashboard's RiskGauge
// =========================================================================

function MiniHfGauge({ hf, hasDebt }: { hf: number; hasDebt: boolean }) {
  const displayHf = !hasDebt || hf > 100 ? '100+' : hf.toFixed(2);
  const status = !hasDebt
    ? { label: 'NO DEBT', color: HF_COLORS.safe }
    : hf < 1.2
      ? { label: 'CRITICAL', color: HF_COLORS.risky }
      : hf < 1.5
        ? { label: 'CAUTION', color: HF_COLORS.caution }
        : { label: 'SAFE', color: HF_COLORS.safe };

  // Map HF [1, 3] to arc [0, 100]%
  const normalized = !hasDebt ? 3 : Math.min(Math.max(hf, 1), 3);
  const percentage = ((normalized - 1) / 2) * 100;

  return (
    <div className="bg-zinc-900/50 border border-white/5 rounded-2xl p-5 flex flex-col items-center justify-center min-h-[160px]">
      <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-3">
        Health Factor
      </p>
      <div className="relative w-40 h-20">
        <svg viewBox="0 0 100 50" className="w-full h-full">
          <path
            d="M 10 50 A 40 40 0 0 1 90 50"
            fill="none"
            stroke="#27272a"
            strokeWidth="8"
            strokeLinecap="round"
          />
          <path
            d="M 10 50 A 40 40 0 0 1 90 50"
            fill="none"
            stroke={status.color}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray="126"
            strokeDashoffset={126 - (126 * percentage) / 100}
            className="transition-all duration-700"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-end">
          <span className="text-3xl font-black text-white leading-none">
            {displayHf}
          </span>
        </div>
      </div>
      <div
        className="text-[10px] font-bold tracking-widest mt-3"
        style={{ color: status.color }}
      >
        {status.label}
      </div>
    </div>
  );
}

// =========================================================================
// Key stats grid
// =========================================================================

function KeyStats({ account }: { account: Portfolio['account'] }) {
  const collateral = baseToUsd(account.totalCollateralBase);
  const debt = baseToUsd(account.totalDebtBase);
  // currentLiquidationThreshold is in basis points × 100, e.g. 7800 = 78.00%
  const liqThreshold = Number(account.currentLiquidationThreshold) / 100;
  const ltv = Number(account.ltv) / 100;

  return (
    <div className="bg-zinc-900/50 border border-white/5 rounded-2xl p-5 grid grid-cols-2 gap-x-4 gap-y-3 min-h-[160px]">
      <Stat label="Total Collateral" value={fmtUsd(collateral)} accent="text-emerald-300" />
      <Stat label="Total Debt" value={fmtUsd(debt)} accent="text-red-300" />
      <Stat label="Liquidation Threshold" value={`${liqThreshold.toFixed(2)}%`} />
      <Stat label="Max LTV" value={`${ltv.toFixed(2)}%`} />
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div>
      <p className="text-[9px] uppercase tracking-widest text-zinc-500 font-bold mb-1">
        {label}
      </p>
      <p
        className={`text-xl font-mono font-bold leading-tight ${
          accent ?? 'text-zinc-100'
        }`}
      >
        {value}
      </p>
    </div>
  );
}

// =========================================================================
// Shock waterfall — Now / -10% / -30% / -50% market drops
// =========================================================================

interface Scenario {
  label: string;
  hf: number;
  pct: number;
}

function ShockWaterfall({ scenarios }: { scenarios: Scenario[] }) {
  // Cap displayed HF at 5 so an enormous "Now" value doesn't squash the
  // shocked scenarios into invisibility. Tooltip still shows the real value.
  const DISPLAY_CAP = 5;
  const data = scenarios.map((s) => ({
    name: s.label,
    displayHf: Math.min(s.hf, DISPLAY_CAP),
    actualHf: s.hf,
  }));

  return (
    <div className="bg-zinc-900/50 border border-white/5 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">
          Shock Scenarios — Market-Wide Non-Stable Drop
        </p>
        <p className="text-[10px] text-red-400 font-bold">
          Liquidation: HF &lt; 1.00
        </p>
      </div>
      <div className="h-[180px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ left: 10, right: 30, top: 5, bottom: 5 }}
          >
            <XAxis type="number" domain={[0, DISPLAY_CAP]} hide />
            <YAxis
              type="category"
              dataKey="name"
              width={50}
              tick={{ fontSize: 11, fill: '#9ca3af' }}
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
              formatter={(_value: number, _name: string, item) => {
                const real = (item.payload as { actualHf: number }).actualHf;
                const txt =
                  real > DISPLAY_CAP
                    ? `${real.toFixed(2)} (off chart)`
                    : real.toFixed(2);
                return [txt, 'Health Factor'];
              }}
            />
            <ReferenceLine
              x={1.0}
              stroke="#ef4444"
              strokeDasharray="3 3"
              label={{
                value: 'LIQ',
                position: 'top',
                fill: '#ef4444',
                fontSize: 10,
                fontWeight: 'bold',
              }}
            />
            <Bar dataKey="displayHf" radius={[0, 6, 6, 0]}>
              {data.map((d, i) => (
                <Cell key={i} fill={hfColor(d.actualHf)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// =========================================================================
// Collateral composition — horizontal stacked bar
// =========================================================================

function CollateralBar({
  assets,
}: {
  assets: Array<{ symbol: string; usd: number; pct: number }>;
}) {
  return (
    <div className="bg-zinc-900/50 border border-white/5 rounded-2xl p-5">
      <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-3">
        Collateral Composition
      </p>
      <div className="flex h-9 rounded-lg overflow-hidden border border-white/5 mb-3">
        {assets.map((a, i) => (
          <div
            key={a.symbol}
            className="flex items-center justify-center text-[11px] font-bold text-white/90 transition-all hover:brightness-110"
            style={{
              width: `${a.pct}%`,
              backgroundColor: ASSET_PALETTE[i % ASSET_PALETTE.length],
            }}
            title={`${a.symbol}: ${fmtUsd(a.usd)} (${a.pct.toFixed(1)}%)`}
          >
            {a.pct >= 12 && a.symbol}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[11px]">
        {assets.map((a, i) => (
          <div key={a.symbol} className="flex items-center gap-1.5">
            <div
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{
                backgroundColor: ASSET_PALETTE[i % ASSET_PALETTE.length],
              }}
            />
            <span className="font-mono text-zinc-300">{a.symbol}</span>
            <span className="font-mono text-zinc-500">{fmtUsd(a.usd)}</span>
            <span className="font-mono text-zinc-600">
              ({a.pct.toFixed(1)}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// =========================================================================
// Helpers
// =========================================================================

function fmtUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(2)}K`;
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function fmtTokenAmount(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)}K`;
  // For small values, show enough precision to be meaningful (BTC-like assets)
  if (n < 0.0001) return n.toExponential(2);
  if (n < 1) return n.toFixed(4);
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="bg-zinc-900/50 border border-white/5 rounded-2xl p-8 text-center">
      <p className="text-zinc-500 text-sm">{message}</p>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="md:col-span-2 bg-zinc-900/50 border border-white/5 rounded-2xl h-[160px] animate-pulse" />
        <div className="md:col-span-3 bg-zinc-900/50 border border-white/5 rounded-2xl h-[160px] animate-pulse" />
      </div>
      <div className="bg-zinc-900/50 border border-white/5 rounded-2xl h-[200px] animate-pulse" />
      <div className="bg-zinc-900/50 border border-white/5 rounded-2xl h-[120px] animate-pulse" />
    </div>
  );
}
