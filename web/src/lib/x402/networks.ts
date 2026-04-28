/**
 * x402 network configuration.
 *
 * x402 is chain-agnostic; each `network` slug maps to a chain id, a USDC
 * contract that supports EIP-3009 `transferWithAuthorization`, and the
 * EIP-712 domain that USDC uses on that chain.
 *
 * As of Phase A, this file is a thin compatibility wrapper over
 * `lib/chains.ts` — the canonical multi-chain registry. The exports here
 * (`X402NetworkSlug`, `X402NetworkConfig`, `X402_NETWORKS`, `getNetwork`)
 * keep the same shape so the x402 facilitator + paywalled endpoints
 * compile unchanged. Values flow from `CHAINS_BY_SLUG[slug]`.
 *
 * Currently only "arbitrum-one" and "base" are x402-enabled — those are
 * the two chains where the facilitator wallet is funded. The chain
 * registry's `chain.x402.enabled` flag tracks this; if you want to enable
 * x402 on Optimism or Polygon later, fund the facilitator on that chain,
 * flip `enabled: true` in `chains.ts`, then extend the `X402NetworkSlug`
 * union below.
 *
 * @deprecated For new code, prefer
 *   `import { CHAINS_BY_SLUG, explorerTxUrl } from '@/lib/chains'`
 *   and reference per-chain fields directly.
 */

import { arbitrum } from "viem/chains";

import { CHAINS_BY_SLUG, explorerTxUrl } from "../chains";

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
  /** Block explorer URL pattern for tx hashes. */
  explorerTx: (hash: string) => string;
  /** viem chain object for instantiating clients. */
  viemChain: typeof arbitrum;
}

/**
 * Build an X402NetworkConfig from a chain registry entry. Internal helper.
 * The viem chain object cast goes through `unknown` because chain types in
 * viem are nominally typed by id — `typeof arbitrum` doesn't accept other
 * chains directly even though their runtime shape is identical.
 */
function fromRegistry(slug: X402NetworkSlug): X402NetworkConfig {
  const c = CHAINS_BY_SLUG[slug];
  return {
    slug,
    chainId: c.chainId,
    usdc: c.usdc.address,
    usdcDecimals: c.usdc.decimals,
    domainName: c.usdc.domainName,
    domainVersion: c.usdc.domainVersion,
    explorerTx: (hash) => explorerTxUrl(c, hash),
    viemChain: c.viemChain as unknown as typeof arbitrum,
  };
}

export const X402_NETWORKS: Record<X402NetworkSlug, X402NetworkConfig> = {
  "arbitrum-one": fromRegistry("arbitrum-one"),
  base: fromRegistry("base"),
};

export function getNetwork(slug: string): X402NetworkConfig {
  if (slug !== "arbitrum-one" && slug !== "base") {
    throw new Error(`Unsupported x402 network: ${slug}`);
  }
  return X402_NETWORKS[slug];
}
