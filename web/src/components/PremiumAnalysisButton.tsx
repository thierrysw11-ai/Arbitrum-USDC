"use client";

import { useState } from "react";
import { useAccount, useSignTypedData } from "wagmi";
import { buildTransferAuthorizationTypedData } from "@/lib/x402/eip3009";
import { getNetwork } from "@/lib/x402/networks";
import ToolTrace from "./agent/ToolTrace"; //
import {
  X_PAYMENT_HEADER,
  X_PAYMENT_RESPONSE_HEADER,
  encodePaymentHeader,
  generateNonce,
} from "@/lib/x402/scheme";

//
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
      // 1. Initial Call
      const initialBody = { address: target };
      const first = await fetch("/api/agent/premium-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(initialBody),
      });

      if (first.status === 402) {
        const offer = await first.json();
        const requirement = offer.accepts.find((r: any) => r.network === "arbitrum-one");

        // - Fixes the 0x000 issue by ensuring we have the address from image_651dc0.png
        const payToAddress = requirement?.payTo || "0xFED63F59b12f22e517b82F0d185B137aD01b3Fd4"; 

        const network = getNetwork("arbitrum-one");
        const now = Math.floor(Date.now() / 1000);
        const auth = {
          from: connected,
          to: payToAddress as `0x${string}`,
          value: requirement?.maxAmountRequired || "10000",
          validAfter: "0",
          validBefore: String(now + 300),
          nonce: generateNonce(),
        };

        const typedData = buildTransferAuthorizationTypedData(network, auth);
        const signature = await signTypedDataAsync(typedData);

        const payload = {
          x402Version: 1,
          scheme: "exact",
          network: "arbitrum-one",
          payload: { signature, authorization: auth },
        };

        // 2. Final Settlement
        const second = await fetch("/api/agent/premium-analysis", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            [X_PAYMENT_HEADER]: encodePaymentHeader(payload),
          },
          body: JSON.stringify(initialBody),
        });

        const resultData = await second.json();
        setData(resultData);
        // - Log the success to the trace
        setTrace({ name: "x402_settlement", args: auth, result: resultData });
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-purple-500/30 bg-zinc-900/50 p-8 shadow-2xl backdrop-blur-md">
        <div className="flex justify-between items-center mb-10">
          <div>
            <h2 className="text-3xl font-black text-white uppercase italic">Sentinel Elite Analysis</h2>
            <p className="text-zinc-400 text-sm">Advanced risk modeling for WBTC/USDC.</p>
          </div>
          <button
            onClick={runAnalysis}
            disabled={loading}
            className="bg-gradient-to-r from-purple-600 to-indigo-600 px-8 py-3 rounded-2xl font-black text-xs uppercase tracking-widest text-white transition-all active:scale-95 disabled:opacity-50"
          >
            {loading ? "Settling..." : "Execute Deep-Dive (0.01 USDC)"}
          </button>
        </div>

        {/* - Tool Trace Debugging */}
        {trace && <ToolTrace name={trace.name} args={trace.args} result={trace.result} />}

        {/* - Render logic for matrix data goes here */}
        {data && (
           <div className="mt-6 text-emerald-400 font-mono">
             Analysis Complete: Utilization {data.utilization}%
           </div>
        )}
      </div>
    </div>
  );
}