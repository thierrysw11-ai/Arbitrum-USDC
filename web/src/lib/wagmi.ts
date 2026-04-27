import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { http } from 'viem';
import { arbitrum } from 'wagmi/chains';

export const projectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID ?? '';

if (!projectId) {
  console.warn(
    '[wagmi] NEXT_PUBLIC_WC_PROJECT_ID is not set. Get one at https://cloud.reown.com and add it to .env.local',
  );
}

export const config = getDefaultConfig({
  appName: 'Arbitrum DeFi Hub',
  projectId: projectId || 'MISSING_PROJECT_ID',
  chains: [arbitrum],
  transports: {
    [arbitrum.id]: http(process.env.NEXT_PUBLIC_ARBITRUM_RPC_URL),
  },
  ssr: true,
});
