/**
 * x402 fetch client (server-side, used by the agent).
 *
 * Drop-in `fetch` replacement: if a request comes back 402, this wrapper
 * picks the cheapest acceptable PaymentRequirement, signs an EIP-3009
 * authorization with the agent's private key, retries the request with
 * the `X-PAYMENT` header, and returns the upgraded response. The caller
 * doesn't need to know the request was paywalled.
 *
 * The agent's wallet is `AGENT_PRIVATE_KEY`. It must hold USDC on whichever
 * network it intends to pay on (Arbitrum or Base). It does NOT need ETH for
 * gas — gas is paid by the resource server's facilitator on settle.
 */

import { privateKeyToAccount } from "viem/accounts";

import {
  buildTransferAuthorizationTypedData,
} from "./eip3009";
import { getNetwork } from "./networks";
import {
  X_PAYMENT_HEADER,
  X_PAYMENT_RESPONSE_HEADER,
  encodePaymentHeader,
  generateNonce,
} from "./scheme";
import type {
  PaymentPayload,
  PaymentRequiredResponse,
  PaymentRequirement,
} from "./types";

export interface AgentPaymentInfo {
  /** Whether this request actually paid for content (true) vs free (false). */
  paid: boolean;
  /** Which requirement we satisfied, if any. */
  requirement?: PaymentRequirement;
  /** The base64 X-PAYMENT-RESPONSE returned by the server (settlement info). */
  paymentResponse?: { success: boolean; txHash?: string; network?: string; errorReason?: string };
}

export interface PaidFetchResult {
  response: Response;
  payment: AgentPaymentInfo;
}

/**
 * Fetch + auto-pay for x402-protected resources.
 *
 * @param url     Resource URL.
 * @param init    Standard fetch RequestInit (method, body, headers, ...).
 * @param opts.preferredNetwork  Which network to prefer if the server offers
 *                              multiple. Defaults to "arbitrum-one".
 */
export async function paidFetch(
  url: string,
  init: RequestInit = {},
  opts: { preferredNetwork?: "arbitrum-one" | "base" } = {}
): Promise<PaidFetchResult> {
  // Attempt 1 — unpaid.
  const first = await fetch(url, init);
  if (first.status !== 402) {
    return { response: first, payment: { paid: false } };
  }

  // Server returned 402 with an offer.
  const offer = (await first.clone().json()) as PaymentRequiredResponse;
  if (!offer.accepts || offer.accepts.length === 0) {
    return { response: first, payment: { paid: false } };
  }

  const requirement = pickRequirement(offer.accepts, opts.preferredNetwork);
  if (!requirement) {
    return { response: first, payment: { paid: false } };
  }

  // Sign the authorization.
  const payload = await signPaymentPayload(requirement);

  // Attempt 2 — with the X-PAYMENT header attached.
  const headers = new Headers(init.headers);
  headers.set(X_PAYMENT_HEADER, encodePaymentHeader(payload));
  const second = await fetch(url, { ...init, headers });

  // Decode the X-PAYMENT-RESPONSE if present so callers get tx hash visibility.
  let paymentResponse: AgentPaymentInfo["paymentResponse"];
  const responseHeader = second.headers.get(X_PAYMENT_RESPONSE_HEADER);
  if (responseHeader) {
    try {
      paymentResponse = JSON.parse(
        Buffer.from(responseHeader, "base64").toString("utf8")
      );
    } catch {
      /* best-effort; don't break the response over a malformed header */
    }
  }

  return {
    response: second,
    payment: { paid: second.status !== 402, requirement, paymentResponse },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pickRequirement(
  accepts: PaymentRequirement[],
  preferred?: "arbitrum-one" | "base"
): PaymentRequirement | undefined {
  if (preferred) {
    const match = accepts.find((r) => r.network === preferred);
    if (match) return match;
  }
  // Fall back to the first one we know how to satisfy.
  return accepts.find(
    (r) =>
      r.scheme === "exact" && (r.network === "arbitrum-one" || r.network === "base")
  );
}

async function signPaymentPayload(
  requirement: PaymentRequirement
): Promise<PaymentPayload> {
  const agentKey = process.env.AGENT_PRIVATE_KEY;
  if (!agentKey) {
    throw new Error(
      "AGENT_PRIVATE_KEY not configured — agent cannot sign x402 payments"
    );
  }
  const pkey = (agentKey.startsWith("0x") ? agentKey : `0x${agentKey}`) as `0x${string}`;
  const account = privateKeyToAccount(pkey);

  const network = getNetwork(requirement.network);
  const now = Math.floor(Date.now() / 1000);
  const auth = {
    from: account.address,
    to: requirement.payTo,
    value: requirement.maxAmountRequired,
    validAfter: "0",
    validBefore: String(now + Math.max(60, requirement.maxTimeoutSeconds)),
    nonce: generateNonce(),
  };

  const typedData = buildTransferAuthorizationTypedData(network, auth);
  const signature = await account.signTypedData({
    domain: typedData.domain,
    types: typedData.types,
    primaryType: typedData.primaryType,
    message: typedData.message,
  });

  return {
    x402Version: 1,
    scheme: "exact",
    network: requirement.network,
    payload: { signature, authorization: auth },
  };
}
