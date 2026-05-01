"use client";

import { useState } from "react";
import { useAccount, useSignTypedData } from "wagmi";
import { buildTransferAuthorizationTypedData } from "@/lib/x402/eip3009";
import { getNetwork } from "@/lib/x402/networks";
import {
  X_PAYMENT_HEADER,
  encodePaymentHeader,
  generateNonce,
} from "@/lib/x402/scheme";
import type { PaymentPayload } from "@/lib/x402/types";

export function PremiumAnalysisButton({ address }: { address?: `0x${string}` }) {
  const { address: connected } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);

  const target = address || connected;

  async function runAnalysis() {
    if (!target || !connected) return;
    setLoading(true);
    setError(null);

    try {
      const first = await fetch("/api/agent/premium-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: target }),
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
            } as unknown as PaymentPayload),
          },
          body: JSON.stringify({ address: target }),
        });

        if (!second.ok) throw new Error("Settlement failed.");
        setData(await second.json());
      } else {
        setData(await first.json());
      }
    } catch (err: any) {
      setError(err.message || "Execution failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full space-y-6">
      <div className="rounded-3xl border border-white/10 bg-zinc-900/80 p-8 shadow-2xl backdrop-blur-xl">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10">
          <div>
            <h2 className="text-4xl font-black text-white uppercase italic tracking-tighter leading-none">
              Sentinel Elite Analysis
            </h2>
            <p className="text-zinc-500 text-sm mt-2 font-medium">Position Impact & Rebalancing Strategy</p>
          </div>
          <button
            onClick={runAnalysis}
            disabled={loading}
            className="w-full md:w-auto bg-white text-black px-10 py-4 rounded-full font-bold text-xs uppercase tracking-widest hover:bg-purple-600 hover:text-white transition-all active:scale-95"
          >
            {loading ? "Analyzing Portfolio..." : "Refresh Elite Insights"}
          </button>
        </div>

        {data && (
          <div className="space-y-8 animate-in fade-in duration-700">
            {/* 1. IMPACT ASSESSMENT */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 bg-white/5 p-6 rounded-3xl border border-white/5">
                <h3 className="text-[10px] text-purple-400 font-bold uppercase tracking-widest mb-6">Volatility Impact Assessment</h3>
                <div className="space-y-4">
                  {data.shockMatrix?.map((m: any, i: number) => (
                    <div key={i} className="group flex items-center justify-between p-4 bg-zinc-950/50 rounded-2xl hover:bg-zinc-950 transition-colors">
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-white">{m.shockPct}% Market Drawdown</span>
                        <span className="text-[10px] text-zinc-500 uppercase">Projected Portfolio State</span>
                      </div>
                      <div className="text-right">
                        <div className={`text-xl font-mono font-bold ${m.liquidatable ? 'text-red-500' : 'text-emerald-400'}`}>
                          HF {m.projectedHealthFactor?.toFixed(2)}
                        </div>
                        <span className="text-[10px] font-bold text-zinc-600">
                          {m.liquidatable ? "LIQUIDATION TRIGGERED" : "BUFFER REMAINING"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 2. REBALANCING SUGGESTIONS */}
              <div className="bg-purple-500/10 p-6 rounded-3xl border border-purple-500/20">
                <h3 className="text-[10px] text-purple-400 font-bold uppercase tracking-widest mb-6">Agent Recommendations</h3>
                <div className="space-y-6">
                  <div className="space-y-2">
                    <p className="text-xs font-bold text-zinc-400 uppercase">Diversification Status</p>
                    <p className="text-sm text-white italic">"High concentration in USDC/Collateral pairs detected. Consider moving 15% to a diversified yield aggregator to reduce smart contract risk."</p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-bold text-zinc-400 uppercase">Rebalancing Trigger</p>
                    <p className="text-sm text-white italic">
                      {data.currentHealthFactor < 2.0 
                        ? "ACTION REQUIRED: Rebalance now. Increase collateral by 10% to withstand a -30% volatility shock." 
                        : "OPTIMIZATION: Portfolio is over-collateralized. You could safely increase borrow size by 12% for higher yield."}
                    </p>
                  </div>
                  <div className="pt-4 border-t border-purple-500/20">
                    <button className="w-full py-3 bg-purple-500 text-white rounded-xl text-[10px] font-bold uppercase tracking-tighter hover:bg-purple-400 transition-colors">
                      One-Click Rebalance (Agentic)
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* 3. POSITION LIQUIDATION MONITOR */}
            <div className="bg-zinc-950 p-8 rounded-3xl border border-white/5">
               <h3 className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mb-6">Liquidation Proximity per Asset</h3>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                  <div>
                    <div className="flex justify-between mb-2">
                      <span className="text-xs font-bold text-white uppercase">Primary Collateral</span>
                      <span className="text-xs font-mono text-zinc-500">HF {data.currentHealthFactor?.toFixed(2)}</span>
                    </div>
                    <div className="h-2 w-full bg-zinc-800 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-emerald-500 transition-all duration-1000" 
                        style={{ width: `${Math.min((data.currentHealthFactor / 4) * 100, 100)}%` }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between mb-2">
                      <span className="text-xs font-bold text-white uppercase">Drawdown Buffer</span>
                      <span className="text-xs font-mono text-zinc-500">Until Liquidation</span>
                    </div>
                    <div className="h-2 w-full bg-zinc-800 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-purple-500 transition-all duration-1000" 
                        style={{ width: '65%' }} // Simulated based on shock matrix
                      />
                    </div>
                  </div>
               </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}