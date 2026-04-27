"use client";

import {
  baseToUsd,
  formatHealthFactor,
  formatUsd,
  healthFactorBucket,
  ltToFraction,
} from "@/lib/aave/math";
import type { UserAccountData } from "@/lib/aave/types";

/**
 * Top card on the /portfolio page. Shows the Aave-protocol-computed
 * aggregate snapshot: health factor (color-coded), total collateral, total
 * debt, available borrow capacity, and weighted liquidation threshold.
 */
export default function PortfolioOverview({
  account,
}: {
  account: UserAccountData;
}) {
  const hfBucket = healthFactorBucket(account.healthFactor);
  const colorClass = {
    safe: "text-emerald-400",
    warn: "text-amber-400",
    danger: "text-orange-400",
    liquidated: "text-red-500",
  }[hfBucket];

  const ringColor = {
    safe: "ring-emerald-500/30 bg-emerald-500/5",
    warn: "ring-amber-500/30 bg-amber-500/5",
    danger: "ring-orange-500/30 bg-orange-500/5",
    liquidated: "ring-red-500/40 bg-red-500/10",
  }[hfBucket];

  const hfLabel = {
    safe: "Healthy",
    warn: "Caution",
    danger: "At risk",
    liquidated: "Liquidated",
  }[hfBucket];

  return (
    <section
      className={`p-6 rounded-xl ring-1 ${ringColor} border border-gray-800`}
    >
      <div className="grid grid-cols-1 md:grid-cols-5 gap-6 items-center">
        <div className="md:col-span-2">
          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
            Health Factor
          </p>
          <div className="flex items-baseline gap-3 mt-2">
            <span className={`text-5xl font-black tracking-tight ${colorClass}`}>
              {formatHealthFactor(account.healthFactor)}
            </span>
            <span
              className={`text-xs font-bold uppercase tracking-widest ${colorClass}`}
            >
              {hfLabel}
            </span>
          </div>
          <p className="text-[11px] text-gray-500 mt-2 max-w-sm">
            HF below 1.00 means the position can be liquidated. Aave computes
            this as collateral × weighted liquidation threshold ÷ debt.
          </p>
        </div>

        <Stat
          label="Total Collateral"
          value={formatUsd(baseToUsd(account.totalCollateralBase))}
        />
        <Stat
          label="Total Debt"
          value={formatUsd(baseToUsd(account.totalDebtBase))}
        />
        <div className="space-y-3">
          <Stat
            label="Available to Borrow"
            value={formatUsd(baseToUsd(account.availableBorrowsBase))}
            small
          />
          <Stat
            label="Liq. Threshold"
            value={`${(
              ltToFraction(account.currentLiquidationThreshold) * 100
            ).toFixed(2)}%`}
            small
          />
        </div>
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  small,
}: {
  label: string;
  value: string;
  small?: boolean;
}) {
  return (
    <div>
      <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
        {label}
      </p>
      <p
        className={`font-mono text-white mt-1 ${
          small ? "text-base" : "text-2xl font-bold"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
