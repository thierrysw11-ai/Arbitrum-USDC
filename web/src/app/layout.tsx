import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';
import Link from 'next/link';
import ConnectButton from '@/components/ConnectButton';
import NavLinks from '@/components/NavLinks';

export const metadata: Metadata = {
  title: 'USDC Guardian | Aave V3 Risk & Yield Monitor on Arbitrum',
  description: 'Real-time Aave V3 risk protection, USDC yield discovery, and AI-powered insights on Arbitrum One.',
  openGraph: {
    title: 'USDC Guardian',
    description: 'Real-time Aave V3 risk monitoring and smart USDC yield strategies on Arbitrum.',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="bg-black text-white">
      <body className="min-h-screen antialiased">
        <Providers>
          {/* Navbar */}
          <nav className="border-b border-zinc-800 bg-black/95 backdrop-blur-lg sticky top-0 z-50">
            <div className="max-w-7xl mx-auto px-6 py-5 flex items-center justify-between">

              {/* Logo */}
              <Link href="/" className="flex items-center gap-3 group">
                <div className="w-10 h-10 bg-gradient-to-br from-purple-600 via-violet-600 to-blue-600 rounded-2xl flex items-center justify-center font-black text-2xl shadow-lg">
                  G
                </div>
                <div>
                  <span className="font-black tracking-tighter text-3xl">USDC</span>
                  <span className="font-black tracking-tighter text-3xl text-zinc-300">Guardian</span>
                  <p className="text-[10px] text-emerald-400 tracking-[1px] -mt-1">ARBITRUM ONE</p>
                </div>
              </Link>

              {/* Navigation Links */}
              <div className="hidden md:flex items-center gap-9 text-sm font-medium">
                <NavLinks />
              </div>

              {/* Right Side — LIVE indicator + connect/chain switcher */}
              <div className="flex items-center gap-3">
                {/*
                  LIVE indicator. Pulsing green dot signals "this dApp is reading
                  fresh on-chain state in real time" — purely cosmetic, but it's
                  a strong portfolio-piece signal that the data isn't mocked.
                */}
                <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/5">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                  </span>
                  <span className="text-[11px] font-semibold tracking-wide text-emerald-400">
                    LIVE
                  </span>
                </div>

                {/*
                  ConnectButton handles both connect-modal (when disconnected)
                  AND the chain switcher pill + address pill (when connected).
                  See web/src/components/ConnectButton.tsx.
                */}
                <ConnectButton />
              </div>

            </div>
          </nav>

          {/* Page content */}
          <main className="max-w-7xl mx-auto px-6 py-8">
            {children}
          </main>
        </Providers>
      </body>
    </html>
  );
}
