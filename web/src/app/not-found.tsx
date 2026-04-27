import Link from 'next/link';
import { Compass } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-6 text-center">
      <Compass className="text-gray-600" size={48} />
      <div>
        <h2 className="text-xl font-bold text-white mb-2">Page not found</h2>
        <p className="text-sm text-gray-500 max-w-md">
          That route isn&apos;t part of the DeFi Hub. Head back to the dashboard
          or the send flow.
        </p>
      </div>
      <div className="flex gap-3">
        <Link
          href="/"
          className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold shadow-lg shadow-blue-600/20 transition-colors"
        >
          Dashboard
        </Link>
        <Link
          href="/send"
          className="px-5 py-2.5 rounded-lg border border-gray-800 hover:border-gray-600 text-sm text-gray-300 hover:text-white transition-colors"
        >
          Send USDC
        </Link>
      </div>
    </div>
  );
}
