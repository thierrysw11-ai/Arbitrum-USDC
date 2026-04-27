/**
 * POST /api/x402/verify
 *
 * Self-hosted facilitator endpoint. Body:
 *   { paymentPayload: PaymentPayload, paymentRequirement: PaymentRequirement }
 * Returns: VerifyResult.
 *
 * Stateless and idempotent — runs all the same checks the on-chain contract
 * would run, but read-only.
 */

import { NextRequest, NextResponse } from "next/server";

import { verifyPayment } from "@/lib/x402/facilitator";
import type { PaymentPayload, PaymentRequirement } from "@/lib/x402/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  paymentPayload: PaymentPayload;
  paymentRequirement: PaymentRequirement;
}

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.paymentPayload || !body.paymentRequirement) {
    return NextResponse.json(
      { error: "paymentPayload and paymentRequirement are required" },
      { status: 400 }
    );
  }

  const result = await verifyPayment(body.paymentPayload, body.paymentRequirement);
  return NextResponse.json(result);
}
