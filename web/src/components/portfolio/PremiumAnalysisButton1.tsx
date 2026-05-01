"use client";

/**
 * Premium Analysis button — user-facing x402 client.
 *
 * Sits on the portfolio page next to the standard analysis tools. When
 * clicked:
 *
 *   1. POST to /api/agent/premium-analysis with the wallet address.
 *   2. Server returns 402 with a payment requirement.
 *   3. We pick the Arbitrum requirement, build EIP-3009 typed data, and
 *      ask the user's connected wallet to sign it.
 *   4. Retry the POST with the signed `X-PAYMENT` header.
 *   5. Render the shock matrix + Arbiscan link.
 *
 * No USDC ever leaves the user's wallet until the facilitator submits the
 * authorization on-chain — and even then, the user is in full control via
 * EIP-3009's signed-amount commitment.
 */

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

interface ShockRow {
  shockPct: number;
  projectedHealthFactor: number | null;
  liquidatable: boolean;
}

interface PremiumResponse {
  address: string;
  currentHealthFactor: number;
  shockMatrix: ShockRow[];
  note: string;
}

interface SettleInfo {
  success: boolean;
  txHash?: string;
  network?: string;
  errorReason?: string;
}

export function PremiumAnalysisButton({ address }: { address?: `0x${string}` }) {
  const { address: connected } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PremiumResponse | null>(null);
  const [settle, setSettle] = useState<SettleInfo | null>(null);

  const target = address || connected;
  const disabled = !target || loading;

  async function run() {
    if (!target || !connected) return;
    setLoading(true);
    setError(null);
    setData(null);
    setSettle(null);

    try {
      // 1. Unpaid attempt.
      const initialBody = JSON.stringify({ address: target });
      const first = await fetch("/api/agent/premium-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: initialBody,
      });

      if (first.status !== 402) {
        // Either 200 (free, unexpected) or actual error.
        if (!first.ok) {
          setError(`server returned ${first.status}: ${await first.text()}`);
          return;
        }
        setData(await first.json());
        return;
      }

      // 2. Pick Arbitrum requirement from the offer.
      const offer = (await first.json()) as PaymentRequiredResponse;
      const requirement = offer.accepts.find(
        (r): r is PaymentRequirement & { network: "arbitrum-one" } =>
          r.network === "arbitrum-one"
      );
      if (!requirement) {
        setError("server did not offer Arbitrum payment");
        return;
      }

      // 3. Build + sign EIP-3009 authorization.
      const network = getNetwork(requirement.network);
      const now = Math.floor(Date.now() / 1000);
      const auth = {
        from: connected,
        to: requirement.payTo,
        value: requirement.maxAmountRequired,
        validAfter: "0",
        validBefore: String(now + Math.max(60, requirement.maxTimeoutSeconds)),
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
        network: requirement.network,
        payload: { signature, authorization: auth },
      };

      // 4. Retry with payment header.
      const second = await fetch("/api/agent/premium-analysis", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [X_PAYMENT_HEADER]: encodePaymentHeader(payload),
        },
        body: initialBody,
      });

      if (!second.ok) {
        setError(`paid attempt returned ${second.status}: ${await second.text()}`);
        return;
      }

      // 5. Parse settle info from response header.
      const settleHeader = second.headers.get(X_PAYMENT_RESPONSE_HEADER);
      if (settleHeader) {
        try {
          setSettle(JSON.parse(atob(settleHeader)));
        } catch {
          /* ignore */
        }
      }
      setData(await second.json());
    } catch (err) {
      setError((err as Error).message || "unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-purple-700/50 bg-purple-950/20 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-purple-200">
            Premium Analysis · 0.01 USDC
          </h3>
          <p className="mt-1 text-xs text-purple-300/70">
            Multi-asset shock matrix, settled on-chain via x402 on Arbitrum.
          </p>
        </div>
        <button
          onClick={run}
          disabled={disabled}
          className="rounded-md bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? "Signing…" : "Pay & analyze"}
        </button>
      </div>

      {error && (
        <p className="mt-3 text-xs text-red-400">Error: {error}</p>
      )}

      {data && (
        <div className="mt-4 space-y-3">
          <div className="flex gap-4 text-xs text-purple-100">
            <span>
              Current HF: <strong>{data.currentHealthFactor.toFixed(3)}</strong>
            </span>
          </div>
          <table className="w-full text-xs">
            <thead className="text-purple-300/60">
              <tr>
                <th className="text-left">Non-stable shock</th>
                <th className="text-right">Projected HF</th>
                <th className="text-right">Liquidatable?</th>
              </tr>
            </thead>
            <tbody className="text-purple-100">
              {data.shockMatrix.map((row) => (
                <tr key={row.shockPct}>
                  <td>{row.shockPct.toFixed(0)}%</td>
                  <td className="text-right">
                    {row.projectedHealthFactor === null
                      ? "—"
                      : row.projectedHealthFactor.toFixed(3)}
                  </td>
                  <td
                    className={`text-right ${row.liquidatable ? "text-red-400" : "text-emerald-400"}`}
                  >
                    {row.liquidatable ? "Yes" : "No"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {settle && settle.txHash && (
            <p className="text-[11px] text-purple-300/70">
              Settled on Arbitrum:{" "}
              <a
                href={`https://arbiscan.io/tx/${settle.txHash}`}
                target="_blank"
                rel="noreferrer"
                className="underline hover:text-purple-200"
              >
                {settle.txHash.slice(0, 10)}…{settle.txHash.slice(-8)}
              </a>
            </p>
          )}
          {settle && !settle.success && (
            <p className="text-[11px] text-amber-400">
              Settlement note: {settle.errorReason || "unknown"}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
