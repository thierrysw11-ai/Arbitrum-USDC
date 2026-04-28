'use client';

import React, { useState } from 'react';
import '@rainbow-me/rainbowkit/styles.css';
import { createWagmiConfig } from '@/lib/wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit';
import { ApolloProvider } from '@apollo/client';
import { usdcClient } from '@/lib/apollo';

export function Providers({ children }: { children: React.ReactNode }) {
  // Lazy-init both wagmi config and the React Query client so they're only
  // constructed on the client. This prevents WalletConnect's indexedDB
  // access from blowing up Next.js static page generation.
  const [config] = useState(() => createWagmiConfig());
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={darkTheme({
            accentColor: '#2563eb',
            accentColorForeground: 'white',
            borderRadius: 'medium',
            fontStack: 'system',
          })}
          modalSize="compact"
        >
          {/* Default Apollo client = USDC subgraph. Aave queries pass aaveClient explicitly. */}
          <ApolloProvider client={usdcClient}>{children}</ApolloProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
