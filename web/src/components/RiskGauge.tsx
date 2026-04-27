'use client';

import React from 'react';

interface RiskGaugeProps {
  healthFactor: number;
}

const RiskGauge = ({ healthFactor }: RiskGaugeProps) => {
  // 1. Logic: Map HF to a rotation angle (1.0 = Red, 2.0+ = Green)
  // Max visible HF on gauge is 3.0
  const normalizedHF = Math.min(Math.max(healthFactor, 1), 3);
  const percentage = ((normalizedHF - 1) / 2) * 100;
  
  // 2. Styling based on risk
  const getStatus = () => {
    if (healthFactor < 1.1) return { label: 'CRITICAL', color: '#ef4444' };
    if (healthFactor < 1.5) return { label: 'RISKY', color: '#f59e0b' };
    return { label: 'SAFE POSITION', color: '#22c55e' };
  };

  const status = getStatus();

  return (
    <div className="bg-[#0f172a] border border-gray-800 rounded-xl p-6 flex flex-col items-center justify-center relative overflow-hidden">
      <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-4">Aave V3 Risk Profile</h3>
      
      <div className="relative w-48 h-24">
        {/* Semi-circle Background */}
        <svg viewBox="0 0 100 50" className="w-full h-full">
          <path
            d="M 10 50 A 40 40 0 0 1 90 50"
            fill="none"
            stroke="#1e293b"
            strokeWidth="8"
            strokeLinecap="round"
          />
          {/* Active Risk Path */}
          <path
            d="M 10 50 A 40 40 0 0 1 90 50"
            fill="none"
            stroke={status.color}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray="126"
            strokeDashoffset={126 - (126 * percentage) / 100}
            className="transition-all duration-1000 ease-out"
          />
        </svg>

        {/* The Big Number */}
        <div className="absolute inset-0 flex flex-col items-center justify-end">
          <span className="text-4xl font-black text-white leading-none">
            {healthFactor > 100 ? '100+' : healthFactor.toFixed(2)}
          </span>
          <span className="text-[10px] font-bold text-gray-500 mt-1 uppercase">Health Factor</span>
        </div>
      </div>

      {/* Status Badge */}
      <div 
        className="mt-6 px-4 py-1 rounded-full text-[10px] font-black border"
        style={{ borderColor: status.color, color: status.color, backgroundColor: `${status.color}10` }}
      >
        {status.label}
      </div>
    </div>
  );
};

export default RiskGauge;