import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { http, type Transport } from 'viem';
import type { Chain } from 'viem';

import { DEFAULT_CHAIN, SUPPORTED_CHAINS, getRpcUrl } from './chains';

// IMPORTANT: do NOT call getDefaultConfig at module scope. It initializes
// WalletConnect Core under the hood, which references indexedDB — a
// browser-only API. If this runs during Next.js static page generation
// (Node, no DOM), the build fails with "ReferenceError: indexedDB is not
// defined". Returning a factory lets Providers create the config on the
// client only.

/**
 * Build the wagmi/RainbowKit config from the chain registry in `./chains.ts`.
 *
 * The registry is the single source of truth — adding a fifth chain there
 * automatically registers it here without any code change in this file.
 *
 * Chain ordering: DEFAULT_CHAIN (Arbitrum) is placed first in the chains
 * tuple. RainbowKit treats `chains[0]` as the connect-default, so this is
 * what users see when they open the connect modal without an existing
 * session. The remaining chains are appended in registry order.
 */
export function createWagmiConfig() {
  const projectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID ?? '';

  if (!projectId) {
    // Only log in the browser — server logs during build are noise.
    if (typeof window !== 'undefined') {
      console.warn(
        '[wagmi] NEXT_PUBLIC_WC_PROJECT_ID is not set. Get one at https://cloud.reown.com and add it to .env.local',
      );
    }
  }

  // Order the chains: default first, the rest in registry order. We can't
  // rely on `SUPPORTED_CHAINS` order because Object.values() over a numeric-
  // keyed Record iterates in ascending numeric order, which would put
  // Optimism (chainId 10) first and bury Arbitrum.
  const orderedChainConfigs = [
    DEFAULT_CHAIN,
    ...SUPPORTED_CHAINS.filter((c) => c.chainId !== DEFAULT_CHAIN.chainId),
  ];

  // wagmi requires a non-empty tuple `readonly [Chain, ...Chain[]]`. We use
  // a runtime-checked destructure rather than a cast — same end result,
  // but TypeScript's strict prod build (Vercel) won't accept the cast even
  // through the registry guarantees the array is non-empty.
  const [firstChain, ...restChains] = orderedChainConfigs.map((c) => c.viemChain);
  if (!firstChain) {
    throw new Error(
      '[wagmi] No chains registered in chains.ts — at least one is required',
    );
  }
  const chains: readonly [Chain, ...Chain[]] = [firstChain, ...restChains];

  // Per-chain HTTP transport. `getRpcUrl()` reads the chain's env var
  // (e.g. NEXT_PUBLIC_BASE_RPC_URL) and falls back to the public default
  // baked into the registry — so the app works out of the box, with the
  // option to upgrade to private RPCs later via env vars without code change.
  const transports: Record<number, Transport> = Object.fromEntries(
    orderedChainConfigs.map((c) => [c.chainId, http(getRpcUrl(c))]),
  );

  return getDefaultConfig({
    appName: 'Arbitrum DeFi Hub',
    projectId: projectId || 'MISSING_PROJECT_ID',
    chains,
    transports,
    ssr: true,
  });
}
