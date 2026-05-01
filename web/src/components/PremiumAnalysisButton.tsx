import React, { useState } from 'react';
import { useUserPositions } from '@/hooks/useUserPositions';
import { ShieldAlert, Zap, ArrowRight, Info } from 'lucide-react';

export function PremiumAnalysisButton() {
  const [isOpen, setIsOpen] = useState(false);
  const { positions, isLoading } = useUserPositions();

  return (
    <div className="relative">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="group relative flex items-center gap-3 px-8 py-4 bg-white text-black rounded-full font-black uppercase italic tracking-tighter hover:scale-105 transition-all shadow-[0_0_40px_rgba(255,255,255,0.2)]"
      >
        <Zap className="fill-black" size={18} />
        {isOpen ? 'Close Analysis' : 'Run Elite Analysis'}
      </button>

      {isOpen && (
        <div className="absolute top-full mt-6 right-0 w-[450px] bg-zinc-900 border border-white/10 rounded-[2rem] p-8 shadow-3xl z-50 animate-in fade-in slide-in-from-top-4">
          <h3 className="text-2xl font-black italic uppercase mb-6 tracking-tighter text-white">
            Position <span className="text-zinc-500">Implications</span>
          </h3>

          <div className="space-y-4">
            {positions.length > 0 ? positions.map((pos) => (
              <div key={pos.symbol} className="p-4 bg-white/5 rounded-2xl border border-white/5 hover:border-purple-500/30 transition-colors">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-bold text-zinc-300">{pos.symbol}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${pos.debt > 0 ? 'bg-red-500/10 text-red-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
                    {pos.debt > 0 ? 'Debt' : 'Collateral'}
                  </span>
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed italic">
                   "{pos.implication}"
                </p>
                <div className="mt-3 flex justify-between text-[10px] font-mono text-zinc-500 uppercase">
                  <span>Size: {pos.supply > 0 ? pos.supply.toFixed(4) : pos.debt.toFixed(4)}</span>
                  <span>Impact: {pos.symbol === 'USDC' ? 'Stability' : 'Volatility'}</span>
                </div>
              </div>
            )) : (
              <p className="text-zinc-500 text-sm italic">No active positions detected on Arbitrum One.</p>
            )}
          </div>

          <div className="mt-8 pt-6 border-t border-white/5">
             <div className="flex items-center gap-2 text-purple-400 mb-2">
                <ShieldAlert size={14} />
                <span className="text-[10px] font-black uppercase">Agentic Risk Summary</span>
             </div>
             <p className="text-xs text-zinc-400 italic">
                Your portfolio is currently <strong>{positions.some(p => p.symbol === 'WBTC' && p.debt > 0) ? 'Hedged' : 'Long'}</strong>. 
                A market crash would effectively reduce your debt burden.
             </p>
          </div>
        </div>
      )}
    </div>
  );
}