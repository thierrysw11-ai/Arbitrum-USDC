'use client';

import React, { useState } from 'react';
import { useAccount, useReadContract } from 'wagmi';
import { formatUnits } from 'viem';
import { Zap, ShieldAlert, Loader2 } from 'lucide-react';

// AAVE V3 POOL ON ARBITRUM
const POOL_ADDRESS = '0x794a61358D6845594F94dc1DB02A252b5b4814aD';
const POOL_ABI = [{
    name: 'getUserAccountData',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [
        { name: 'totalCollateralBase', type: 'uint256' },
        { name: 'totalDebtBase', type: 'uint256' },
        { name: 'availableBorrowsBase', type: 'uint256' },
        { name: 'currentLiquidationThreshold', type: 'uint256' },
        { name: 'ltv', type: 'uint256' },
        { name: 'healthFactor', type: 'uint256' },
    ],
}] as const;

export function PremiumAnalysisButton() {
    const [isOpen, setIsOpen] = useState(false);
    const { address, isConnected } = useAccount();

    const { data, isLoading } = useReadContract({
        address: POOL_ADDRESS,
        abi: POOL_ABI,
        functionName: 'getUserAccountData',
        args: address ? [address] : undefined,
        query: { enabled: isOpen && !!address }
    });

    // Extracting the data safely
    const healthFactor = data ? Number(formatUnits(data[5], 18)) : 0;
    const hasDebt = data ? data[1] > 0n : false;

    return (
        <div className="relative">
            <button 
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-3 px-8 py-4 bg-white text-black rounded-full font-black uppercase italic hover:scale-105 transition-all shadow-xl"
            >
                <Zap className={isOpen ? "fill-purple-600" : "fill-black"} size={18} />
                {isOpen ? 'Close Analysis' : 'Run Elite Analysis'}
            </button>

            {isOpen && (
                <div className="absolute top-full mt-6 right-0 w-[400px] bg-zinc-900 border border-white/10 rounded-[2rem] p-8 shadow-3xl z-50">
                    <h3 className="text-xl font-black uppercase italic mb-4">Position Insight</h3>
                    
                    {isLoading ? (
                        <div className="flex flex-col items-center py-10 gap-4">
                            <Loader2 className="animate-spin text-purple-500" />
                            <p className="text-[10px] uppercase font-bold text-zinc-500">Syncing with Arbitrum Node...</p>
                        </div>
                    ) : isConnected ? (
                        <div className="space-y-6">
                            <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
                                <p className="text-[10px] text-zinc-500 uppercase font-black mb-1">Health Factor</p>
                                <p className={`text-2xl font-mono font-black ${healthFactor > 2 ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {healthFactor > 100 ? '∞' : healthFactor.toFixed(2)}
                                </p>
                            </div>

                            <div className="p-4 bg-purple-500/10 rounded-2xl border border-purple-500/20">
                                <div className="flex items-center gap-2 text-purple-400 mb-2">
                                    <ShieldAlert size={14} />
                                    <span className="text-[10px] font-black uppercase">Elite Recommendation</span>
                                </div>
                                <p className="text-xs text-zinc-300 italic leading-relaxed">
                                    {hasDebt 
                                        ? "Positions detected: Your WBTC debt effectively shorts the asset. A market crash will increase your safety margin."
                                        : "No active debt. Your USDC collateral is idle. Consider a low-LTV borrow to increase capital efficiency."}
                                </p>
                            </div>
                        </div>
                    ) : (
                        <p className="text-zinc-500 italic text-sm text-center">Please connect wallet to analyze risk.</p>
                    )}
                </div>
            )}
        </div>
    );
}