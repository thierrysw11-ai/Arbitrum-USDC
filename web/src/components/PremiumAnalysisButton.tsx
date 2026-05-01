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

  const getRiskColor = (hf: number) => {
    if (hf > 2.0) return "bg-emerald-500";
    if (hf > 1.5) return "bg-yellow-500";
    return "bg-red-500";
  };

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
    <div className="w-full">
      <div className="rounded-3xl border border-white/10 bg-zinc-900/80 p-8 shadow-2xl backdrop-blur-xl">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10">
          <div>
            <h2 className="text-4xl font-black text-white uppercase italic tracking-tighter leading-none">
              Sentinel Elite Analysis
            </h2>
            <p className="text-zinc-500 text-sm mt-2 font-medium">Verified Agentic Risk Intelligence</p>
          </div>
          <button
            onClick={runAnalysis}
            disabled={loading}
            className="w-full md:w-auto bg-white text-black px-10 py-4 rounded-full font-bold text-xs uppercase tracking-widest hover:bg-purple-500 hover:text-white transition-all active:scale-95 disabled:opacity-50"
          >
            {loading ? "Authorizing..." : "Execute Deep-Dive (0.01 USDC)"}
          </button>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400 text-xs font-mono">
            Error: {error}
          </div>
        )}

        {data && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
            {/* Main Score Card */}
            <div className="bg-white/5 p-8 rounded-3xl border border-white/5">
               <div className="flex justify-between items-center mb-6">
                  <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">Live Health Factor</span>
                  <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">Risk Tolerance: High</span>
               </div>
               <div className="flex items-baseline gap-2 mb-6">
                  <span className="text-6xl font-mono font-black text-white">
                    {data.currentHealthFactor?.toFixed(2)}
                  </span>
               </div>
               <div className="h-3 w-full bg-zinc-800 rounded-full">
                  <div 
                    className={`h-full rounded-full transition-all duration-1000 ${getRiskColor(data.currentHealthFactor)}`}
                    style={{ width: `${Math.min((data.currentHealthFactor / 4) * 100, 100)}%` }}
                  />
               </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Guardian Insights */}
              <div className="bg-purple-500/5 p-6 rounded-3xl border border-purple-500/10">
                <h3 className="text-[10px] text-purple-400 font-bold uppercase tracking-widest mb-4">Guardian Recommendation</h3>
                <p className="text-lg text-white font-medium italic leading-relaxed">
                  {data.currentHealthFactor > 2.0 
                    ? "Position is highly stable. Minimal risk of liquidation within current volatility bounds."
                    : "Caution: Monitoring required. Volatility may impact liquidation thresholds soon."}
                </p>
              </div>

              {/* Stress Test */}
              <div className="bg-white/5 p-6 rounded-3xl border border-white/5">
                <h3 className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mb-4">Shock Matrix</h3>
                <div className="space-y-3">
                  {data.shockMatrix?.slice(0, 3).map((m: any, i: number) => (
                    <div key={i} className="flex justify-between items-center py-2 border-b border-white/5 last:border-0">
                      <span className="text-sm text-zinc-400">Price Drop {m.shockPct}%</span>
                      <span className={`font-mono font-bold ${m.liquidatable ? 'text-red-500' : 'text-white'}`}>
                        HF {m.projectedHealthFactor?.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}