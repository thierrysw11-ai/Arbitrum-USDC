'use client';

/**
 * Asset Correlation panel — pairwise Pearson correlation of daily log
 * returns over a 14-day lookback window.
 *
 * Why it matters in a TradFi-style report: a portfolio that *looks*
 * diversified can still be exposed to a single risk factor if its assets
 * move together. A correlation matrix surfaces hidden concentration.
 *
 * Data: re-uses the asset-momentum endpoint (already returns 14d daily
 * prices per asset). We don't burn a new round-trip — just transform
 * the price arrays into log returns and compute the matrix client-side.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Network, Loader2, AlertTriangle } from 'lucide-react';

import type { Portfolio } from '@/lib/aave/types';

interface AssetSpec {
  chainSlug: string;
  contractAddress: string;
  symbol: string;
}

interface MomentumPoint {
  symbol: string;
  chainSlug: string;
  contractAddress: string;
  priceHistory: Array<{ timestamp: number; price: number }>;
  error?: string;
}

interface MomentumResponse {
  results: MomentumPoint[];
  error?: string;
}

interface WalletErc20Token {
  contract: string;
  symbol: string;
  priceUsd: number | null;
  usdValue: number | null;
  isSpam: boolean;
}

interface NativeBalance {
  symbol: string;
  balanceFormatted: number;
  usdValue: number | null;
}

interface ChainHoldings {
  chainSlug: string;
  nativeBalance: NativeBalance;
  erc20: WalletErc20Token[];
}

interface WalletHoldingsResponse {
  chains: ChainHoldings[];
  error?: string;
}

const MAX_ASSETS = 10; // matrix gets unwieldy beyond this

// WETH addresses per chain — used so native ETH balances borrow vol from
// WETH price history (native ETH has no contract address, so asset-momentum
// can't query it directly; WETH tracks ETH 1:1).
const WETH_BY_CHAIN: Record<string, string> = {
  'ethereum-mainnet': '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
  'arbitrum-one': '0x82af49447d8a07e3bd95bd0d56f35241523fbab1',
  base: '0x4200000000000000000000000000000000000006',
  optimism: '0x4200000000000000000000000000000000000006',
  polygon: '0x7ceb23fd6bc0add59e62ac25578270cff1b9f619',
};

// BTC benchmark — WBTC on Arbitrum. Always added to the matrix unless
// the user already holds a BTC variant, so portfolios get at least one
// reference point for correlation. (BTC is the standard market benchmark
// in crypto, equivalent to S&P 500 in TradFi.)
const BTC_BENCHMARK: AssetSpec = {
  symbol: 'WBTC (benchmark)',
  chainSlug: 'arbitrum-one',
  contractAddress: '0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f',
};
const BTC_FAMILY_SYMBOLS = new Set(['BTC', 'WBTC', 'CBBTC', 'TBTC', 'WBTC.E']);

// =========================================================================
// Pearson correlation helpers
// =========================================================================

function pricesToLogReturns(
  prices: Array<{ timestamp: number; price: number }>
): number[] {
  if (prices.length < 2) return [];
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    const p0 = prices[i - 1].price;
    const p1 = prices[i].price;
    if (p0 > 0 && p1 > 0) {
      returns.push(Math.log(p1 / p0));
    }
  }
  return returns;
}

function pearson(a: number[], b: number[]): number | null {
  const n = Math.min(a.length, b.length);
  if (n < 2) return null;
  let sumA = 0;
  let sumB = 0;
  for (let i = 0; i < n; i++) {
    sumA += a[i];
    sumB += b[i];
  }
  const meanA = sumA / n;
  const meanB = sumB / n;
  let num = 0;
  let denomA = 0;
  let denomB = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    num += da * db;
    denomA += da * da;
    denomB += db * db;
  }
  const denom = Math.sqrt(denomA * denomB);
  if (denom === 0) return null;
  return num / denom;
}

// Color scale for the heatmap: -1 (red) → 0 (zinc) → +1 (blue).
function correlationColor(rho: number | null): string {
  if (rho === null || !Number.isFinite(rho)) return '#27272a';
  // Clamp to [-1, 1]
  const r = Math.max(-1, Math.min(1, rho));
  if (r >= 0) {
    // 0 → zinc, +1 → cyan/blue
    const intensity = Math.round(r * 200);
    return `rgb(${50 - r * 30}, ${100 + intensity * 0.3}, ${150 + intensity * 0.5})`;
  } else {
    // 0 → zinc, -1 → red
    const intensity = Math.round(-r * 200);
    return `rgb(${150 + intensity * 0.5}, ${60 + intensity * 0.1}, ${60 + intensity * 0.1})`;
  }
}

// =========================================================================
// Component
// =========================================================================

export function AssetCorrelationPanel({
  positions,
  walletAddress,
}: {
  positions: Portfolio['positions'];
  walletAddress?: `0x${string}`;
}) {
  const [data, setData] = useState<MomentumResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [discoveredAssets, setDiscoveredAssets] = useState<AssetSpec[]>([]);

  // Asset discovery — dedupes by SYMBOL (so multi-chain ETH = one row),
  // picks the largest USD entry per symbol as the price-history source,
  // includes native balances (routed through WETH for price history since
  // native ETH has no contract address), and always adds WBTC as a
  // benchmark unless the user already holds a BTC variant.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      // Symbol → best AssetSpec (by USD value). The "best" entry is the
      // one whose price history we'll fetch; for the same logical asset
      // any chain's price history is fine since they track each other.
      const bySymbol = new Map<
        string,
        AssetSpec & { usdValue: number }
      >();
      const consider = (spec: AssetSpec, usdValue: number) => {
        const sym = spec.symbol.toUpperCase();
        const existing = bySymbol.get(sym);
        if (!existing || usdValue > existing.usdValue) {
          bySymbol.set(sym, { ...spec, usdValue });
        }
      };

      // 1. Aave positions (Arbitrum) — represent active risk, ALWAYS
      // include even if the wallet section also has them.
      for (const p of positions) {
        if (p.aTokenBalance > 0n || p.variableDebtBalance > 0n) {
          consider(
            {
              symbol: p.symbol,
              chainSlug: 'arbitrum-one',
              contractAddress: p.asset,
            },
            // Unknown USD here — composition uses absolute, but for
            // ranking we treat Aave positions as priority by giving them
            // a small floor so they survive over zero-value entries.
            1
          );
        }
      }

      // 2. Wallet holdings — natives + ERC-20s.
      if (walletAddress) {
        try {
          const res = await fetch('/api/wallet-holdings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address: walletAddress }),
          });
          const json = (await res.json()) as WalletHoldingsResponse;
          if (res.ok && !json.error) {
            for (const chain of json.chains) {
              const native = chain.nativeBalance;
              if (
                native?.usdValue &&
                native.usdValue > 0 &&
                native.balanceFormatted > 0
              ) {
                // Native ETH has no contract — point it at WETH on the
                // same chain so asset-momentum can fetch price history.
                const wethAddr = WETH_BY_CHAIN[chain.chainSlug];
                if (wethAddr) {
                  consider(
                    {
                      symbol: native.symbol,
                      chainSlug: chain.chainSlug,
                      contractAddress: wethAddr,
                    },
                    native.usdValue
                  );
                }
              }
              for (const t of chain.erc20) {
                if (t.isSpam) continue;
                if (t.priceUsd === null) continue;
                if ((t.usdValue ?? 0) < 1) continue;
                consider(
                  {
                    chainSlug: chain.chainSlug,
                    contractAddress: t.contract,
                    symbol: t.symbol,
                  },
                  t.usdValue ?? 0
                );
              }
            }
          }
        } catch {
          // soft-fail — proceed with whatever we collected so far
        }
      }

      // 3. Always include BTC as benchmark, unless already held.
      const heldBtc = [...bySymbol.keys()].some((sym) =>
        BTC_FAMILY_SYMBOLS.has(sym)
      );
      if (!heldBtc) {
        bySymbol.set('WBTC_BENCHMARK', { ...BTC_BENCHMARK, usdValue: 0 });
      }

      // 4. Sort by USD value descending (so largest holdings dominate
      // the top of the matrix), cap at MAX_ASSETS.
      const sorted = [...bySymbol.values()].sort(
        (a, b) => b.usdValue - a.usdValue
      );
      const merged: AssetSpec[] = sorted.slice(0, MAX_ASSETS).map((entry) => ({
        symbol: entry.symbol,
        chainSlug: entry.chainSlug,
        contractAddress: entry.contractAddress,
      }));

      if (cancelled) return;
      setDiscoveredAssets(merged);
    })();

    return () => {
      cancelled = true;
    };
  }, [positions, walletAddress]);

  // Fetch momentum (which contains priceHistory we need)
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

  const matrix = useMemo(() => {
    if (!data) return null;
    // Filter to assets that have enough price history to compute returns.
    const usable = data.results.filter(
      (p) => p.priceHistory.length >= 3 && !p.error
    );
    if (usable.length < 2) return null;
    // Pre-compute log returns once per asset.
    const returnsBySym = new Map<string, number[]>();
    for (const p of usable) {
      returnsBySym.set(`${p.symbol}::${p.contractAddress}`, pricesToLogReturns(p.priceHistory));
    }
    // Build the symmetric matrix.
    const rows = usable.map((p) => ({
      key: `${p.symbol}::${p.contractAddress}`,
      symbol: p.symbol,
    }));
    const cells: Array<Array<number | null>> = rows.map((r) =>
      rows.map((c) => {
        if (r.key === c.key) return 1.0;
        const a = returnsBySym.get(r.key) ?? [];
        const b = returnsBySym.get(c.key) ?? [];
        return pearson(a, b);
      })
    );
    return { rows, cells };
  }, [data]);

  // Average of off-diagonal correlations — a single number summary.
  const averageOffDiagonal = useMemo(() => {
    if (!matrix) return null;
    let sum = 0;
    let n = 0;
    for (let i = 0; i < matrix.rows.length; i++) {
      for (let j = i + 1; j < matrix.rows.length; j++) {
        const v = matrix.cells[i][j];
        if (v !== null && Number.isFinite(v)) {
          sum += v;
          n++;
        }
      }
    }
    return n > 0 ? sum / n : null;
  }, [matrix]);

  return (
    <div className="bg-zinc-900/50 border border-white/5 rounded-2xl p-5 mb-5">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <div className="flex items-center gap-2">
          <Network size={14} className="text-zinc-500" />
          <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">
            Asset Correlation — 14d Daily Log Returns
          </p>
        </div>
        {averageOffDiagonal !== null && (
          <p className="text-[11px] text-zinc-400">
            Avg pairwise:{' '}
            <span
              className="font-mono font-bold"
              style={{ color: correlationColor(averageOffDiagonal) }}
            >
              {averageOffDiagonal.toFixed(2)}
            </span>
          </p>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-10 text-zinc-500">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          Computing correlation matrix…
        </div>
      ) : error ? (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-[12px] text-amber-300 flex items-start gap-2">
          <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      ) : !matrix ? (
        <p className="text-zinc-500 text-sm py-8 text-center">
          Not enough priced assets with overlapping price history to compute
          correlations. Need at least 2 assets each with 3+ days of data.
        </p>
      ) : (
        <CorrelationMatrix matrix={matrix} averageOffDiagonal={averageOffDiagonal} />
      )}
    </div>
  );
}

// =========================================================================
// Heatmap
// =========================================================================

function CorrelationMatrix({
  matrix,
  averageOffDiagonal,
}: {
  matrix: {
    rows: Array<{ key: string; symbol: string }>;
    cells: Array<Array<number | null>>;
  };
  averageOffDiagonal: number | null;
}) {
  const n = matrix.rows.length;
  // Cell size scales down for larger matrices to fit
  const cellSize = n <= 5 ? 56 : n <= 7 ? 48 : 40;

  return (
    <>
      <div className="overflow-x-auto">
        <table className="border-collapse">
          <thead>
            <tr>
              <th className="p-1"></th>
              {matrix.rows.map((r) => (
                <th
                  key={r.key}
                  className="text-[10px] font-mono font-bold text-zinc-400 px-1 pb-1"
                  style={{ width: cellSize }}
                  title={r.symbol}
                >
                  {r.symbol.length > 6 ? r.symbol.slice(0, 5) + '…' : r.symbol}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.rows.map((rowAsset, i) => (
              <tr key={rowAsset.key}>
                <th
                  className="text-[10px] font-mono font-bold text-zinc-400 pr-2 text-right"
                  style={{ width: 80 }}
                  title={rowAsset.symbol}
                >
                  {rowAsset.symbol.length > 6
                    ? rowAsset.symbol.slice(0, 5) + '…'
                    : rowAsset.symbol}
                </th>
                {matrix.cells[i].map((rho, j) => (
                  <td
                    key={`${i}-${j}`}
                    className="border border-zinc-800 text-center"
                    style={{
                      width: cellSize,
                      height: cellSize,
                      backgroundColor: correlationColor(rho),
                    }}
                    title={`${rowAsset.symbol} ↔ ${matrix.rows[j].symbol}: ${rho === null ? 'n/a' : rho.toFixed(3)}`}
                  >
                    <span
                      className="text-[10px] font-mono font-bold"
                      style={{
                        color:
                          rho !== null && Math.abs(rho) > 0.3
                            ? '#ffffff'
                            : '#a1a1aa',
                      }}
                    >
                      {rho === null
                        ? '—'
                        : i === j
                          ? '1'
                          : rho.toFixed(2)}
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Color-scale legend */}
      <div className="flex items-center gap-3 mt-4 text-[10px] text-zinc-500">
        <span>−1 (anti-correlated)</span>
        <div className="flex-1 h-2 rounded overflow-hidden flex">
          {Array.from({ length: 21 }, (_, i) => {
            const v = -1 + (i / 20) * 2;
            return (
              <div
                key={i}
                className="flex-1"
                style={{ backgroundColor: correlationColor(v) }}
              />
            );
          })}
        </div>
        <span>0 (uncorrelated)</span>
        <div className="flex-1" />
        <span>+1 (perfectly correlated)</span>
      </div>

      {/* Plain-English interpretation */}
      {averageOffDiagonal !== null && (
        <div className="mt-4 text-[12px] text-zinc-300 leading-relaxed border-t border-white/5 pt-3">
          {averageOffDiagonal > 0.7 ? (
            <>
              <strong className="text-red-300">
                Highly correlated portfolio.
              </strong>{' '}
              Average pairwise ρ = {averageOffDiagonal.toFixed(2)}. Your assets
              move largely together — the diversification you appear to have on
              paper isn&apos;t real risk diversification. A market-wide drawdown
              would hit most positions in lockstep.
            </>
          ) : averageOffDiagonal > 0.4 ? (
            <>
              <strong className="text-amber-300">
                Moderately correlated.
              </strong>{' '}
              Average pairwise ρ = {averageOffDiagonal.toFixed(2)}. Your
              portfolio has some genuine diversification but tilts toward
              co-movement during market stress. Adding lower-correlation assets
              (cross-sector, stables) would improve risk decomposition.
            </>
          ) : averageOffDiagonal > 0.1 ? (
            <>
              <strong className="text-emerald-300">
                Reasonably diversified.
              </strong>{' '}
              Average pairwise ρ = {averageOffDiagonal.toFixed(2)}. Your assets
              show meaningful independent variation — drawdowns in one are not
              automatically drawdowns in others.
            </>
          ) : (
            <>
              <strong className="text-emerald-300">
                Strongly diversified.
              </strong>{' '}
              Average pairwise ρ = {averageOffDiagonal.toFixed(2)}. Asset moves
              are nearly independent or even inversely related — this is the
              configuration that minimizes portfolio variance.
            </>
          )}
        </div>
      )}
    </>
  );
}
