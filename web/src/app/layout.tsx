import './globals.css';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Providers } from './providers';
import ConnectButton from '@/components/ConnectButton';
import NavLinks from '@/components/NavLinks';

export const metadata: Metadata = {
  title: 'Arbitrum DeFi Hub — Public Risk & Yield Monitor',
  description:
    'Real-time USDC liquidity flow, Aave V3 position risk, and USDC transfers on Arbitrum, powered by The Graph.',
  openGraph: {
    title: 'Arbitrum DeFi Hub',
    description:
      'Public risk & yield monitor on Arbitrum — USDC flows, Aave health factor, native send flow.',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="bg-black text-white">
      <body className="min-h-screen flex flex-col">
        <Providers>
          <nav className="flex justify-between items-center px-6 py-4 border-b border-gray-800 bg-black/50 backdrop-blur-md sticky top-0 z-50">
            <div className="flex items-center gap-6">
              <Link href="/" className="flex items-center gap-3 group">
                <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center font-black text-sm group-hover:bg-blue-500 transition-colors">
                  A
                </div>
                <span className="text-sm font-black tracking-tight uppercase">
                  Arbitrum DeFi Hub
                </span>
              </Link>
              <NavLinks />
            </div>
            <ConnectButton />
          </nav>

          <main className="flex-grow container mx-auto px-4 py-8 max-w-6xl">
            {children}
          </main>

          <footer className="p-8 border-t border-gray-900 text-center text-gray-600 text-[11px] uppercase tracking-widest">
            Powered by The Graph &middot; Arbitrum One &middot; Aave V3
          </footer>
        </Providers>
      </body>
    </html>
  );
}
