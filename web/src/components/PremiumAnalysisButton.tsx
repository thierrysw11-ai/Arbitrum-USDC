"use client";

import { useState } from "react";
import { useAccount, useSignTypedData } from "wagmi";
import { buildTransferAuthorizationTypedData } from "@/lib/x402/eip3009";
import { getNetwork } from "@/lib/x402/networks";
import {
  X_PAYMENT_HEADER,
  X_PAYMENT_RESPONSE_HEADER,
  encodePaymentHeader,
  generateNonce,
} from "@/lib/x402/scheme";
import type {
  PaymentPayload,
  PaymentRequiredResponse,
  PaymentRequirement,
} from "@/lib/x402/types";

// --- Types ---
interface ShockRow {
  shockPct: number;
  projectedHealthFactor: number | null;
  liquidatable: boolean;
}

interface SentinelEliteResponse {
  utilization: number;
  slope2: number;
  optimalUsage: number;
  apySpread: number;
  projectedGain: number;
  note: string;
  shockMatrix: ShockRow[];
}

export function PremiumAnalysisButton({ address }: { address?: `0x${string}` }) {
  const { address: connected } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<SentinelEliteResponse | null>(null);
  const [settle, setSettle] = useState<any>(null);

  const target = address || connected;

  async function runAnalysis() {
    if (!target || !connected) return;
    setLoading(true);
    setError(null);

    try {
      // 1. Initial request to trigger the x402 402-Payment Required response
      const initialBody = JSON.stringify({ address: target });
      const first = await fetch("/api/agent/premium-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: initialBody,
      });

      if (first.status !== 402) {
        if (!first.ok) throw new Error(`Server error: ${first.status}`);
        setData(await first.json());
        setLoading(false);
        return;
      }

      // 2. Handle x402 Payment Handshake
      const offer = (await first.json()) as PaymentRequiredResponse;
      const requirement = offer.accepts.find(r => r.network === "arbitrum-one");
      
      if (!requirement) throw new Error("Arbitrum payment path unavailable.");

      const network = getNetwork(requirement.network);
      const now = Math.floor(Date.now() / 1000);
      const auth = {
        from: connected,
        to: requirement.payTo as `0x${string}`,
        value: requirement.maxAmountRequired,
        validAfter: "0",
        validBefore: String(now + 300),
        nonce: generateNonce(),
      };
      
      const typedData = buildTransferAuthorizationTypedData(network, auth);
      const signature = await signTypedDataAsync({
        domain: typedData.domain,
        types: typedData.types,
        primaryType: typedData.primaryType,
        message: typedData.message,
      });

      const payload: PaymentPayload = {
        x402Version: 1,
        scheme: "exact",
        network: "arbitrum-one",
        payload: { signature, authorization: auth },
      };

      // 3. Final execution with payment header
      const second = await fetch("/api/agent/premium-analysis", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [X_PAYMENT_HEADER]: encodePaymentHeader(payload),
        },
        body: initialBody,
      });

      if (!second.ok) throw new Error("Agentic settlement failed.");

      const settleHeader = second.headers.get(X_PAYMENT_RESPONSE_HEADER);
      if (settleHeader) {
        try { setSettle(JSON.parse(atob(settleHeader))); } catch { /* ignore */ }
      }
      
      setData(await second.json());
    } catch (err: any) {
      setError(err.message || "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-3xl border border-purple-500/30 bg-zinc-900/50 p-8 shadow-2xl backdrop-blur-md transition-all">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10">
        <div>
          <h2 className="text-3xl font-black tracking-tighter text-white uppercase italic">
            Sentinel Elite Analysis
          </h2>
          <p className="text-zinc-400 text-sm mt-1 max-w-md">
            Advanced risk modeling: utilization slopes, exit liquidity, and yield arbitrage.
          </p>
        </div>
        <button
          onClick={runAnalysis}
          disabled={loading || !target}
          className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 px-8 py-3 rounded-2xl font-black uppercase tracking-widest text-xs shadow-lg shadow-purple-500/20 transition-all active:scale-95 disabled:opacity-50"
        >
          {loading ? "Settling x402..." : "Execute Deep-Dive (0.01 USDC)"}
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs font-mono">
          SYSTEM_ERROR: {error}
        </div>
      )}

      {data && (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
          
          {/* Pillar 1: Liquidity & Slopes */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-zinc-950 rounded-2xl p-6 border border-white/5 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-2 opacity-10 font-black text-4xl italic">LIQUIDITY</div>
              <h3 className="text-[10px] font-black text-purple-400 uppercase tracking-[0.2em] mb-4">
                Liquidity Stress & Slopes
              </h3>
              <div className="space-y-4">
                <div className="flex justify-between items-end border-b border-white/5 pb-2">
                  <span className="text-xs text-zinc-500 italic">Utilization Rate</span>
                  <span className={`text-lg font-mono font-bold ${data.utilization > 90 ? 'text-red-400' : 'text-emerald-400'}`}>
                    {data.utilization}%
                  </span>
                </div>
                <div className="flex justify-between items-end border-b border-white/5 pb-2">
                  <span className="text-xs text-zinc-500 italic">Interest Rate Slope 2</span>
                  <span className="text-lg font-mono font-bold text-white">{data.slope2}%</span>
                </div>
                <div className="bg-white/5 p-4 rounded-xl border border-white/10">
                  <p className="text-[11px] text-zinc-300 leading-relaxed">
                    <strong className="text-purple-400">GUARDIAN_NOTE:</strong> {data.note}
                  </p>
                </div>
              </div>
            </div>

            {/* Pillar 2: Market Impact Assessment */}
            <div className="bg-zinc-950 rounded-2xl p-6 border border-white/5">
              <h3 className="text-[10px] font-black text-purple-400 uppercase tracking-[0.2em] mb-4">
                Impact Assessment Matrix
              </h3>
              <div className="grid grid-cols-3 gap-2">
                {data.shockMatrix.map(row => (
                  <div key={row.shockPct} className="text-center p-3 bg-zinc-900 rounded-xl border border-white/5 hover:border-purple-500/30 transition-all">
                    <div className="text-[9px] text-zinc-500 mb-1">-{row.shockPct}% DROP</div>
                    <div className="text-md font-mono font-bold text-white">
                      {row.projectedHealthFactor?.toFixed(2)}
                    </div>
                    <div className={`text-[8px] font-black uppercase ${row.liquidatable ? 'text-red-500' : 'text-emerald-500'}`}>
                      {row.liquidatable ? 'Liquidation' : 'Secure'}
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-zinc-600 mt-4 font-medium italic">
                *Survival modeling includes KelpDAO exploit-style volatility buffers.
              </p>
            </div>
          </div>

          {/* Pillar 3: Yield Opportunity */}
          <div className="bg-gradient-to-b from-zinc-950 to-purple-950/20 rounded-2xl p-6 border border-purple-500/30">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <div>
                <h3 className="text-[10px] font-black text-purple-400 uppercase tracking-[0.2em] mb-1">
                  Aavescan Yield Benchmarking
                </h3>
                <p className="text-sm text-zinc-300 italic">
                  Analyzing capital efficiency against current Arbitrum USDC yields.
                </p>
              </div>
              <div className="text-right">
                <div className="text-3xl font-black text-emerald-400">+{data.apySpread}% APY</div>
                <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">Efficiency Spread</div>
              </div>
            </div>
            <div className="mt-6 p-4 bg-white/5 rounded-xl border border-white/5 flex items-center justify-between group hover:bg-white/10 transition-all">
              <span className="text-xs font-bold text-white">Recommended: Migrate to Morpho Optimizer</span>
              <span className="text-xs text-emerald-400 font-mono font-bold">
                +${data?.projectedGain?.toLocaleString() ?? "0"} / year
              </span>
            </div>
          </div>

          {/* Settle Receipt Receipt */}
          {settle?.txHash && (
            <div className="text-center">
               <a 
                href={`https://arbiscan.io/tx/${settle.txHash}`}
                target="_blank"
                className="text-[10px] text-zinc-600 hover:text-purple-400 font-mono uppercase tracking-widest"
              >
                Settlement Proof: {settle.txHash.slice(0, 10)}...{settle.txHash.slice(-8)}
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}