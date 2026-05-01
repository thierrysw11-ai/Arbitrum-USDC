'use client';

import React, { useState, useEffect } from 'react';
import { useUserPositions } from '@/hooks/useUserPositions';
import { Zap, X, ShieldAlert, TrendingUp, TrendingDown, Wallet, Activity } from 'lucide-react';

export function PremiumAnalysisButton() {
  const [isOpen, setIsOpen] = useState(false);
  const { positions, isLoading } = useUserPositions();

  // Prevent background scrolling when modal is open
  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = 'unset';
  }, [isOpen]);

  return (
    <>
      {/* TRIGGER BUTTON: Features a subtle glow effect */}
      <button 
        onClick={() => setIsOpen(true)}
        className="group relative flex items-center gap-3 px-10 py-5 bg-white text-black rounded-full font-black uppercase italic tracking-tighter transition-all hover:scale-105 hover:shadow-[0_0_30px_rgba(255,255,255,0.3)] active:scale-95"
      >
        <Zap className="fill-black group-hover:animate-pulse" size={20} />
        Run Elite Analysis
        <div className="absolute inset-0 rounded-full border border-white/50 scale-100 group-hover:scale-110 opacity-0 group-hover:opacity-100 transition-all duration-500" />
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8">
          {/* BACKDROP: High-end blur */}
          <div 
            className="absolute inset-0 bg-black/80 backdrop-blur-xl animate-in fade-in duration-500" 
            onClick={() => setIsOpen(false)}
          />

          {/* MAIN CARD */}
          <div className="relative w-full max-w-3xl bg-zinc-950 border border-white/10 rounded-[3rem] shadow-[0_0_80px_rgba(0,0,0,1)] animate-in zoom-in-95 slide-in-from-bottom-10 duration-500 overflow-hidden">
            
            {/* Top Branding Bar */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-purple-500 to-transparent opacity-50" />

            <div className="p-10">
              <header className="flex justify-between items-start mb-10">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-2 h-2 rounded-full bg-purple-500 animate-ping" />
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-purple-400">System Intelligence Active</span>
                  </div>
                  <h3 className="text-4xl font-black italic uppercase tracking-tighter text-white">
                    Sentinel <span className="text-zinc-600">Elite</span> <br/>
                    Risk Assessment
                  </h3>
                </div>
                <button 
                  onClick={() => setIsOpen(false)}
                  className="p-3 bg-white/5 rounded-full text-zinc-500 hover:text-white hover:bg-white/10 transition-all"
                >
                  <X size={24} />
                </button>
              </header>

              {/* DYNAMIC CONTENT AREA */}
              <div className="space-y-6 max-h-[55vh] overflow-y-auto pr-4 custom-scrollbar">
                {isLoading ? (
                  <div className="py-20 flex flex-col items-center gap-4">
                    <Activity className="animate-spin text-purple-500" size={40} />
                    <p className="text-zinc-500 font-bold uppercase italic tracking-widest text-xs">Decrypting Blockchain Data...</p>
                  </div>
                ) : positions.length > 0 ? (
                  positions.map((pos, i) => (
                    <div 
                      key={pos.symbol} 
                      className="relative overflow-hidden p-8 bg-gradient-to-br from-white/[0.03] to-transparent rounded-[2rem] border border-white/5 hover:border-purple-500/40 transition-all group"
                      style={{ animationDelay: `${i * 100}ms` }}
                    >
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex items-center gap-4">
                          <div className={`p-3 rounded-2xl ${pos.isDebt ? 'bg-red-500/10 text-red-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
                            {pos.isDebt ? <TrendingDown size={24} /> : <TrendingUp size={24} />}
                          </div>
                          <div>
                            <span className="text-2xl font-black uppercase italic text-white tracking-tighter">{pos.symbol}</span>
                            <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">
                               Market {pos.isDebt ? 'Liability' : 'Exposure'}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-xl font-mono font-black text-white">{Number(pos.amount).toFixed(4)}</p>
                          <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">Current Volume</p>
                        </div>
                      </div>

                      <div className="relative z-10 p-4 bg-black/40 rounded-xl border border-white/5">
                        <p className="text-sm text-zinc-300 leading-relaxed italic">
                          "{pos.implication}"
                        </p>
                      </div>
                      
                      {/* Decorative background element */}
                      <div className="absolute -bottom-4 -right-4 text-white/[0.02] font-black italic text-8xl pointer-events-none select-none">
                        {pos.symbol}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="py-20 text-center bg-white/5 rounded-[2rem] border border-dashed border-white/10">
                    <Wallet className="mx-auto text-zinc-700 mb-4" size={48} />
                    <p className="text-zinc-500 font-bold uppercase italic">No active Aave V3 positions detected.</p>
                  </div>
                )}
              </div>

              {/* FOOTER INTELLIGENCE SUMMARY */}
              {!isLoading && positions.length > 0 && (
                <footer className="mt-10 pt-8 border-t border-white/5">
                  <div className="flex items-start gap-5 p-6 bg-purple-500/5 rounded-3xl border border-purple-400/20 shadow-[inset_0_0_20px_rgba(168,85,247,0.05)]">
                    <div className="p-3 bg-purple-500/20 rounded-2xl text-purple-400">
                      <ShieldAlert size={24} />
                    </div>
                    <div>
                      <h4 className="text-purple-400 font-black uppercase italic text-xs mb-1 tracking-widest">Agent Assessment</h4>
                      <p className="text-sm text-zinc-300 italic leading-relaxed">
                        Your <strong className="text-white">USDC collateral</strong> is providing a stable floor for your 
                        <strong className="text-white"> WBTC debt</strong>. In a market downturn, your health factor will 
                        improve as the value of your debt decreases—this is an <span className="text-purple-400 font-bold underline underline-offset-4">Elite Hedge</span> configuration.
                      </p>
                    </div>
                  </div>
                </footer>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}