/**
 * POST /api/agent/monte-carlo
 *
 * Paywalled endpoint — 0.01 USDC per call via x402, settled on-chain
 * (Arbitrum One or Base). Body: { address: "0x..." }
 *
 * Runs a Monte Carlo simulation of the address's Aave V3 health factor
 * over a 30-day horizon (1000 paths, daily steps, GBM with realized
 * volatilities). Returns the full distribution + sample paths so the UI
 * can render histogram + path-bundle visualizations.
 *
 * The free `/api/agent` Sentinel chat exposes the deterministic shock
 * tools (`get_portfolio`, `simulate_price_shock`). This endpoint is the
 * paid premium tier — probabilistic risk modelling that the free tools
 * can't provide.
 */

import { NextRequest, NextResponse } from 'next/server';

import { getServerPortfolio } from '@/lib/aave/server';
import { runMonteCarlo, runEfficientFrontier } from '@/lib/aave/montecarlo';
import { withPaywall } from '@/lib/x402/middleware';
import type { PaymentRequirement } from '@/lib/x402/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PRICE_BASE_UNITS = '10000'; // 0.01 USDC at 6 decimals

const RECEIVER = (process.env.X402_RECEIVER_ADDRESS ||
  '0x0000000000000000000000000000000000000000') as `0x${string}`;

const RESOURCE_URL =
  (process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000') +
  '/api/agent/monte-carlo';

const ARBITRUM_REQUIREMENT: PaymentRequirement = {
  scheme: 'exact',
  network: 'arbitrum-one',
  maxAmountRequired: PRICE_BASE_UNITS,
  resource: RESOURCE_URL,
  description: 'Sentinel Monte Carlo — 1000-path HF distribution (Arbitrum USDC)',
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
  description: 'Sentinel Monte Carlo — 1000-path HF distribution (Base USDC)',
  mimeType: 'application/json',
  payTo: RECEIVER,
  maxTimeoutSeconds: 60,
  asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  extra: { priceUsd: '0.01' },
};

async function handler(req: NextRequest) {
  let body: { address?: string; paths?: number; horizonDays?: number };
  try {
    body = (await req.json()) as {
      address?: string;
      paths?: number;
      horizonDays?: number;
    };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const address = (body.address || '').toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(address)) {
    return NextResponse.json(
      { error: 'address must be a 0x-prefixed 20-byte hex' },
      { status: 400 }
    );
  }

  // Bound the inputs so a malicious caller can't spin us up to 1M paths.
  const paths = Math.max(100, Math.min(2000, body.paths ?? 1000));
  const horizonDays = Math.max(1, Math.min(180, body.horizonDays ?? 30));

  try {
    const portfolio = await getServerPortfolio(address as `0x${string}`);

    if (portfolio.positions.length === 0) {
      return NextResponse.json(
        { error: 'No active Aave V3 position for this address' },
        { status: 400 }
      );
    }

    const t0 = Date.now();
    const sim = runMonteCarlo({
      positions: portfolio.positions,
      account: portfolio.account,
      paths,
      horizonDays,
      samplePaths: 50,
    });
    // Efficient frontier — sweep leverage at fewer paths each.
    const frontier = runEfficientFrontier({
      positions: portfolio.positions,
      account: portfolio.account,
      paths: 250,
      horizonDays,
    });
    const elapsedMs = Date.now() - t0;

    // Replace Infinity with a sentinel — JSON.stringify converts it to null
    // which is fine, but explicit is friendlier to clients.
    const sanitize = (n: number): number | string =>
      Number.isFinite(n) ? n : 'INFINITY';

    return NextResponse.json({
      address,
      simulation: {
        ...sim,
        percentiles: {
          p5: sanitize(sim.percentiles.p5),
          p25: sanitize(sim.percentiles.p25),
          p50: sanitize(sim.percentiles.p50),
          p75: sanitize(sim.percentiles.p75),
          p95: sanitize(sim.percentiles.p95),
        },
        expectedTerminalHf: sanitize(sim.expectedTerminalHf),
        worstTerminalHf: sanitize(sim.worstTerminalHf),
        bestTerminalHf: sanitize(sim.bestTerminalHf),
      },
      efficientFrontier: {
        ...frontier,
        points: frontier.points.map((p) => ({
          ...p,
          expectedTerminalHf: sanitize(p.expectedTerminalHf),
          initialHf: sanitize(p.initialHf),
        })),
      },
      meta: {
        elapsedMs,
        currentHealthFactor: Number(portfolio.account.healthFactor) / 1e18,
      },
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
