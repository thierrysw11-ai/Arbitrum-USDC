"use client";

import { useState } from "react";
import { useAccount, useSignTypedData } from "wagmi";
import { buildTransferAuthorizationTypedData } from "@/lib/x402/eip3009";
import { getNetwork } from "@/lib/x402/networks";
import { baseToUsd, formatUsd } from "@/lib/aave/math";
import type { UserAccountData } from "@/lib/aave/types";
import {
  X_PAYMENT_HEADER,
  encodePaymentHeader,
  generateNonce,
} from "@/lib/x402/scheme";

// Pass 'account' as a prop so the button knows your positions
export function PremiumAnalysisButton({ 
  address, 
  account 
}: { 
  address?: `0x${string}`, 
  account: UserAccountData 
}) {
  const { address: connected } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);

  // Calculate position weightings locally based on your Aave account data
  const totalCollateral = baseToUsd(account.totalCollateralBase);
  const totalDebt = baseToUsd(account.totalDebtBase);

  async function runAnalysis() {
    if (!connected) return;
    setLoading(true);
    try {
      const first = await fetch("/api/agent/premium-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: address || connected }),
      });

      if (first.status === 402) {
        const { accepts } = await first.json();
        const req = accepts.find((a: any) => a.network === "arbitrum-one");
        const network = getNetwork("arbitrum-one");
        const auth = {
          from: connected,
          to: req.payTo as `0x${string}`,
          value: req.maxAmountRequired || "10000",
          validAfter: "0",
          validBefore: String(Math.floor(Date.now() / 1000) + 3600),
          nonce: generateNonce(),
        };

        const signature = await signTypedDataAsync(buildTransferAuthorizationTypedData(network, auth));

        const second = await fetch("/api/agent/premium-analysis", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            [X_PAYMENT_HEADER]: encodePaymentHeader({
              x402Version: 1,
              scheme: "exact",
              network: "arbitrum-one",
              payload: { signature, authorization: auth },
            } as any),
          },
          body: JSON.stringify({ address: address || connected }),
        });

        setData(await second.json());
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full space-y-6">
      <div className="rounded-3xl border border-white/10 bg-zinc-900/80 p-8 shadow-2xl backdrop-blur-xl">
        <div className="flex justify-between items-center mb-10">
          <h2 className="text-3xl font-black text-white uppercase italic tracking-tighter">Elite Portfolio Forensics</h2>
          <button
            onClick={runAnalysis}
            disabled={loading}
            className="bg-white text-black px-8 py-3 rounded-full font-bold text-xs uppercase hover:bg-purple-500 hover:text-white transition-all"
          >
            {loading ? "Sycning Agent..." : "Execute Elite Analysis"}
          </button>
        </div>

        {data && (
          <div className="space-y-8">
            {/* NEW: Position Weighting Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white/5 p-6 rounded-3xl border border-white/5">
                <h3 className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mb-4">Collateral Composition</h3>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-white">USDC Position</span>
                    <span className="text-sm font-mono text-zinc-400">{formatUsd(totalCollateral)}</span>
                  </div>
                  <div className="h-2 w-full bg-zinc-800 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500" style={{ width: '100%' }} />
                  </div>
                  <p className="text-[10px] text-zinc-500 italic">Relative Weight: 100% (Highly Concentrated)</p>
                </div>
              </div>

              <div className="bg-white/5 p-6 rounded-3xl border border-white/5">
                <h3 className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mb-4">Debt Weighting</h3>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-white">Active Borrows</span>
                    <span className="text-sm font-mono text-zinc-400">{formatUsd(totalDebt)}</span>
                  </div>
                  <div className="h-2 w-full bg-zinc-800 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-red-500" 
                      style={{ width: `${(totalDebt / totalCollateral) * 100}%` }} 
                    />
                  </div>
                  <p className="text-[10px] text-zinc-500 italic">Loan-to-Value Ratio: {((totalDebt / totalCollateral) * 100).toFixed(2)}%</p>
                </div>
              </div>
            </div>

            {/* Recommendations & Shock Matrix (Existing logic) */}
            <div className="bg-purple-500/10 p-6 rounded-3xl border border-purple-500/20">
              <h3 className="text-[10px] text-purple-400 font-bold uppercase tracking-widest mb-2">Guardian Strategy</h3>
              <p className="text-sm text-white leading-relaxed">
                "Your portfolio is {((totalDebt / totalCollateral) * 100) > 50 ? 'aggressive' : 'conservative'}. 
                Concentration in USDC is high. Consider diversifying collateral to BTC or ETH to improve resilience against single-asset de-pegs."
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}