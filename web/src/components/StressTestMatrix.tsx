'use client';

import React from 'react';

interface StressTestProps {
  currentHF: number;
}

export default function StressTestMatrix({ currentHF }: StressTestProps) {
  const shocks = [
    { label: 'Mild Volatility', drop: '-10%', multiplier: 0.9 },
    { label: 'Market Correction', drop: '-30%', multiplier: 0.7 },
    { label: 'Black Swan Event', drop: '-50%', multiplier: 0.5 }
  ];

  return (
    <div className="mt-8 space-y-3">
      <h4 className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest px-1">Risk Simulations</h4>
      <div className="grid grid-cols-1 gap-2">
        {shocks.map((shock) => {
          const projectedHF = (currentHF * shock.multiplier).toFixed(2);
          const isDanger = parseFloat(projectedHF) <= 1.0;

          return (
            <div key={shock.drop} className="flex items-center justify-between p-4 bg-black/40 border border-white/5 rounded-2xl hover:bg-black/60 transition-colors">
              <div>
                <p className="text-xs font-bold text-white">{shock.label}</p>
                <p className="text-[10px] text-zinc-500 font-mono">{shock.drop} Collateral Value</p>
              </div>
              <div className="text-right">
                <p className={`text-sm font-black font-mono ${isDanger ? 'text-red-500' : 'text-purple-400'}`}>
                  HF: {projectedHF}
                </p>
                <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded ${isDanger ? 'bg-red-500/10 text-red-500' : 'bg-purple-500/10 text-purple-400'}`}>
                  {isDanger ? 'Liquidation' : 'Stable'}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}