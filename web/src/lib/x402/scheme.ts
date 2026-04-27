/**
 * x402 wire encoding helpers.
 *
 * Payment payloads travel as a base64-encoded JSON blob inside the
 * `X-PAYMENT` HTTP header. We keep encoding/decoding centralized here so
 * the server, the facilitator, and the client agent all agree on the shape.
 */

import type { PaymentPayload } from "./types";

export const X_PAYMENT_HEADER = "X-PAYMENT";
export const X_PAYMENT_RESPONSE_HEADER = "X-PAYMENT-RESPONSE";

export function encodePaymentHeader(payload: PaymentPayload): string {
  // Use Buffer in Node, btoa in the browser. Next.js server routes get Node.
  const json = JSON.stringify(payload);
  if (typeof Buffer !== "undefined") {
    return Buffer.from(json, "utf8").toString("base64");
  }
  return btoa(json);
}

export function decodePaymentHeader(header: string): PaymentPayload {
  let json: string;
  if (typeof Buffer !== "undefined") {
    json = Buffer.from(header, "base64").toString("utf8");
  } else {
    json = atob(header);
  }
  const parsed = JSON.parse(json) as PaymentPayload;
  if (parsed.x402Version !== 1) {
    throw new Error(`Unsupported x402 version: ${parsed.x402Version}`);
  }
  if (parsed.scheme !== "exact") {
    throw new Error(`Unsupported scheme: ${parsed.scheme}`);
  }
  return parsed;
}

/**
 * Random 32-byte nonce for EIP-3009 authorizations. Each authorization MUST
 * use a unique nonce or the contract rejects it on replay.
 */
export function generateNonce(): `0x${string}` {
  // Server (Node) and browser (Web Crypto) both expose getRandomValues.
  const bytes = new Uint8Array(32);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    // Fallback — dev-only, never used in production runtimes.
    for (let i = 0; i < 32; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return ("0x" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")) as `0x${string}`;
}
