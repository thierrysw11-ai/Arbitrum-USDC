/**
 * POST /api/asset-momentum
 *
 * Body: { assets: [{ chainSlug, contractAddress, symbol }] }
 *
 * For each requested asset, fetches 14 days of daily price history from
 * Alchemy's Prices API and derives two metrics borrowed from physics:
 *
 *   velocity = % price change over the last 7 days
 *   force    = change in velocity, computed as:
 *              (most-recent-7d ROC) − (prior-7d ROC)   in percentage points
 *
 * "Force" here is positive when the trend is accelerating in the same
 * direction as velocity, negative when it's decelerating or reversing.
 *
 * Server-side only — Alchemy API key never reaches the browser.
 */

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALCHEMY_PRICES_NETWORK_BY_SLUG: Record<string, string> = {
  'ethereum-mainnet': 'eth-mainnet',
  'arbitrum-one': 'arb-mainnet',
  base: 'base-mainnet',
  optimism: 'opt-mainnet',
  polygon: 'polygon-mainnet',
};

interface AssetSpec {
  chainSlug: string;
  contractAddress: string;
  symbol: string;
}

interface MomentumPoint {
  symbol: string;
  chainSlug: string;
  contractAddress: string;
  /** Most recent observed price (USD), or null on fetch failure. */
  currentPriceUsd: number | null;
  /**
   * Daily-resolution prices over the lookback window. Sorted ascending by
   * timestamp. Empty array on fetch failure.
   */
  priceHistory: Array<{ timestamp: number; price: number }>;
  /** % change over last 7 days. null if insufficient history. */
  velocity7dPct: number | null;
  /** % change over last 1 day. */
  velocity1dPct: number | null;
  /**
   * Force = (recent 7d ROC) - (prior 7d ROC), in percentage points.
   * Positive = trend accelerating in same direction as velocity.
   * null if insufficient history.
   */
  forcePct: number | null;
  /** Quadrant label for the scatter chart. */
  quadrant:
    | 'rising_accelerating'
    | 'rising_decelerating'
    | 'falling_decelerating'
    | 'falling_accelerating'
    | 'flat'
    | null;
  error?: string;
}

async function fetchHistorical(
  apiKey: string,
  network: string,
  contract: string
): Promise<Array<{ timestamp: number; price: number }>> {
  // Alchemy's historical-prices-by-address endpoint. Requesting daily
  // resolution for the last 14 days gives us enough data for a 7-day
  // velocity + a "prior 7-day" baseline for the force computation.
  const endTime = new Date();
  const startTime = new Date(endTime.getTime() - 14 * 86400_000);

  const url = `https://api.g.alchemy.com/prices/v1/${apiKey}/tokens/historical`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      network,
      address: contract,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      interval: '1d',
    }),
  });
  if (!res.ok) {
    throw new Error(`Alchemy historical HTTP ${res.status}`);
  }
  const json = (await res.json()) as {
    data?: Array<{ value: string; timestamp: string }>;
    error?: { message: string };
  };
  if (json.error) {
    throw new Error(`Alchemy historical: ${json.error.message}`);
  }
  return (json.data ?? [])
    .map((d) => ({
      timestamp: new Date(d.timestamp).getTime(),
      price: Number(d.value),
    }))
    .filter((d) => Number.isFinite(d.price) && d.price > 0)
    .sort((a, b) => a.timestamp - b.timestamp);
}

