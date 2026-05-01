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

              {/* Right Side */}
              <div className="flex items-center gap-4">
                {/* Live Indicator */}
                <div className="hidden sm:flex items-center gap-2 bg-zinc-900 border border-zinc-700 px-4 py-2 rounded-2xl text-xs font-mono">
                  <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                  LIVE
                </div>

                <ConnectButton />
              </div>
            </div>
          </nav>

          {/* Main Content Area */}
          <main className="flex-1 min-h-[calc(100vh-73px)]">
            {children}
          </main>

          {/* Footer */}
          <footer className="border-t border-zinc-900 py-8 bg-black">
            <div className="max-w-7xl mx-auto px-6 text-center text-xs text-zinc-500">
              Powered by The Graph • Aave V3 • Arbitrum One
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}