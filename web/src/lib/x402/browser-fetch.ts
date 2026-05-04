'use client';

/**
 * Browser-side x402 client.
 *
 * Mirror of `agent-fetch.ts` but driven by the user's connected wallet
 * (via wagmi) instead of a server-held private key. Designed to be called
 * from a React hook so signTypedData errors propagate naturally as Promise
 * rejections.
 *
 * Flow:
 *   1. Naive fetch.
 *   2. If 402, parse the offer.
 *   3. Pick a network the user is on (or can switch to).
 *   4. Build EIP-3009 typed data.
 *   5. Have the user sign via wagmi.
 *   6. Re-fetch with the encoded X-PAYMENT header.
 *   7. Parse X-PAYMENT-RESPONSE for tx-hash visibility.
 *
 * The sign step pops MetaMask. If the user rejects, we surface that as a
 * clear error rather than silently failing.
 */

import type {
  PaymentRequirement,
  PaymentRequiredResponse,
  PaymentPayload,
  ExactAuthorization,
} from './types';
import {
  X_PAYMENT_HEADER,
  X_PAYMENT_RESPONSE_HEADER,
  encodePaymentHeader,
  generateNonce,
} from './scheme';
import { buildTransferAuthorizationTypedData } from './eip3009';
import { getNetwork } from './networks';

export interface BrowserPaymentInfo {
  paid: boolean;
  requirement?: PaymentRequirement;
  paymentResponse?: {
    success?: boolean;
    txHash?: string;
    network?: string;
    payer?: string;
    errorReason?: string;
  };
}

export interface BrowserPaidFetchResult {
  response: Response;
  payment: BrowserPaymentInfo;
}

// Function we accept as the signer. Keeps the module-level code free of
// any wagmi imports — caller wires in `useSignTypedData`'s mutateAsync.
export type TypedDataSigner = (data: {
  domain: Record<string, unknown>;
  types: Record<string, Array<{ name: string; type: string }>>;
  primaryType: string;
  message: Record<string, unknown>;
}) => Promise<`0x${string}`>;

export interface PaidFetchOpts {
  payerAddress: `0x${string}`;
  signTypedData: TypedDataSigner;
  preferredNetwork?: 'arbitrum-one' | 'base';
  /** If supplied, only accept offers on this network (don't fall back). */
  forceNetwork?: 'arbitrum-one' | 'base';
}

export async function paidFetchBrowser(
  url: string,
  init: RequestInit,
  opts: PaidFetchOpts
): Promise<BrowserPaidFetchResult> {
  const first = await fetch(url, init);
  if (first.status !== 402) {
    return { response: first, payment: { paid: false } };
  }

  const offer = (await first
    .clone()
    .json()
    .catch(() => null)) as PaymentRequiredResponse | null;
  if (!offer || !offer.accepts || offer.accepts.length === 0) {
    return { response: first, payment: { paid: false } };
  }

  const requirement = pickRequirement(
    offer.accepts,
    opts.preferredNetwork,
    opts.forceNetwork
  );
  if (!requirement) {
    return { response: first, payment: { paid: false } };
  }

  // Build the EIP-3009 authorization for the user to sign.
  const network = getNetwork(requirement.network);
  const now = Math.floor(Date.now() / 1000);
  const auth: ExactAuthorization = {
    from: opts.payerAddress,
    to: requirement.payTo,
    value: requirement.maxAmountRequired,
    validAfter: '0',
    validBefore: String(now + Math.max(60, requirement.maxTimeoutSeconds)),
    nonce: generateNonce(),
  };
  const typedData = buildTransferAuthorizationTypedData(network, auth);

  // The wagmi `signTypedData` shape uses `bigint` for numbers. Our typed
  // data already uses bigints in its message field (built that way by
  // `buildTransferAuthorizationTypedData`), so this casts cleanly.
  const signature = await opts.signTypedData({
    domain: typedData.domain as unknown as Record<string, unknown>,
    types: typedData.types,
    primaryType: typedData.primaryType,
    message: typedData.message as unknown as Record<string, unknown>,
  });

  const payload: PaymentPayload = {
    x402Version: 1,
    scheme: 'exact',
    network: requirement.network,
    payload: { signature, authorization: auth },
  };

  const headers = new Headers(init.headers);
  headers.set(X_PAYMENT_HEADER, encodePaymentHeader(payload));
  headers.set('content-type', 'application/json');
  const second = await fetch(url, { ...init, headers });

  let paymentResponse: BrowserPaymentInfo['paymentResponse'];
  const responseHeader = second.headers.get(X_PAYMENT_RESPONSE_HEADER);
  if (responseHeader) {
    try {
      paymentResponse = JSON.parse(atob(responseHeader));
    } catch {
      // best-effort
    }
  }

  return {
    response: second,
    payment: {
      paid: second.status !== 402,
      requirement,
      paymentResponse,
    },
  };
}

function pickRequirement(
  accepts: PaymentRequirement[],
  preferred?: 'arbitrum-one' | 'base',
  forced?: 'arbitrum-one' | 'base'
): PaymentRequirement | undefined {
  if (forced) {
    return accepts.find((r) => r.scheme === 'exact' && r.network === forced);
  }
  if (preferred) {
    const match = accepts.find(
      (r) => r.scheme === 'exact' && r.network === preferred
    );
    if (match) return match;
  }
  return accepts.find(
    (r) =>
      r.scheme === 'exact' &&
      (r.network === 'arbitrum-one' || r.network === 'base')
  );
}
