'use client';

import React, { useState } from 'react';
import { useUserPositions } from '@/hooks/useUserPositions';
import { Zap, X, ShieldAlert, TrendingDown } from 'lucide-react';

export function PremiumAnalysisButton() {
  const [isOpen, setIsOpen] = useState(false);
  const { positions, isLoading } = useUserPositions();

  return (
    <>
      {/* 1. THE TRIGGER BUTTON */}
      <button 
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-3 px-8 py-4 bg-white text-black rounded-full font-black uppercase italic tracking-tighter hover:scale-105 transition-all shadow-2xl active:scale-95"
      >
        <Zap className="fill-black" size={18} />
        Run Elite Analysis
      </button>

      {/* 2. THE OVERLAY PANEL (Fixed to ignore parent overflow) */}
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
          {/* Blur Backdrop */}
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-md animate-in fade-in duration-300" 
            onClick={() => setIsOpen(false)}
          />

          {/* Analysis Card */}
          <div className="relative w-full max-w-2xl bg-zinc-900 border border-white/10 rounded-[2.5rem] p-8 shadow-[0_0_50px_rgba(0,0,0,0.5)] animate-in zoom-in-95 duration-200 overflow-hidden">
            <button 
              onClick={() => setIsOpen(false)}
              className="absolute top-6 right-6 p-2 text-zinc-500 hover:text-white transition-colors"
            >
              <X size={24} />
            </button>

            <h3 className="text-3xl font-black italic uppercase mb-8 tracking-tighter text-white">
              Sentinel <span className="text-zinc-500">Elite</span> Analysis
            </h3>

            {/* Position List */}
            <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-2 custom-scrollbar">
              {isLoading ? (
                <p className="text-zinc-500 italic animate-pulse">Syncing Aave Protocol Data...</p>
              ) : positions.length > 0 ? (
                positions.map((pos) => (
                  <div key={pos.symbol} className="p-6 bg-white/5 rounded-3xl border border-white/5 hover:border-purple-500/30 transition-all group">
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-xl font-black uppercase italic text-white">{pos.symbol}</span>
                      <span className={`text-[10px] px-3 py-1 rounded-full font-black uppercase ${
                        pos.debt > 0 ? 'bg-red-500/10 text-red-400' : 'bg-emerald-500/10 text-emerald-400'
                      }`}>
                        {pos.debt > 0 ? 'Short/Debt' : 'Long/Collateral'}
                      </span>
                    </div>
                    <p className="text-sm text-zinc-400 leading-relaxed italic group-hover:text-zinc-200 transition-colors">
                      "{pos.implication}"
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-zinc-500 italic">No active positions found in this wallet.</p>
              )}
            </div>

            {/* Global Summary */}
            {!isLoading && positions.length > 0 && (
              <div className="mt-8 pt-6 border-t border-white/5">
                <div className="flex items-center gap-3 p-4 bg-purple-500/10 rounded-2xl border border-purple-500/20">
                  <ShieldAlert className="text-purple-400 shrink-0" size={20} />
                  <p className="text-xs text-zinc-300 italic font-medium leading-relaxed">
                    Agent Intelligence: Your USDC collateral is currently stabilizing a WBTC debt. 
                    This setup means you are mathematically safer during a market crash.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}