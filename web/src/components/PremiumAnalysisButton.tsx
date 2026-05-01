'use client';

import React, { useState } from 'react';
import { useUserPositions } from '@/hooks/useUserPositions';
import { Zap, ShieldAlert, TrendingDown, TrendingUp } from 'lucide-react';

export function PremiumAnalysisButton() {
  const [isOpen, setIsOpen] = useState(false);
  const { positions, isLoading } = useUserPositions();

  return (
    <div className="relative">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="group relative flex items-center gap-3 px-8 py-4 bg-white text-black rounded-full font-black uppercase italic tracking-tighter hover:scale-105 transition-all shadow-[0_0_40px_rgba(255,255,255,0.2)] active:scale-95"
      >
        <Zap className={`${isOpen ? 'fill-purple-600 animate-pulse' : 'fill-black'}`} size={18} />
        {isOpen ? 'Hide Insights' : 'Run Elite Analysis'}
      </button>

      {isOpen && (
        <div className="absolute top-full mt-6 right-0 w-[450px] bg-zinc-900 border border-white/10 rounded-[2.5rem] p-8 shadow-3xl z-50 animate-in fade-in slide-in-from-top-4 overflow-hidden">
          {/* Decorative background flare */}
          <div className="absolute -top-24 -right-24 w-48 h-48 bg-purple-600/20 blur-[60px] pointer-events-none" />

          <h3 className="text-2xl font-black italic uppercase mb-6 tracking-tighter text-white flex items-center gap-2">
            Sentinel <span className="text-zinc-500">Elite</span> Analysis
          </h3>

          <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
            {isLoading ? (
              <div className="py-12 flex flex-col items-center justify-center gap-3">
                <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Scanning Reserves...</p>
              </div>
            ) : positions.length > 0 ? (
              positions.map((pos) => (
                <div key={pos.symbol} className="group p-5 bg-white/5 rounded-3xl border border-white/5 hover:border-purple-500/40 transition-all">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <span className="text-lg font-black text-white">{pos.symbol}</span>
                      <p className="text-[9px] text-zinc-500 font-bold uppercase tracking-widest">
                        {pos.debt > 0 ? 'Active Liability' : 'Collateral Asset'}
                      </p>
                    </div>
                    <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter ${
                      pos.debt > 0 ? 'bg-red-500/10 text-red-400' : 'bg-emerald-500/10 text-emerald-400'
                    }`}>
                      {pos.debt > 0 ? `-$${pos.debt.toFixed(2)}` : `+$${pos.supply.toFixed(2)}`}
                    </div>
                  </div>
                  
                  <p className="text-xs text-zinc-300 leading-relaxed italic opacity-80 group-hover:opacity-100 transition-opacity">
                    "{pos.implication}"
                  </p>
                </div>
              ))
            ) : (
              <div className="text-center py-10">
                <Info className="mx-auto text-zinc-700 mb-2" size={24} />
                <p className="text-sm text-zinc-500 italic">No active Aave V3 positions detected.</p>
              </div>
            )}
          </div>

          {positions.length > 0 && !isLoading && (
            <div className="mt-8 pt-6 border-t border-white/5">
               <div className="flex items-center gap-2 text-purple-400 mb-3">
                  <ShieldAlert size={14} />
                  <span className="text-[10px] font-black uppercase tracking-widest">Global Risk Assessment</span>
               </div>
               <div className="p-4 bg-purple-500/5 rounded-2xl border border-purple-500/10">
                 <p className="text-[11px] text-zinc-400 leading-relaxed italic">
                    Agent Feedback: Your portfolio is currently <strong>Hedged</strong>. Your <strong>WBTC debt</strong> acts as a buffer; if the market crashes, your debt value decreases faster than your <strong>USDC collateral</strong>, effectively increasing your Health Factor.
                 </p>
               </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Info({ className, size }: { className?: string; size?: number }) {
  return (
    <svg 
      className={className} 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>
    </svg>
  );
}