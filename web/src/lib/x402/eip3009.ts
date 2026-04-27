/**
 * EIP-3009 `transferWithAuthorization` typed-data + ABI helpers.
 *
 * x402's "exact" scheme delegates settlement to USDC's EIP-3009 entry point:
 * the payer signs an off-chain authorization, anyone can submit it on-chain
 * to actually move the tokens. That gives us gasless-from-the-payer's-POV
 * payments — the server (or facilitator) covers gas — which is what makes
 * agentic micropayments practical.
 */

import type { X402NetworkConfig } from "./networks";
import type { ExactAuthorization } from "./types";

/**
 * EIP-712 typed data for `transferWithAuthorization`. Pass to
 * `walletClient.signTypedData(...)` or any EIP-712 signer.
 */
export function buildTransferAuthorizationTypedData(
  network: X402NetworkConfig,
  auth: ExactAuthorization
) {
  return {
    domain: {
      name: network.domainName,
      version: network.domainVersion,
      chainId: network.chainId,
      verifyingContract: network.usdc,
    },
    types: {
      TransferWithAuthorization: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" },
        { name: "nonce", type: "bytes32" },
      ],
    },
    primaryType: "TransferWithAuthorization" as const,
    message: {
      from: auth.from,
      to: auth.to,
      value: BigInt(auth.value),
      validAfter: BigInt(auth.validAfter),
      validBefore: BigInt(auth.validBefore),
      nonce: auth.nonce,
    },
  };
}

/**
 * Minimal ABI for the on-chain calls we need: settling an authorization,
 * checking whether a nonce is still unused, and reading symbol/decimals
 * for sanity logging.
 */
export const USDC_EIP3009_ABI = [
  {
    name: "transferWithAuthorization",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
      { name: "v", type: "uint8" },
      { name: "r", type: "bytes32" },
      { name: "s", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    name: "authorizationState",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "authorizer", type: "address" },
      { name: "nonce", type: "bytes32" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

/**
 * Decompose a 65-byte (0x-prefixed, 132-char) ECDSA signature into v, r, s.
 * EIP-3009's `transferWithAuthorization` takes them as separate args.
 */
export function splitSignature(sig: `0x${string}`): {
  v: number;
  r: `0x${string}`;
  s: `0x${string}`;
} {
  if (sig.length !== 132) {
    throw new Error(`Expected 65-byte signature, got ${(sig.length - 2) / 2} bytes`);
  }
  const r = ("0x" + sig.slice(2, 66)) as `0x${string}`;
  const s = ("0x" + sig.slice(66, 130)) as `0x${string}`;
  let v = parseInt(sig.slice(130, 132), 16);
  // Some signers return v as 0/1 instead of 27/28. Normalize.
  if (v < 27) v += 27;
  return { v, r, s };
}
