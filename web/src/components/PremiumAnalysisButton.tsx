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

interface SentinelEliteResponse {
  utilization: number;
  slope2: number;
  note: string;
  shockMatrix: { shockPct: number; projectedHealthFactor: number | null; liquidatable: boolean }[];
  apySpread: number;
  projectedGain: number;
}

export function PremiumAnalysisButton({ address }: { address?: `0x${string}` }) {
  const { address: connected } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<SentinelEliteResponse | null>(null);
  const [trace, setTrace] = useState<{ name: string; args: any; result: any } | null>(null);

  const target = address || connected;

  async function runAnalysis() {
    if (!target || !connected) return;
    setLoading(true);
    setError(null);

    try {
      // 1. Initial request to get the session requirements
      const first = await fetch("/api/agent/premium-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: target }),
      });

      if (first.status === 402) {
        const offer = await first.json();
        
        // Use the strict checksummed address from your wallet capture
        const payToAddress = "0xfed63f59b12f22e517b82f0d185b137ad01b3fd4"; 
        const network = getNetwork("arbitrum-one");
        const now = Math.floor(Date.now() / 1000);
        
        // We use a long 1-hour window to eliminate "expired signature" errors from clock drift
        const auth = {
          from: connected,
          to: payToAddress as `0x${string}`,
          value: "10000", // 0.01 USDC
          validAfter: "0",
          validBefore: String(now + 3600), 
          nonce: generateNonce(),
        };

        const typedData = buildTransferAuthorizationTypedData(network, auth);
        const signature = await signTypedDataAsync(typedData);

        const payload = {
          x402Version: 1,
          scheme: "exact",
          network: "arbitrum-one",
          payload: { signature, authorization: auth },
        } as const;

        // 2. Final Settlement: We pass the auth details in the body to force backend alignment
        const second = await fetch("/api/agent/premium-analysis", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            [X_PAYMENT_HEADER]: encodePaymentHeader(payload as unknown as PaymentPayload),
          },
          body: JSON.stringify({ 
            address: target,
            settlement: {
              to: payToAddress,
              amount: "10000",
              nonce: auth.nonce
            }
          }),
        });

        if (!second.ok) {
          const details = await second.json().catch(() => ({}));
          throw new Error(details.message || "Agentic settlement failed.");
        }
        
        const resultData = await second.json();
        setData(resultData);
        setTrace({ name: "x402_settlement", args: auth, result: resultData });
      } else {
        setData(await first.json());
      }
    } catch (err: any) {
      setError(err.message || "Unknown error");
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
            <p className="text-zinc-400 text-sm">Real-time risk modeling for your USDC positions.</p>
          </div>
          <button
            onClick={runAnalysis}
            disabled={loading || !target}
            className="bg-gradient-to-r from-purple-600 to-indigo-600 px-8 py-3 rounded-2xl font-black text-xs uppercase tracking-widest text-white transition-all active:scale-95 disabled:opacity-50"
          >
            {loading ? "Settling x402..." : "Execute Deep-Dive (0.01 USDC)"}
          </button>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs font-mono">
            SYSTEM_ERROR: {error}
          </div>
        )}

        {trace && <ToolTrace name={trace.name} args={trace.args} result={trace.result} />}

        {data && (
          <div className="mt-8 space-y-6">
             <div className="grid grid-cols-2 gap-4">
                <div className="bg-zinc-950 p-4 rounded-xl border border-white/5">
                   <div className="text-[10px] text-purple-400 font-bold uppercase mb-1">Utilization</div>
                   <div className="text-2xl font-mono font-bold text-white">{data.utilization}%</div>
                </div>
                <div className="bg-zinc-950 p-4 rounded-xl border border-white/5">
                   <div className="text-[10px] text-emerald-400 font-bold uppercase mb-1">Efficiency Spread</div>
                   <div className="text-2xl font-mono font-bold text-white">+{data.apySpread}%</div>
                </div>
             </div>
             <div className="bg-white/5 p-4 rounded-xl border border-purple-500/20">
                <p className="text-xs text-zinc-300 leading-relaxed italic">
                  <strong className="text-purple-400 not-italic">GUARDIAN_NOTE:</strong> {data.note}
                </p>
             </div>
          </div>
        )}
      </div>
    </div>
  );
}