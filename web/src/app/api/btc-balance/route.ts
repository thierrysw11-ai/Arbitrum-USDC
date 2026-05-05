/**
 * POST /api/btc-balance
 *
 * Body: { address: "bc1q…" | "1…" | "3…" | "bc1p…" }
 *
 * Look up the confirmed BTC balance for a single Bitcoin address using
 * Blockstream's free public API (https://blockstream.info/api). No API
 * key required — Blockstream's documentation explicitly invites external
 * use of these endpoints.
 *
 * Response:
 *   {
 *     address: "bc1q…",
 *     balanceBtc: 0.12345678,
 *     confirmed: true,
 *     txCount: 42
 *   }
 *
 * We use this to plug native BTC into the portfolio analysis. The
 * Bitcoin network is non-EVM, so the multi-chain wallet scan can't
 * reach it — the user pastes a BTC address (or future: an xpub) and
 * we fetch the balance ourselves rather than asking them to type it.
 */

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Loose validator: accepts legacy P2PKH (1...), P2SH (3...), bech32 segwit
// (bc1q...), and bech32m taproot (bc1p...). Errs on the permissive side —
// Blockstream returns 400 if it doesn't recognize the address, so we
// surface that back to the user as a useful error.
const BTC_ADDR_REGEX =
  /^(bc1[a-z0-9]{25,89}|[13][a-km-zA-HJ-NP-Z1-9]{25,40})$/;

interface BlockstreamAddressResponse {
  address: string;
  chain_stats: {
    funded_txo_sum: number; // satoshis received (sum of all outputs)
    spent_txo_sum: number;  // satoshis spent (sum of all spends)
    tx_count: number;
  };
  mempool_stats: {
    funded_txo_sum: number;
    spent_txo_sum: number;
    tx_count: number;
  };
}

const SATS_PER_BTC = 100_000_000;

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: { address?: string };
  try {
    body = (await req.json()) as { address?: string };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const address = (body.address || '').trim();
  if (!BTC_ADDR_REGEX.test(address)) {
    return NextResponse.json(
      {
        error:
          'Address does not look like a Bitcoin address. Expected legacy (1…), P2SH (3…), or bech32 (bc1…).',
      },
      { status: 400 }
    );
  }

  try {
    const res = await fetch(`https://blockstream.info/api/address/${address}`, {
      // Disable caching — balance can change between page loads.
      cache: 'no-store',
    });
    if (res.status === 400 || res.status === 404) {
      return NextResponse.json(
        { error: 'Blockstream rejected this address — please double-check it.' },
        { status: 400 }
      );
    }
    if (!res.ok) {
      return NextResponse.json(
        { error: `Blockstream returned HTTP ${res.status}.` },
        { status: 502 }
      );
    }
    const json = (await res.json()) as BlockstreamAddressResponse;

    // Confirmed balance only — exclude unconfirmed mempool activity. For
    // portfolio reporting that's the right call (a wealth-manager report
    // shouldn't show pending sends as "still owned").
    const confirmedSats =
      json.chain_stats.funded_txo_sum - json.chain_stats.spent_txo_sum;
    const balanceBtc = confirmedSats / SATS_PER_BTC;

    return NextResponse.json({
      address,
      balanceBtc,
      balanceSats: confirmedSats,
      txCount: json.chain_stats.tx_count,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: `Failed to reach Blockstream: ${(err as Error).message}`,
      },
      { status: 502 }
    );
  }
}
