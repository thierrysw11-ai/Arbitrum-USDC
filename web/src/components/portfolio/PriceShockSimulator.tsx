"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Activity } from "lucide-react";

import {
  applyPriceShock,
  baseToUsd,
  formatHealthFactor,
  formatUsd,
  healthFactorBucket,
} from "@/lib/aave/math";
import type { PositionRow } from "@/lib/aave/types";

/**
 * Interactive "what if" tool — pick an asset, drag a price slider, see how
 * the user's health factor responds. The math runs in pure JS (no extra
 * RPC calls), so the UI is instant.
 *
 * Two modes: shock a single held asset, or shock everything non-stable
 * uniformly (the "market crash" scenario).
 */
export default function PriceShockSimulator({
  positions,
}: {
  positions: PositionRow[];
}) {
  // Build the asset menu: every reserve the user holds (collateral OR debt)
  // plus the synthetic ALL_NON_STABLE option.
  const heldSymbols = useMemo(() => {
    const seen = new Set<string>();
    for (const p of positions) {
      if (p.aTokenBalance > 0n || p.variableDebtBalance > 0n) {
        seen.add(p.symbol);
      }
    }
    return Array.from(seen);
  }, [positions]);

  const [target, setTarget] = useState<string>(
    heldSymbols.find((s) => !STABLE_HINTS.has(s.toUpperCase())) ??
      "ALL_NON_STABLE"
  );
  const [pct, setPct] = useState(-30);

  const result = useMemo(
    () =>
      applyPriceShock(positions, {
        assetSymbol: target,
        pctChange: pct,
      }),
    [positions, target, pct]
  );

  if (positions.length === 0) return null;

  const bucket = healthFactorBucket(result.shockedHealthFactor);
  const hfColor = {
    safe: "text-emerald-400",
    warn: "text-amber-400",
    danger: "text-orange-400",
    liquidated: "text-red-500",
  }[bucket];

  const ringColor = {
    safe: "ring-emerald-500/30",
    warn: "ring-amber-500/30",
    danger: "ring-orange-500/30",
    liquidated: "ring-red-500/40",
  }[bucket];

  return (
    <section
      className={`p-6 bg-[#0f172a]/60 rounded-xl border border-gray-800 ring-1 ${ringColor}`}
    >
      <header className="flex items-center gap-2 mb-4">
        <Activity className="w-4 h-4 text-blue-400" />
        <h2 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
          Price-Shock Simulator
        </h2>
        <span className="ml-auto text-[11px] text-gray-600">
          What happens to your health factor if a price moves
        </span>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
        {/* Asset selector */}
        <div>
          <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
            Asset
          </label>
          <select
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className="w-full mt-2 bg-gray-900 border border-gray-700 rounded-md px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-blue-500"
          >
            <option value="ALL_NON_STABLE">All non-stables (market-wide)</option>
            {heldSymbols.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-4 block">
            Price change: {pct > 0 ? "+" : ""}
            {pct}%
          </label>
          <input
            type="range"
            min={-90}
            max={50}
            step={1}
            value={pct}
            onChange={(e) => setPct(Number(e.target.value))}
            className="w-full mt-2 accent-blue-500"
          />
          <div className="flex justify-between text-[9px] text-gray-600 mt-1 font-mono">
            <span>-90%</span>
            <span>0%</span>
            <span>+50%</span>
          </div>
        </div>

        {/* Resulting HF */}
        <div className="text-center">
          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
            Resulting HF
          </p>
          <p className={`text-5xl font-black tracking-tight mt-2 ${hfColor}`}>
            {formatHealthFactor(result.shockedHealthFactor)}
          </p>
          {result.liquidatable && (
            <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 bg-red-500/10 ring-1 ring-red-500/40 rounded-full">
              <AlertTriangle className="w-3 h-3 text-red-400" />
              <span className="text-[10px] font-bold text-red-400 uppercase tracking-widest">
                Would be liquidated
              </span>
            </div>
          )}
        </div>

        {/* Resulting collateral / debt */}
        <div className="space-y-3">
          <Stat
            label="New Collateral"
            value={formatUsd(baseToUsd(result.shockedCollateralBase))}
          />
          <Stat
            label="New Debt"
            value={formatUsd(baseToUsd(result.shockedDebtBase))}
          />
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
        {label}
      </p>
      <p className="font-mono text-base text-white mt-1">{value}</p>
    </div>
  );
}

// Used only to pick a sensible default `target` symbol on first render.
const STABLE_HINTS = new Set([
  "USDC",
  "USDC.E",
  "USDCN",
  "USDT",
  "USDT.E",
  "DAI",
  "FRAX",
  "LUSD",
  "GHO",
  "MAI",
  "SUSD",
]);
