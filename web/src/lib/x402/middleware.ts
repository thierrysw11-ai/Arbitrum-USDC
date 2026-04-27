/**
 * Paywall middleware for Next.js API routes.
 *
 * Wrap any route handler with `withPaywall(config, handler)` and the route
 * will automatically:
 *   - return 402 + PaymentRequiredResponse if no `X-PAYMENT` header is present
 *   - verify any provided payment header (against our self-hosted facilitator)
 *   - call `handler(req)` only on a valid payment
 *   - settle the payment after the handler runs, attaching the on-chain tx
 *     hash to the `X-PAYMENT-RESPONSE` header
 *
 * Intentional design choices:
 *   - We verify *before* running the handler, but settle *after*. That way
 *     a flaky settlement doesn't deny the user content they've already paid
 *     for via signature. (Standard x402 pattern.)
 *   - Settlement happens in-process by importing the facilitator helpers
 *     directly — no extra HTTP hop. The /api/x402/* routes exist for other
 *     services that want to use us as a facilitator over the network.
 */

import { NextRequest, NextResponse } from "next/server";

import { settlePayment, verifyPayment } from "./facilitator";
import {
  X_PAYMENT_HEADER,
  X_PAYMENT_RESPONSE_HEADER,
  decodePaymentHeader,
} from "./scheme";
import type {
  PaymentRequiredResponse,
  PaymentRequirement,
} from "./types";

export interface PaywallConfig {
  /** What payment options we accept (one or more — e.g. Arbitrum + Base). */
  accepts: PaymentRequirement[];
  /** Optional human description shown in the 402 body. */
  error?: string;
}

type Handler = (req: NextRequest) => Promise<NextResponse> | NextResponse;

export function withPaywall(config: PaywallConfig, handler: Handler): Handler {
  return async function paywalledHandler(req: NextRequest) {
    const headerValue = req.headers.get(X_PAYMENT_HEADER);

    // No payment attempted — return 402 with our offer.
    if (!headerValue) {
      return paymentRequired(config);
    }

    // Decode + pick the matching requirement.
    let payload;
    try {
      payload = decodePaymentHeader(headerValue);
    } catch (err) {
      return paymentRequired(config, `invalid X-PAYMENT header: ${(err as Error).message}`);
    }

    const matchingRequirement = config.accepts.find(
      (r) => r.scheme === payload.scheme && r.network === payload.network
    );
    if (!matchingRequirement) {
      return paymentRequired(
        config,
        `no matching requirement for ${payload.scheme}/${payload.network}`
      );
    }

    // Verify off-chain (recover signer, check time window, check nonce).
    const verifyResult = await verifyPayment(payload, matchingRequirement);
    if (!verifyResult.isValid) {
      return paymentRequired(config, verifyResult.invalidReason || "payment verification failed");
    }

    // Run the protected handler before settling — see file header for why.
    let handlerResponse: NextResponse;
    try {
      handlerResponse = await handler(req);
    } catch (err) {
      return NextResponse.json(
        { error: (err as Error).message || "handler error" },
        { status: 500 }
      );
    }

    // Settle on-chain. If settlement fails we still return the content (the
    // user paid in signature; the loss is on us), but we surface the error
    // in the X-PAYMENT-RESPONSE header so observability isn't blind.
    const settleResult = await settlePayment(payload);
    handlerResponse.headers.set(
      X_PAYMENT_RESPONSE_HEADER,
      Buffer.from(JSON.stringify(settleResult), "utf8").toString("base64")
    );
    return handlerResponse;
  };
}

function paymentRequired(config: PaywallConfig, error?: string): NextResponse {
  const body: PaymentRequiredResponse = {
    x402Version: 1,
    error: error || config.error,
    accepts: config.accepts,
  };
  return NextResponse.json(body, { status: 402 });
}
