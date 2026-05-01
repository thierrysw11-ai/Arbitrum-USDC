"use client";

import { useState } from "react";
import { useAccount, useSignTypedData } from "wagmi";
import { buildTransferAuthorizationTypedData } from "@/lib/x402/eip3009";
import { getNetwork } from "@/lib/x402/networks";
import ToolTrace from "./agent/ToolTrace"; 
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
  const [trace, setTrace] = useState<any>(null);

  const target = address || connected;

  // Helper to determine risk color
  const getRiskColor = (hf: number) => {
    if (hf > 2.5) return "text-emerald-400";
    if (hf > 1.5) return "text-yellow-400";
    return "text-red-500";
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
        if (!req) throw new Error("Payment requirements mismatch.");

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

        const payload = {
          x402Version: 1,
          scheme: "exact",
          network: "arbitrum-one",
          payload: { signature, authorization: auth },
        } as const;

        const second = await fetch("/api/agent/premium-analysis", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            [X_PAYMENT_HEADER]: encodePaymentHeader(payload as unknown as PaymentPayload),
          },
          body: JSON.stringify({ address: target }),
        });

        if (!second.ok) throw new Error("Agentic settlement failed.");
        const resultData = await second.json();
        setData(resultData);
        setTrace({ name: "x402_settlement", args: auth, result: resultData });
      } else {
        setData(await first.json());
      }
    } catch (err: any) {
      setError(err.message || "Deep-dive execution failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-purple-500/30 bg-zinc-900/50 p-8 shadow-2xl backdrop-blur-md">
        <div className="flex justify-between items-center mb-10">
          <div>
            <h2 className="text-3xl font-black text-white uppercase italic tracking-tighter">
              Sentinel Elite Analysis
            </h2>
            <p className="text-zinc-400 text-sm">Actionable risk intelligence for your positions.</p>
          </div>
          <button
            onClick={runAnalysis}
            disabled={loading || !target}
            className="bg-gradient-to-r from-purple-600 to-indigo-600 px-8 py-3 rounded-2xl font-black text-xs uppercase tracking-widest text-white transition-all active:scale-95 disabled:opacity-50"
          >
            {loading ? "Settling..." : "Execute Deep-Dive (0.01 USDC)"}
          </button>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs font-mono">
            SYSTEM_ERROR: {error}
          </div>
        )}

        {trace && <ToolTrace name={trace.name} args={trace.args} result={trace.result} />}

        {data && (
          <div className="mt-8 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Visual Risk Gauge */}
            <div className="bg-zinc-950 p-6 rounded-2xl border border-white/5 relative overflow-hidden">
               <div className="flex justify-between items-end mb-4">
                  <div>
                    <div className="text-[10px] text-zinc-500 font-bold uppercase mb-1">Position Health Score</div>
                    <div className={`text-4xl font-mono font-black ${getRiskColor(data.currentHealthFactor)}`}>
                      {data.currentHealthFactor?.toFixed(2)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] text-zinc-500 font-bold uppercase mb-1">Max Drawdown Tolerance</div>
                    <div className="text-xl font-mono font-bold text-white">-{data.shockMatrix?.[0]?.shockPct || '0'}%</div>
                  </div>
               </div>
               {/* Simple CSS Gauge */}
               <div className="h-2 w-full bg-zinc-800 rounded-full overflow-hidden">
                  <div 
                    className={`h-full transition-all duration-1000 ${data.currentHealthFactor > 2 ? 'bg-emerald-500' : 'bg-red-500'}`}
                    style={{ width: `${Math.min((data.currentHealthFactor / 5) * 100, 100)}%` }}
                  />
               </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Strategy Recommendations */}
              <div className="bg-white/5 p-5 rounded-xl border border-purple-500/20">
                <div className="text-[10px] text-purple-400 font-bold uppercase mb-3">Guardian Recommendation</div>
                <div className="text-sm text-zinc-300 leading-relaxed italic">
                  {data.currentHealthFactor < 1.5 
                    ? "URGENT: Health factor low. Add collateral or reduce debt to avoid liquidation in a high-volatility event."
                    : data.currentHealthFactor > 3.0 
                    ? "Under-leveraged: Your position is highly safe. You could potentially increase size by 15% to optimize yield."
                    : "Stable: Maintain current levels. Rebalance if Health Factor drops below 1.8."}
                </div>
              </div>

              {/* Price Shock Table */}
              <div className="bg-white/5 p-5 rounded-xl border border-white/5">
                <div className="text-[10px] text-zinc-500 font-bold uppercase mb-3">Volatility Stress Test</div>
                <div className="space-y-2">
                  {data.shockMatrix?.slice(0, 3).map((m: any, i: number) => (
                    <div key={i} className="flex justify-between text-[11px] font-mono border-b border-white/5 pb-1 last:border-0">
                      <span className="text-zinc-400">{m.shockPct}% Price Drop:</span>
                      <span className={m.liquidatable ? "text-red-500 font-bold" : "text-emerald-500"}>
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