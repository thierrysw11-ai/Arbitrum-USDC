'use client';

import React, { useState } from 'react';
import { X, Zap, Shield } from 'lucide-react';
import { useAccount } from 'wagmi';

export function PremiumAnalysisButton() {
  const { address } = useAccount();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runAnalysis = async () => {
    if (!address) {
      setError("Please connect your wallet first");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/agent/premium-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: address.toLowerCase() }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Analysis failed. Please try again.');
      }

      setAnalysis(data.report || data.analysis);
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="group relative flex items-center gap-3 px-10 py-5 bg-gradient-to-r from-purple-600 to-violet-600 rounded-2xl font-semibold text-white transition-all active:scale-95 shadow-lg shadow-purple-500/30"
      >
        <Zap className="w-5 h-5" />
        Run Sentinel Elite Analysis
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl">
          <div className="relative w-full max-w-3xl bg-zinc-950 border border-zinc-700 rounded-3xl overflow-hidden">
            
            {/* Header */}
            <div className="p-8 border-b border-zinc-800 flex justify-between items-start">
              <div>
                <div className="uppercase tracking-widest text-xs text-purple-400 font-bold mb-1">SYSTEM INTELLIGENCE ACTIVE</div>
                <h2 className="text-4xl font-black tracking-tighter">SENTINEL ELITE ANALYSIS</h2>
                <p className="text-zinc-400 mt-2">Real-time risk modeling for your USDC positions.</p>
              </div>
              <button onClick={() => setIsOpen(false)} className="text-zinc-400 hover:text-white">
                <X size={28} />
              </button>
            </div>

            {/* Content Area */}
            <div className="p-8 min-h-[420px]">
              {!analysis && !error ? (
                <div className="flex flex-col items-center justify-center h-[380px] text-center">
                  <Shield className="w-20 h-20 text-purple-400 mb-8" />
                  <h3 className="text-2xl font-semibold mb-3">Ready for Deep Analysis?</h3>
                  <p className="text-zinc-400 max-w-md mb-10">
                    This will execute a 0.01 USDC x402 settlement and return a full Sentinel Elite Risk Assessment.
                  </p>
                  <button
                    onClick={runAnalysis}
                    disabled={isLoading}
                    className="px-14 py-4 bg-gradient-to-r from-purple-600 to-violet-600 rounded-2xl font-semibold text-lg disabled:opacity-50 flex items-center gap-3"
                  >
                    {isLoading ? "Processing Settlement..." : "EXECUTE DEEP-DIVE (0.01 USDC)"}
                    <Zap className="w-5 h-5" />
                  </button>
                </div>
              ) : error ? (
                <div className="bg-red-950 border border-red-800 rounded-2xl p-8 text-red-400 text-center">
                  {error}
                </div>
              ) : (
                <div className="prose prose-invert max-w-none text-zinc-200 leading-relaxed whitespace-pre-wrap">
                  {analysis}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}