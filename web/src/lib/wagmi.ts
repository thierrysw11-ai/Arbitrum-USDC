import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { http } from 'viem';
import { arbitrum } from 'wagmi/chains';

// IMPORTANT: do NOT call getDefaultConfig at module scope. It initializes
// WalletConnect Core under the hood, which references indexedDB — a
// browser-only API. If this runs during Next.js static page generation
// (Node, no DOM), the build fails with "ReferenceError: indexedDB is not
// defined". Returning a factory lets Providers create the config on the
// client only.

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

  return getDefaultConfig({
    appName: 'Arbitrum DeFi Hub',
    projectId: projectId || 'MISSING_PROJECT_ID',
    chains: [arbitrum],
    transports: {
      [arbitrum.id]: http(process.env.NEXT_PUBLIC_ARBITRUM_RPC_URL),
    },
    ssr: true,
  });
}
