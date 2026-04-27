/**
 * POST /api/x402/settle
 *
 * Self-hosted facilitator endpoint. Body:
 *   { paymentPayload: PaymentPayload }
 * Returns: SettleResult.
 *
 * Submits the signed EIP-3009 authorization on-chain. Gas paid by
 * FACILITATOR_PRIVATE_KEY's account.
 */

import { NextRequest, NextResponse } from "next/server";

import { settlePayment } from "@/lib/x402/facilitator";
import type { PaymentPayload } from "@/lib/x402/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  paymentPayload: PaymentPayload;
}

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.paymentPayload) {
    return NextResponse.json(
      { error: "paymentPayload is required" },
      { status: 400 }
    );
  }

  const result = await settlePayment(body.paymentPayload);
  return NextResponse.json(result);
}
