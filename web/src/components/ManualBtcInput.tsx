'use client';

/**
 * BTC address scanner — declares native Bitcoin (off-EVM) for the
 * portfolio analysis.
 *
 * The user pastes a Bitcoin address (legacy 1…, P2SH 3…, or bech32 bc1…).
 * We hit /api/btc-balance which proxies Blockstream's free public API to
 * fetch the confirmed balance, then convert to USD via the Chainlink
 * BTC/USD feed on Arbitrum (already in the dApp's price multicall).
 *
 * Replaces the previous "type your BTC quantity" approach — a wealth-
 * manager-grade tool shouldn't ask the user to know their own balance.
 *
 * Future: extend to xpub support so users with HD wallets (Ledger /
 * Trezor / Coldcard) can paste one extended key and have all derived
 * addresses scanned. For now, single address per entry.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  Bitcoin,
  Plus,
  X,
  Loader2,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import { useReadContract } from 'wagmi';
import { arbitrum } from 'wagmi/chains';

const BTC_USD_FEED_ARBITRUM =
  '0x6ce185860a4963106506C203335A2910413708e9' as const;

const AGGREGATOR_V3_ABI = [
  {
    name: 'latestRoundData',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: 'roundId', type: 'uint80' },
      { name: 'answer', type: 'int256' },
      { name: 'startedAt', type: 'uint256' },
      { name: 'updatedAt', type: 'uint256' },
      { name: 'answeredInRound', type: 'uint80' },
    ],
  },
] as const;

const FEED_DECIMALS = 8;

/** Synthetic key the engine uses to identify off-EVM holdings. */
export const MANUAL_BTC_KEY = 'manual:btc';

export interface ManualHolding {
  symbol: string;
  usdValue: number;
  key: string;
  /** Native quantity for display. */
  amount: number;
  /** BTC address that backs this entry, for display + auditability. */
  source?: string;
}

interface BalanceResponse {
  address: string;
  balanceBtc: number;
  balanceSats: number;
  txCount: number;
  error?: string;
}

interface Props {
  value: ManualHolding | null;
  onChange: (next: ManualHolding | null) => void;
}

export function ManualBtcInput({ value, onChange }: Props) {
  const [draft, setDraft] = useState<string>(value?.source ?? '');
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  // Re-sync the input when the parent clears externally.
  useEffect(() => {
    if (!value) setDraft('');
  }, [value]);

  // Live BTC price from Chainlink (Arbitrum). Used to convert the scanned
  // balance to USD.
  const { data: feedData } = useReadContract({
    address: BTC_USD_FEED_ARBITRUM,
    abi: AGGREGATOR_V3_ABI,
    functionName: 'latestRoundData',
    chainId: arbitrum.id,
    query: { refetchInterval: 60_000, staleTime: 30_000 },
  });

  const btcPriceUsd = useMemo(() => {
    if (!feedData) return null;
    const tuple = feedData as readonly unknown[];
    const answer = tuple[1] as bigint;
    const price = Number(answer) / Math.pow(10, FEED_DECIMALS);
    return Number.isFinite(price) && price > 0 ? price : null;
  }, [feedData]);

  const trimmed = draft.trim();
  const looksLikeAddress =
    /^bc1[a-z0-9]{25,89}$/.test(trimmed) ||
    /^[13][a-km-zA-HJ-NP-Z1-9]{25,40}$/.test(trimmed);

  const scan = async () => {
    if (!looksLikeAddress || btcPriceUsd === null) return;
    setScanError(null);
    setScanning(true);
    try {
      const res = await fetch('/api/btc-balance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: trimmed }),
      });
      const json = (await res.json()) as BalanceResponse;
      if (!res.ok || json.error) {
        throw new Error(json.error || `HTTP ${res.status}`);
      }
      if (json.balanceBtc <= 0) {
        // Don't add a zero-balance address to the portfolio. It's not an
        // error per se — just nothing to fold in.
        setScanError(
          `Address has 0 BTC confirmed balance (${json.txCount} historical txs).`
        );
        return;
      }
      onChange({
        symbol: 'BTC',
        key: MANUAL_BTC_KEY,
        amount: json.balanceBtc,
        usdValue: json.balanceBtc * btcPriceUsd,
        source: trimmed,
      });
    } catch (err) {
      setScanError((err as Error).message);
    } finally {
      setScanning(false);
    }
  };

  const clear = () => {
    setDraft('');
    setScanError(null);
    onChange(null);
  };

  return (
    <div className="bg-zinc-900/60 border border-amber-500/20 rounded-2xl p-4 mb-4">
      <div className="flex items-center gap-2 mb-2">
        <Bitcoin size={14} className="text-amber-400" />
        <p className="text-[10px] uppercase tracking-widest text-amber-300 font-bold">
          Add native BTC (off-EVM)
        </p>
        <span className="ml-auto text-[10px] text-zinc-500 font-mono">
          {btcPriceUsd !== null
            ? `BTC: $${btcPriceUsd.toLocaleString(undefined, {
                maximumFractionDigits: 0,
              })}`
            : 'fetching price…'}
        </span>
      </div>
      <p className="text-[11px] text-zinc-500 leading-relaxed mb-3">
        Multi-chain wallet scan only sees EVM chains. Paste a Bitcoin address
        — we'll fetch the confirmed balance via Blockstream, price it
        against the live Chainlink BTC/USD feed, and fold it into the
        portfolio composition + drawdown simulation + benchmark (Beta /
        Jensen's Alpha vs BTC).
      </p>
      {value ? (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30">
          <CheckCircle2 size={14} className="text-amber-300 flex-shrink-0" />
          <div className="text-sm font-mono text-amber-100 flex-1 min-w-0">
            <div className="font-bold">
              {value.amount.toFixed(8)} BTC ·{' '}
              ${value.usdValue.toLocaleString(undefined, {
                maximumFractionDigits: 2,
              })}
            </div>
            {value.source && (
              <div className="text-[10px] text-amber-200/60 truncate">
                {value.source}
              </div>
            )}
          </div>
          <button
            onClick={clear}
            className="text-amber-300 hover:text-amber-100"
            aria-label="Remove BTC holdings"
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        <>
          <div className="flex flex-col sm:flex-row gap-2 items-stretch">
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') scan();
              }}
              placeholder="bc1q…  /  1…  /  3…"
              spellCheck={false}
              autoCapitalize="none"
              autoCorrect="off"
              className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 focus:border-amber-500/50 focus:outline-none text-sm font-mono text-zinc-100 placeholder:text-zinc-600"
            />
            <button
              onClick={scan}
              disabled={!looksLikeAddress || scanning || btcPriceUsd === null}
              className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white text-sm font-bold transition-colors inline-flex items-center justify-center gap-1 whitespace-nowrap"
            >
              {scanning ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Scanning…
                </>
              ) : (
                <>
                  <Plus size={14} />
                  Scan address
                </>
              )}
            </button>
          </div>
          {!looksLikeAddress && draft.length > 0 && (
            <p className="text-[10px] text-zinc-500 mt-1.5">
              Doesn't look like a BTC address yet — keep typing.
            </p>
          )}
          {scanError && (
            <div className="mt-2 flex items-start gap-2 text-[11px] text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
              <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" />
              <span>{scanError}</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
