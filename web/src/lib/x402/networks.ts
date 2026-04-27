/**
 * x402 network configuration.
 *
 * x402 is chain-agnostic; each `network` slug maps to a chain id, a USDC
 * contract that supports EIP-3009 `transferWithAuthorization`, and the
 * EIP-712 domain that USDC uses on that chain.
 *
 * We support Arbitrum (primary, since the rest of the project lives there)
 * and Base (secondary, because every public x402 example targets Base and
 * we want to be interoperable).
 */

import { arbitrum, base } from "viem/chains";

export type X402NetworkSlug = "arbitrum-one" | "base";

export interface X402NetworkConfig {
  slug: X402NetworkSlug;
  chainId: number;
  /** Native (Circle-issued) USDC address on this chain. EIP-3009 enabled. */
  usdc: `0x${string}`;
  /** USDC's reported decimals — always 6 in practice, but explicit > clever. */
  usdcDecimals: number;
  /** EIP-712 domain `name` for USDC on this chain. */
  domainName: string;
  /** EIP-712 domain `version`. Differs across chains! */
  domainVersion: string;
  /** Block explorer URL pattern for tx hashes. {hash} is the placeholder. */
  explorerTx: (hash: string) => string;
  /** viem chain object for instantiating clients. */
  viemChain: typeof arbitrum;
}

export const X402_NETWORKS: Record<X402NetworkSlug, X402NetworkConfig> = {
  "arbitrum-one": {
    slug: "arbitrum-one",
    chainId: 42161,
    usdc: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    usdcDecimals: 6,
    // Native USDC on Arbitrum identifies itself as "USD Coin" v2 in the EIP-712 domain.
    domainName: "USD Coin",
    domainVersion: "2",
    explorerTx: (hash) => `https://arbiscan.io/tx/${hash}`,
    viemChain: arbitrum,
  },
  base: {
    slug: "base",
    chainId: 8453,
    usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    usdcDecimals: 6,
    // Base USDC also reports "USD Coin" v2.
    domainName: "USD Coin",
    domainVersion: "2",
    explorerTx: (hash) => `https://basescan.org/tx/${hash}`,
    viemChain: base as unknown as typeof arbitrum,
  },
};

export function getNetwork(slug: string): X402NetworkConfig {
  if (slug !== "arbitrum-one" && slug !== "base") {
    throw new Error(`Unsupported x402 network: ${slug}`);
  }
  return X402_NETWORKS[slug];
}
