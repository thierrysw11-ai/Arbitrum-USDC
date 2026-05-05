/**
 * POST /api/agent/portfolio-monte-carlo
 *
 * Paywalled endpoint — 0.01 USDC per call via x402, settled on-chain
 * (Arbitrum One or Base).
 *
 * Body shape:
 *   {
 *     address: "0x...",   // subject wallet (logging / display only)
 *     holdings: [{ symbol, usdValue, key }],
 *     priceHistoryByKey: { [key]: [{ timestamp, price }] }
 *   }
 *
 * The client passes in the already-fetched wallet-holdings + price
 * history (it has them anyway from the live panels). The server's job
 * is the pure computation: 1000 correlated GBM paths over 30 days,
 * tracking total portfolio USD value, returning the drawdown
 * distribution + sample paths + Sharpe.
 *
 * This is the *non-Aave* sibling of `/api/agent/monte-carlo`. Use when
 * the wallet has no leverage position to analyze — the question becomes
 * "what's my drawdown risk?" rather than "P(liquidation)?".
 */

import { NextRequest, NextResponse } from 'next/server';

import { runPortfolioMonteCarlo } from '@/lib/portfolio/montecarlo';
import { withPaywall } from '@/lib/x402/middleware';
import type { PaymentRequirement } from '@/lib/x402/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PRICE_BASE_UNITS = '10000'; // 0.01 USDC at 6 decimals

const RECEIVER = (process.env.X402_RECEIVER_ADDRESS ||
  '0x0000000000000000000000000000000000000000') as `0x${string}`;

const RESOURCE_URL =
  (process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000') +
  '/api/agent/portfolio-monte-carlo';

const ARBITRUM_REQUIREMENT: PaymentRequirement = {
  scheme: 'exact',
  network: 'arbitrum-one',
  maxAmountRequired: PRICE_BASE_UNITS,
  resource: RESOURCE_URL,
  description:
    'Sentinel Portfolio Monte Carlo — 1000-path drawdown distribution (Arbitrum USDC)',
  mimeType: 'application/json',
  payTo: RECEIVER,
  maxTimeoutSeconds: 60,
  asset: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  extra: { priceUsd: '0.01' },
};

const BASE_REQUIREMENT: PaymentRequirement = {
  scheme: 'exact',
  network: 'base',
  maxAmountRequired: PRICE_BASE_UNITS,
  resource: RESOURCE_URL,
  description:
    'Sentinel Portfolio Monte Carlo — 1000-path drawdown distribution (Base USDC)',
  mimeType: 'application/json',
  payTo: RECEIVER,
  maxTimeoutSeconds: 60,
  asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  extra: { priceUsd: '0.01' },
};

interface WireHolding {
  symbol: string;
  usdValue: number;
  key: string;
}

interface WirePricePoint {
  timestamp: number;
  price: number;
}

interface RequestBody {
  address?: string;
  holdings?: WireHolding[];
  priceHistoryByKey?: Record<string, WirePricePoint[]>;
  paths?: number;
  horizonDays?: number;
  /** Benchmark price history for Beta / Jensen's Alpha / Treynor / Info Ratio. */
  benchmarkSymbol?: string;
  benchmarkPriceHistory?: WirePricePoint[];
}

async function handler(req: NextRequest) {
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // -------------------------------------------------------------------------
  // Validate
  // -------------------------------------------------------------------------
  const address = (body.address || '').toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(address)) {
    return NextResponse.json(
      { error: 'address must be a 0x-prefixed 20-byte hex' },
      { status: 400 }
    );
  }

  const holdings = Array.isArray(body.holdings) ? body.holdings : [];
  if (holdings.length === 0) {
    return NextResponse.json(
      { error: 'holdings must be a non-empty array' },
      { status: 400 }
    );
  }
  // Cap at 50 holdings — anything more is either spam or pathological.
  const trimmedHoldings = holdings.slice(0, 50).filter((h) => {
    return (
      typeof h?.symbol === 'string' &&
      typeof h?.key === 'string' &&
      Number.isFinite(h.usdValue) &&
      h.usdValue > 0
    );
  });
  if (trimmedHoldings.length === 0) {
    return NextResponse.json(
      { error: 'no valid holdings after filtering' },
      { status: 400 }
    );
  }

  const priceHistoryByKey = body.priceHistoryByKey ?? {};

  // Bound config so a malicious caller can't run 1M paths.
  const paths = Math.max(100, Math.min(2000, body.paths ?? 1000));
  const horizonDays = Math.max(1, Math.min(180, body.horizonDays ?? 30));

  const t0 = Date.now();
  try {
    const result = runPortfolioMonteCarlo({
      holdings: trimmedHoldings,
      priceHistoryByKey,
      paths,
      horizonDays,
      samplePaths: 50,
      benchmarkSymbol: body.benchmarkSymbol,
      benchmarkPriceHistory: body.benchmarkPriceHistory,
    });
    const elapsedMs = Date.now() - t0;

    return NextResponse.json({
      address,
      simulation: result,
      meta: { elapsedMs },
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}

export const POST = withPaywall(
  { accepts: [ARBITRUM_REQUIREMENT, BASE_REQUIREMENT] },
  handler
);