function computeMomentum(
  history: Array<{ timestamp: number; price: number }>
): {
  current: number | null;
  v7d: number | null;
  v1d: number | null;
  force: number | null;
  quadrant: MomentumPoint['quadrant'];
} {
  if (history.length < 2) {
    return {
      current: history[0]?.price ?? null,
      v7d: null,
      v1d: null,
      force: null,
      quadrant: null,
    };
  }
  const current = history[history.length - 1].price;
  const last1d = history[history.length - 2]?.price ?? null;
  const v1d = last1d ? ((current - last1d) / last1d) * 100 : null;

  // 7d velocity. Find the price closest to 7 days ago.
  const targetT7 = current && history.length > 0
    ? history[history.length - 1].timestamp - 7 * 86400_000
    : 0;
  const last7d = history.reduce((closest, p) => {
    if (closest === null) return p;
    return Math.abs(p.timestamp - targetT7) <
      Math.abs(closest.timestamp - targetT7)
      ? p
      : closest;
  }, null as { timestamp: number; price: number } | null);
  const v7d = last7d ? ((current - last7d.price) / last7d.price) * 100 : null;

  // Prior 7d ROC (between days -14 and -7) — used for force.
  let force: number | null = null;
  if (history.length >= 4 && v7d !== null && last7d) {
    const targetT14 = last7d.timestamp - 7 * 86400_000;
    const last14d = history.reduce((closest, p) => {
      if (closest === null) return p;
      return Math.abs(p.timestamp - targetT14) <
        Math.abs(closest.timestamp - targetT14)
        ? p
        : closest;
    }, null as { timestamp: number; price: number } | null);
    if (last14d && last14d.timestamp < last7d.timestamp) {
      const priorRoc = ((last7d.price - last14d.price) / last14d.price) * 100;
      force = v7d - priorRoc;
    }
  }

  // Quadrant classification — used by the chart for color coding.
  const FLAT_THRESHOLD = 0.5; // % — moves under this we treat as no signal
  let quadrant: MomentumPoint['quadrant'] = 'flat';
  if (v7d !== null && force !== null) {
    if (Math.abs(v7d) < FLAT_THRESHOLD) {
      quadrant = 'flat';
    } else if (v7d > 0 && force >= 0) {
      quadrant = 'rising_accelerating';
    } else if (v7d > 0 && force < 0) {
      quadrant = 'rising_decelerating';
    } else if (v7d < 0 && force >= 0) {
      quadrant = 'falling_decelerating';
    } else {
      quadrant = 'falling_accelerating';
    }
  }

  return { current, v7d, v1d, force, quadrant };
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const apiKey = process.env.ALCHEMY_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'ALCHEMY_API_KEY not configured on the server' },
      { status: 500 }
    );
  }

  let body: { assets?: AssetSpec[] };
  try {
    body = (await req.json()) as { assets?: AssetSpec[] };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const assets = body.assets ?? [];
  if (assets.length === 0) {
    return NextResponse.json({ results: [] });
  }
  // Hard cap to bound work — even portfolio dApps don't need more than this.
  const MAX_ASSETS = 20;
  const slice = assets.slice(0, MAX_ASSETS);

  const results = await Promise.all(
    slice.map(async (a): Promise<MomentumPoint> => {
      const network = ALCHEMY_PRICES_NETWORK_BY_SLUG[a.chainSlug];
      if (!network) {
        return {
          symbol: a.symbol,
          chainSlug: a.chainSlug,
          contractAddress: a.contractAddress,
          currentPriceUsd: null,
          priceHistory: [],
          velocity7dPct: null,
          velocity1dPct: null,
          forcePct: null,
          quadrant: null,
          error: `Unsupported chain: ${a.chainSlug}`,
        };
      }
      try {
        const history = await fetchHistorical(
          apiKey,
          network,
          a.contractAddress.toLowerCase()
        );
        const m = computeMomentum(history);
        return {
          symbol: a.symbol,
          chainSlug: a.chainSlug,
          contractAddress: a.contractAddress,
          currentPriceUsd: m.current,
          priceHistory: history,
          velocity7dPct: m.v7d,
          velocity1dPct: m.v1d,
          forcePct: m.force,
          quadrant: m.quadrant,
        };
      } catch (err) {
        return {
          symbol: a.symbol,
          chainSlug: a.chainSlug,
          contractAddress: a.contractAddress,
          currentPriceUsd: null,
          priceHistory: [],
          velocity7dPct: null,
          velocity1dPct: null,
          forcePct: null,
          quadrant: null,
          error: (err as Error).message,
        };
      }
    })
  );

  return NextResponse.json({ results });
}
