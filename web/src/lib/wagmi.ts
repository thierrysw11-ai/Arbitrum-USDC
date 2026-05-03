'use client';

import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { http, type Transport } from 'viem';
import type { Chain } from 'viem';
import { DEFAULT_CHAIN, SUPPORTED_CHAINS, getRpcUrl } from './chains';

export function createWagmiConfig() {
  const projectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID ?? 'b0598ed1afbfe5b24d008ecf89dd7af3';

  if (!projectId) {
    if (typeof window !== 'undefined') {
      console.warn('[wagmi] NEXT_PUBLIC_WC_PROJECT_ID is not set. WalletConnect may not work properly.');
    }
  }

  // Order chains: Arbitrum first
  const orderedChainConfigs = [
    DEFAULT_CHAIN,
    ...SUPPORTED_CHAINS.filter((c) => c.chainId !== DEFAULT_CHAIN.chainId),
  ];

  const [firstChain, ...restChains] = orderedChainConfigs.map((c) => c.viemChain);

  if (!firstChain) {
    throw new Error('[wagmi] No chains registered in chains.ts');
  }

  const chains: readonly [Chain, ...Chain[]] = [firstChain, ...restChains];

  const transports: Record<number, Transport> = Object.fromEntries(
    orderedChainConfigs.map((c) => [c.chainId, http(getRpcUrl(c))])
  );

  return getDefaultConfig({
    appName: 'USDC Guardian',
    projectId,
    chains,
    transports,
    ssr: true,        // Keep true for better SSR experience
  });
}