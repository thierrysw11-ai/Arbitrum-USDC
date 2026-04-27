/**
 * POST /api/agent/premium-analysis
 *
 * Paywalled endpoint. Charges 0.01 USDC (on Arbitrum or Base) per call.
 * Body: { address: "0x..." }
 * Returns: a deeper Sentinel-style analysis of the address's Aave position,
 * including a multi-asset shock simulation that the free /api/agent route
 * does not run.
 *
 * Wired through `withPaywall(...)` so the route handler itself only deals
 * with the business logic; the 402 dance is automatic.
 */

import { NextRequest, NextResponse } from "next/server";

import { getServerPortfolio } from "@/lib/aave/server";
import { withPaywall } from "@/lib/x402/middleware";
import type { PaymentRequirement } from "@/lib/x402/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Paywall configuration
// ---------------------------------------------------------------------------

// 0.01 USDC = 10_000 base units (USDC has 6 decimals).
const PRICE_BASE_UNITS = "10000";

const RECEIVER = (process.env.X402_RECEIVER_ADDRESS ||
  "0x0000000000000000000000000000000000000000") as `0x${string}`;

const RESOURCE_URL =
  (process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000") +
  "/api/agent/premium-analysis";

const ARBITRUM_REQUIREMENT: PaymentRequirement = {
  scheme: "exact",
  network: "arbitrum-one",
  maxAmountRequired: PRICE_BASE_UNITS,
  resource: RESOURCE_URL,
  description: "Sentinel premium analysis (Arbitrum USDC)",
  mimeType: "application/json",
  payTo: RECEIVER,
  maxTimeoutSeconds: 60,
  asset: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  extra: { priceUsd: "0.01" },
};

const BASE_REQUIREMENT: PaymentRequirement = {
  scheme: "exact",
  network: "base",
  maxAmountRequired: PRICE_BASE_UNITS,
  resource: RESOURCE_URL,
  description: "Sentinel premium analysis (Base USDC)",
  mimeType: "application/json",
  payTo: RECEIVER,
  maxTimeoutSeconds: 60,
  asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  extra: { priceUsd: "0.01" },
};

// ---------------------------------------------------------------------------
// Protected handler
// ---------------------------------------------------------------------------

async function handler(req: NextRequest) {
  let body: { address?: string };
  try {
    body = (await req.json()) as { address?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const address = (body.address || "").toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(address)) {
    return NextResponse.json({ error: "address must be a 0x-prefixed 20-byte hex" }, { status: 400 });
  }

  // Pull the live portfolio.
  const portfolio = await getServerPortfolio(address as `0x${string}`);

  // The "premium" part: a multi-asset shock matrix the free agent doesn't
  // compute. We sweep -50%, -30%, -10% across every non-stable collateral
  // simultaneously and report the resulting health factor at each step.
  const HF_DECIMALS = 18n;
  const baseHF =
    Number(portfolio.account.healthFactor) / Number(10n ** HF_DECIMALS);

  // Stable filter: USDC, USDT, DAI, FRAX, GHO, LUSD all stay anchored.
  const STABLES = new Set([
    "USDC",
    "USDC.e",
    "USDT",
    "DAI",
    "FRAX",
    "GHO",
    "LUSD",
  ]);

  const shockMatrix = [-0.5, -0.3, -0.1].map((pct) => {
    const newCollateralBase = portfolio.positions.reduce((acc, p) => {
      if (p.aTokenBalance === 0n) return acc;
      const isStable = STABLES.has(p.symbol);
      const priceMultiplier = isStable ? 1 : 1 + pct;
      // Convert aTokenBalance (asset decimals) to base currency (8 decimals).
      const valueBase =
        (Number(p.aTokenBalance) / 10 ** p.decimals) *
        (Number(p.priceBase) / 1e8) *
        priceMultiplier;
      // Apply liquidation threshold (basis points × 100, so /10000).
      const adjusted = valueBase * (Number(p.liquidationThreshold) / 10000);
      return acc + adjusted;
    }, 0);

    const debtBase = Number(portfolio.account.totalDebtBase) / 1e8;
    const newHF = debtBase === 0 ? Infinity : newCollateralBase / debtBase;

    return {
      shockPct: pct * 100,
      projectedHealthFactor: Number.isFinite(newHF) ? Number(newHF.toFixed(3)) : null,
      liquidatable: newHF < 1,
    };
  });

  return NextResponse.json({
    address,
    currentHealthFactor: Number(baseHF.toFixed(3)),
    shockMatrix,
    note:
      "Premium analysis: multi-asset shock matrix across all non-stable collateral simultaneously. Settled via x402.",
  });
}

export const POST = withPaywall(
  {
    accepts: [ARBITRUM_REQUIREMENT, BASE_REQUIREMENT],
    error: "This endpoint requires payment via x402 (0.01 USDC).",
  },
  handler
);
