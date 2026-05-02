'use client';

import React, { useState } from 'react';
import { X, Zap, Shield, TrendingUp } from 'lucide-react';

interface PremiumAnalysisButtonProps {
  address?: `0x${string}`;
}

export function PremiumAnalysisButton({ address }: PremiumAnalysisButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runAnalysis = async () => {
    if (!address) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/agent/premium-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Settlement failed');
      }

      setAnalysis(data.report || data.analysis);
    } catch (err: any) {
      setError(err.message || 'Failed to execute deep-dive analysis');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="group relative flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-500 hover:to-violet-500 rounded-2xl font-semibold text-white transition-all active:scale-95 shadow-lg shadow-purple-500/30"
      >
        <Zap className="w-5 h-5" />
        Run Sentinel Elite Analysis
      </button>

      {/* Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl">
          <div className="relative w-full max-w-3xl bg-zinc-950 border border-zinc-700 rounded-3xl overflow-hidden">
            
            {/* Header */}
            <div className="p-8 border-b border-zinc-800 flex items-center justify-between">
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
                  <Shield className="w-16 h-16 text-purple-400 mb-6" />
                  <h3 className="text-2xl font-semibold mb-3">Ready for Deep Analysis?</h3>
                  <p className="text-zinc-400 max-w-md mb-8">
                    This will execute a 0.01 USDC x402 settlement and return a full Sentinel Elite Risk Assessment.
                  </p>
                  <button
                    onClick={runAnalysis}
                    disabled={isLoading}
                    className="px-12 py-4 bg-gradient-to-r from-purple-600 to-violet-600 rounded-2xl font-semibold text-lg disabled:opacity-50 flex items-center gap-3"
                  >
                    {isLoading ? 'Executing Deep-Dive...' : 'EXECUTE DEEP-DIVE (0.01 USDC)'}
                    <Zap className="w-5 h-5" />
                  </button>
                </div>
              ) : error ? (
                <div className="bg-red-950/50 border border-red-800 rounded-2xl p-8 text-red-400 text-center">
                  {error}
                </div>
              ) : (
                <div className="prose prose-invert max-w-none text-zinc-300 leading-relaxed">
                  {analysis}
                </div>
              )}
            </div>

            {/* Footer Actions */}
            {analysis && (
              <div className="p-8 border-t border-zinc-800 flex gap-4">
                <button 
                  onClick={() => setIsOpen(false)}
                  className="flex-1 py-4 bg-zinc-800 hover:bg-zinc-700 rounded-2xl font-medium"
                >
                  Close
                </button>
                <button 
                  onClick={runAnalysis}
                  className="flex-1 py-4 bg-purple-600 hover:bg-purple-500 rounded-2xl font-medium"
                >
                  Run New Analysis
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}