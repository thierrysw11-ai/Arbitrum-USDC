'use client';

import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Swap for a real logger (Sentry, Logflare, etc.) when you wire one up.
    console.error('[app error]', error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center py-24 gap-6 text-center">
      <AlertTriangle className="text-red-400" size={48} />
      <div>
        <h2 className="text-xl font-bold text-white mb-2">
          Something went wrong
        </h2>
        <p className="text-sm text-gray-500 max-w-md">
          {error.message || 'The dashboard hit an unexpected error.'}
        </p>
        {error.digest && (
          <p className="text-[10px] text-gray-700 font-mono mt-3">
            digest: {error.digest}
          </p>
        )}
      </div>
      <button
        onClick={() => reset()}
        className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold shadow-lg shadow-blue-600/20 transition-colors"
      >
        Try again
      </button>
    </div>
  );
}
