/**
 * Self-hosted x402 facilitator.
 *
 * The facilitator's job is two HTTP endpoints:
 *
 *   POST /verify  — given a PaymentPayload + the original PaymentRequirement,
 *                   confirm the EIP-712 signature is valid, the authorization
 *                   isn't expired, and the nonce hasn't been used.
 *
 *   POST /settle  — submit the signed authorization on-chain by calling
 *                   `transferWithAuthorization` against USDC. The facilitator
 *                   pays gas in the chain's native asset.
 *
 * We run this ourselves (rather than calling Coinbase's hosted facilitator
 * on Base) because we want the demo to settle on Arbitrum, where Coinbase
 * doesn't yet operate a facilitator. The code in this file works for any
 * chain in `networks.ts` — Arbitrum and Base both — so when the user
 * eventually wants Base settlement they get it for free.
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  recoverTypedDataAddress,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import {
  USDC_EIP3009_ABI,
  buildTransferAuthorizationTypedData,
  splitSignature,
} from "./eip3009";
import { getNetwork, type X402NetworkConfig } from "./networks";
import type {
  PaymentPayload,
  PaymentRequirement,
  SettleResult,
  VerifyResult,
} from "./types";

// ---------------------------------------------------------------------------
// Public client cache (one per chain). Reused across verify/settle calls.
// ---------------------------------------------------------------------------

const publicClients = new Map<number, ReturnType<typeof createPublicClient>>();

function publicClientFor(network: X402NetworkConfig) {
  const cached = publicClients.get(network.chainId);
  if (cached) return cached;
  const url = rpcUrlFor(network);
  const client = createPublicClient({
    chain: network.viemChain,
    transport: http(url, { batch: true }),
  });
  publicClients.set(network.chainId, client);
  return client;
}

function rpcUrlFor(network: X402NetworkConfig): string {
  if (network.slug === "arbitrum-one") {
    return process.env.ARBITRUM_RPC_URL || "https://arb1.arbitrum.io/rpc";
  }
  if (network.slug === "base") {
    return process.env.BASE_RPC_URL || "https://mainnet.base.org";
  }
  throw new Error(`No RPC for ${network.slug}`);
}

// ---------------------------------------------------------------------------
// Verify
// ---------------------------------------------------------------------------

/**
 * Re-derive the signer from the typed data + signature, and walk the same
 * checks the on-chain `transferWithAuthorization` will apply: amount matches,
 * recipient matches, time window holds, nonce unused.
 *
 * Returning `{ isValid: false, invalidReason }` is preferred over throwing
 * so the caller (the paywall middleware) can surface a clean 402 again.
 */
export async function verifyPayment(
  payload: PaymentPayload,
  requirement: PaymentRequirement
): Promise<VerifyResult> {
  if (payload.scheme !== requirement.scheme) {
    return { isValid: false, invalidReason: "scheme mismatch" };
  }
  if (payload.network !== requirement.network) {
    return { isValid: false, invalidReason: "network mismatch" };
  }

  const network = getNetwork(payload.network);
  const auth = payload.payload.authorization;

  // 1. Recipient + amount + asset must match the offer.
  if (auth.to.toLowerCase() !== requirement.payTo.toLowerCase()) {
    return { isValid: false, invalidReason: "recipient mismatch" };
  }
  if (BigInt(auth.value) < BigInt(requirement.maxAmountRequired)) {
    return { isValid: false, invalidReason: "amount below requirement" };
  }

  // 2. Time window. validBefore is a unix timestamp in seconds.
  const now = Math.floor(Date.now() / 1000);
  if (now < Number(auth.validAfter)) {
    return { isValid: false, invalidReason: "authorization not yet valid" };
  }
  if (now >= Number(auth.validBefore)) {
    return { isValid: false, invalidReason: "authorization expired" };
  }

  // 3. EIP-712 signature recovery — does the signed typed data hash actually
  //    come from the address claiming to be `from`?
  const typedData = buildTransferAuthorizationTypedData(network, auth);
  let recovered: Address;
  try {
    recovered = await recoverTypedDataAddress({
      domain: typedData.domain,
      types: typedData.types,
      primaryType: typedData.primaryType,
      message: typedData.message,
      signature: payload.payload.signature,
    });
  } catch (err) {
    return {
      isValid: false,
      invalidReason: `signature recovery failed: ${(err as Error).message}`,
    };
  }
  if (recovered.toLowerCase() !== auth.from.toLowerCase()) {
    return { isValid: false, invalidReason: "signature does not match `from`" };
  }

  // 4. Nonce must still be unused on-chain.
  try {
    const used = (await publicClientFor(network).readContract({
      address: network.usdc,
      abi: USDC_EIP3009_ABI,
      functionName: "authorizationState",
      args: [auth.from, auth.nonce],
    })) as boolean;
    if (used) {
      return { isValid: false, invalidReason: "nonce already used" };
    }
  } catch (err) {
    // RPC hiccup — fail open is unsafe (would let replay through), so fail closed.
    return {
      isValid: false,
      invalidReason: `nonce check rpc failed: ${(err as Error).message}`,
    };
  }

  return { isValid: true };
}

// ---------------------------------------------------------------------------
// Settle
// ---------------------------------------------------------------------------

/**
 * Submit the signed authorization on-chain. The facilitator's wallet
 * (FACILITATOR_PRIVATE_KEY) pays gas; USDC moves from `auth.from` to
 * `auth.to`.
 *
 * For x402 v1, the canonical flow is verify-then-settle: the resource
 * server hits the facilitator's /verify before serving content (cheap,
 * read-only) and /settle after, so the user gets their content even if
 * the on-chain submission gets stuck in mempool. We keep that separation
 * here.
 */
export async function settlePayment(payload: PaymentPayload): Promise<SettleResult> {
  const facilitatorKey = process.env.FACILITATOR_PRIVATE_KEY;
  if (!facilitatorKey) {
    return {
      success: false,
      errorReason: "FACILITATOR_PRIVATE_KEY not configured on the server",
    };
  }

  const network = getNetwork(payload.network);
  const auth = payload.payload.authorization;
  const { v, r, s } = splitSignature(payload.payload.signature);

  let pkey: Hex;
  try {
    pkey = (facilitatorKey.startsWith("0x") ? facilitatorKey : `0x${facilitatorKey}`) as Hex;
    // Throws if invalid hex / wrong length.
    privateKeyToAccount(pkey);
  } catch (err) {
    return {
      success: false,
      errorReason: `invalid FACILITATOR_PRIVATE_KEY: ${(err as Error).message}`,
    };
  }

  const account = privateKeyToAccount(pkey);
  const wallet = createWalletClient({
    account,
    chain: network.viemChain,
    transport: http(rpcUrlFor(network)),
  });

  try {
    const txHash = await wallet.writeContract({
      address: network.usdc,
      abi: USDC_EIP3009_ABI,
      functionName: "transferWithAuthorization",
      args: [
        auth.from,
        auth.to,
        BigInt(auth.value),
        BigInt(auth.validAfter),
        BigInt(auth.validBefore),
        auth.nonce,
        v,
        r,
        s,
      ],
    });
    return { success: true, txHash, network: network.slug };
  } catch (err) {
    return {
      success: false,
      errorReason: `settle tx failed: ${(err as Error).message}`,
    };
  }
}
