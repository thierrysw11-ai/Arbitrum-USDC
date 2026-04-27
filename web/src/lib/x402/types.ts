/**
 * x402 protocol types.
 *
 * Spec: https://github.com/coinbase/x402 (open standard, Coinbase published).
 * Two structures matter:
 *
 *   1. PaymentRequirements — what the server returns inside a 402 response,
 *      describing what payment is acceptable for the requested resource.
 *
 *   2. PaymentPayload — what the client sends back as the `X-PAYMENT` header
 *      (base64-encoded JSON) on the retry, carrying a signed EIP-3009
 *      `transferWithAuthorization` that the facilitator can verify and
 *      submit on-chain.
 */

import type { X402NetworkSlug } from "./networks";

/**
 * One acceptable payment offer. A 402 response can contain several of these
 * (e.g. "pay 0.01 USDC on Arbitrum" OR "pay 0.01 USDC on Base"); the client
 * picks one it can satisfy.
 */
export interface PaymentRequirement {
  /** "exact" is the only scheme x402 v1 defines. */
  scheme: "exact";
  network: X402NetworkSlug;
  /** Payment amount in the asset's smallest unit (USDC: 6 decimals). */
  maxAmountRequired: string;
  /** Canonical URL of the resource being paid for. */
  resource: string;
  /** Human-readable description of the resource. */
  description: string;
  /** Expected MIME type of the successful response body. */
  mimeType: string;
  /** Address that receives the funds. */
  payTo: `0x${string}`;
  /** Window in seconds during which the signed authorization is valid. */
  maxTimeoutSeconds: number;
  /** Asset contract address (USDC on the chosen network). */
  asset: `0x${string}`;
  /** Optional: extra metadata the server wants to expose (price in USD, etc). */
  extra?: Record<string, unknown>;
}

/**
 * The body of a 402 response.
 */
export interface PaymentRequiredResponse {
  x402Version: 1;
  /** Free-form error string for the client to surface. */
  error?: string;
  accepts: PaymentRequirement[];
}

/**
 * EIP-3009 authorization params, in their canonical (string-encoded) form
 * for transport over the wire.
 */
export interface ExactAuthorization {
  from: `0x${string}`;
  to: `0x${string}`;
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: `0x${string}`;
}

/**
 * What the client puts in the `X-PAYMENT` header (base64-encoded).
 */
export interface PaymentPayload {
  x402Version: 1;
  scheme: "exact";
  network: X402NetworkSlug;
  payload: {
    signature: `0x${string}`;
    authorization: ExactAuthorization;
  };
}

/**
 * What the facilitator returns from /verify.
 */
export interface VerifyResult {
  isValid: boolean;
  invalidReason?: string;
}

/**
 * What the facilitator returns from /settle on success.
 */
export interface SettleResult {
  success: boolean;
  txHash?: `0x${string}`;
  network?: X402NetworkSlug;
  errorReason?: string;
}
