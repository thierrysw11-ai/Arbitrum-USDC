"use client";

import { ArrowUp, ArrowDown, Shield } from "lucide-react";

import {
  baseToUsd,
  formatApy,
  formatUsd,
  liquidationPriceForAsset,
  tokenToFloat,
} from "@/lib/aave/math";
import type { PositionRow } from "@/lib/aave/types";

/**
 * Per-asset breakdown of the connected user's Aave V3 position. Every row
 * represents one reserve where the user has either an aToken balance, a
 * variable debt balance, or both. The "Liquidation Price" column is the
 * single most useful number for a borrower — it tells them how far that
 * specific asset's price can drop before they get liquidated.
 */
export default function PositionsTable({
  positions,
  totalDebtBase,
}: {
  positions: PositionRow[];
  totalDebtBase: bigint;
}) {
  if (positions.length === 0) {
    return (
      <section className="p-8 bg-[#0f172a]/60 border border-gray-800 rounded-xl text-center">
        <p className="text-gray-500 text-sm">
          No active Aave V3 positions for this wallet on Arbitrum One.
        </p>
      </section>
    );
  }

  // Sort: collateral assets first (descending USD value), then debt-only.
  const rows = [...positions].sort((a, b) => {
    const aVal =
      Number((a.aTokenBalance * a.priceBase) / 10n ** BigInt(a.decimals)) /
      1e8;
    const bVal =
      Number((b.aTokenBalance * b.priceBase) / 10n ** BigInt(b.decimals)) /
      1e8;
    return bVal - aVal;
  });

  return (
    <section className="bg-[#0f172a]/60 border border-gray-800 rounded-xl overflow-hidden">
      <header className="p-4 border-b border-gray-800 flex items-center gap-2">
        <Shield className="w-4 h-4 text-gray-500" />
        <h2 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
          Positions
        </h2>
        <span className="ml-auto text-[10px] text-gray-600">
          {positions.length} {positions.length === 1 ? "asset" : "assets"}
        </span>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-[10px] text-gray-500 uppercase tracking-widest border-b border-gray-800">
            <tr>
              <th className="text-left p-3 font-bold">Asset</th>
              <th className="text-right p-3 font-bold">Supplied</th>
              <th className="text-right p-3 font-bold">Borrowed</th>
              <th className="text-right p-3 font-bold">Net (USD)</th>
              <th className="text-right p-3 font-bold">Supply APY</th>
              <th className="text-right p-3 font-bold">Borrow APY</th>
              <th className="text-right p-3 font-bold">Liq. Price</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const supplied = tokenToFloat(p.aTokenBalance, p.decimals);
              const borrowed = tokenToFloat(p.variableDebtBalance, p.decimals);
              const priceUsd = baseToUsd(p.priceBase);
              const netUsd = (supplied - borrowed) * priceUsd;
              const liqPriceBase = liquidationPriceForAsset(
                p,
                positions,
                totalDebtBase
              );
              const liqPriceUsd =
                liqPriceBase !== null ? baseToUsd(liqPriceBase) : null;

              const liqWarning =
                liqPriceUsd !== null &&
                priceUsd > 0 &&
                liqPriceUsd > priceUsd * 0.7;

              return (
                <tr
                  key={p.asset}
                  className="border-b border-gray-900 hover:bg-gray-900/40 transition-colors"
                >
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-white">
                        {p.symbol || "???"}
                      </span>
                      {p.usageAsCollateralEnabled &&
                        p.aTokenBalance > 0n && (
                          <span className="text-[9px] text-emerald-400 uppercase tracking-wider">
                            Collateral
                          </span>
                        )}
                    </div>
                  </td>

                  <td className="p-3 text-right font-mono text-xs">
                    {p.aTokenBalance > 0n ? (
                      <div className="flex flex-col items-end">
                        <span className="text-emerald-300 flex items-center gap-1 justify-end">
                          <ArrowUp className="w-3 h-3" />
                          {supplied.toLocaleString(undefined, {
                            maximumFractionDigits: 4,
                          })}
                        </span>
                        <span className="text-[10px] text-gray-600">
                          {formatUsd(supplied * priceUsd)}
                        </span>
                      </div>
                    ) : (
                      <span className="text-gray-700">—</span>
                    )}
                  </td>

                  <td className="p-3 text-right font-mono text-xs">
                    {p.variableDebtBalance > 0n ? (
                      <div className="flex flex-col items-end">
                        <span className="text-rose-300 flex items-center gap-1 justify-end">
                          <ArrowDown className="w-3 h-3" />
                          {borrowed.toLocaleString(undefined, {
                            maximumFractionDigits: 4,
                          })}
                        </span>
                        <span className="text-[10px] text-gray-600">
                          {formatUsd(borrowed * priceUsd)}
                        </span>
                      </div>
                    ) : (
                      <span className="text-gray-700">—</span>
                    )}
                  </td>

                  <td className="p-3 text-right font-mono text-xs text-white">
                    {formatUsd(netUsd)}
                  </td>

                  <td className="p-3 text-right font-mono text-xs">
                    {p.aTokenBalance > 0n ? (
                      <span className="text-emerald-300">
                        {formatApy(p.liquidityRate)}
                      </span>
                    ) : (
                      <span className="text-gray-700">—</span>
                    )}
                  </td>

                  <td className="p-3 text-right font-mono text-xs">
                    {p.variableDebtBalance > 0n ? (
                      <span className="text-rose-300">
                        {formatApy(p.variableBorrowRate)}
                      </span>
                    ) : (
                      <span className="text-gray-700">—</span>
                    )}
                  </td>

                  <td
                    className={`p-3 text-right font-mono text-xs ${
                      liqWarning ? "text-amber-400 font-bold" : "text-gray-300"
                    }`}
                    title={
                      liqPriceUsd !== null && priceUsd > 0
                        ? `Current ${p.symbol} price: ${formatUsd(priceUsd)} • room: ${(
                            ((priceUsd - liqPriceUsd) / priceUsd) *
                            100
                          ).toFixed(1)}%`
                        : undefined
                    }
                  >
                    {liqPriceUsd !== null
                      ? formatUsd(liqPriceUsd)
                      : <span className="text-gray-700">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
