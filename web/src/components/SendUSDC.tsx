'use client';

import React, { useState, useMemo, useEffect } from 'react';
import {
  useAccount,
  useBalance,
  useWriteContract,
  useWaitForTransactionReceipt,
  usePublicClient,
  useGasPrice,
  useReadContract,
} from 'wagmi';
import { arbitrum } from 'wagmi/chains';
import { erc20Abi, isAddress, parseUnits, formatEther, type Address } from 'viem';
import { Send, ExternalLink, CheckCircle2, XCircle, Loader2, Fuel } from 'lucide-react';

const USDC_ARBITRUM: Address =
  '0xaf88d065e77c8cc2239327c5edb3a432268e5831';
const USDC_DECIMALS = 6;

const ARBISCAN_TX = (hash: string) => `https://arbiscan.io/tx/${hash}`;

// Chainlink ETH/USD aggregator on Arbitrum One (8 decimals).
const ETH_USD_FEED: Address = '0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612';
const ETH_USD_FEED_DECIMALS = 8;

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

export default function SendUSDC() {
  const { address, isConnected } = useAccount();
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');

  const {
    data: balance,
    refetch: refetchBalance,
  } = useBalance({
    address,
    token: USDC_ARBITRUM,
    chainId: arbitrum.id,
    query: { enabled: Boolean(address) },
  });

  const {
    writeContract,
    data: hash,
    isPending: isSubmitting,
    error: submitError,
    reset: resetWrite,
  } = useWriteContract();

  const {
    isLoading: isConfirming,
    isSuccess: isConfirmed,
    error: confirmError,
  } = useWaitForTransactionReceipt({ hash });

  const error = submitError ?? confirmError;

  // ----- gas estimation (live USD readout) -----
  const publicClient = usePublicClient({ chainId: arbitrum.id });
  const { data: gasPrice } = useGasPrice({
    chainId: arbitrum.id,
    query: { refetchInterval: 30_000 },
  });
  const { data: ethUsdData } = useReadContract({
    address: ETH_USD_FEED,
    abi: AGGREGATOR_V3_ABI,
    functionName: 'latestRoundData',
    chainId: arbitrum.id,
    query: { refetchInterval: 60_000 },
  });
  const [gasUnits, setGasUnits] = useState<bigint | undefined>(undefined);
  const [gasError, setGasError] = useState<string | undefined>(undefined);

  // Form validation
  const validation = useMemo<{
    recipientValid: boolean;
    recipientError?: string;
    amountValid: boolean;
    amountError?: string;
    canSubmit: boolean;
  }>(() => {
    const recipientValid = to.length === 0 ? false : isAddress(to);
    const recipientError =
      to.length > 0 && !isAddress(to) ? 'Not a valid address' : undefined;

    let amountValid = false;
    let amountError: string | undefined;
    if (amount.length > 0) {
      try {
        const parsed = parseUnits(amount, USDC_DECIMALS);
        if (parsed <= 0n) {
          amountError = 'Must be > 0';
        } else if (balance && parsed > balance.value) {
          amountError = 'Exceeds balance';
        } else {
          amountValid = true;
        }
      } catch {
        amountError = 'Invalid number';
      }
    }

    return {
      recipientValid,
      recipientError,
      amountValid,
      amountError,
      canSubmit: recipientValid && amountValid,
    };
  }, [to, amount, balance]);

  // Re-estimate gas whenever the form becomes valid / changes. We debounce
  // implicitly via the validation memo: estimateContractGas only fires when
  // both fields parse cleanly.
  useEffect(() => {
    if (!publicClient || !validation.canSubmit || !address) {
      setGasUnits(undefined);
      setGasError(undefined);
      return;
    }
    let cancelled = false;
    publicClient
      .estimateContractGas({
        address: USDC_ARBITRUM,
        abi: erc20Abi,
        functionName: 'transfer',
        args: [to as Address, parseUnits(amount, USDC_DECIMALS)],
        account: address,
      })
      .then((units) => {
        if (!cancelled) {
          setGasUnits(units);
          setGasError(undefined);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setGasUnits(undefined);
          setGasError(err instanceof Error ? err.message : 'estimate failed');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [publicClient, validation.canSubmit, address, to, amount]);

  const gasEstimate = useMemo<{ eth: number; usd?: number } | null>(() => {
    if (!gasUnits || !gasPrice) return null;
    const wei = gasUnits * gasPrice;
    const eth = Number(formatEther(wei));
    if (!ethUsdData) return { eth };
    const ethUsd = Number((ethUsdData as readonly [bigint, bigint, bigint, bigint, bigint])[1]) /
      Math.pow(10, ETH_USD_FEED_DECIMALS);
    return { eth, usd: eth * ethUsd };
  }, [gasUnits, gasPrice, ethUsdData]);

  const handleSend = () => {
    if (!validation.canSubmit) return;
    writeContract({
      address: USDC_ARBITRUM,
      abi: erc20Abi,
      functionName: 'transfer',
      args: [to as Address, parseUnits(amount, USDC_DECIMALS)],
      chainId: arbitrum.id,
    });
  };

  const handleReset = () => {
    setTo('');
    setAmount('');
    resetWrite();
    refetchBalance();
  };

  const handleMax = () => {
    if (!balance) return;
    setAmount(balance.formatted);
  };

  // -------- render --------
  if (!isConnected) {
    return (
      <Shell>
        <div className="flex flex-col items-center justify-center text-center py-12 gap-3">
          <Send className="text-gray-600" size={32} />
          <p className="text-sm text-gray-400 font-semibold">
            Connect your wallet to send USDC on Arbitrum.
          </p>
          <p className="text-[11px] text-gray-600 max-w-xs">
            This dApp calls{' '}
            <code className="font-mono text-gray-400">transfer</code> on USDC
            directly from your wallet. No contracts in between.
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      {isConfirmed ? (
        <SuccessPane hash={hash} onReset={handleReset} />
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex flex-col gap-4"
        >
          {/* Balance */}
          <div className="flex justify-between items-center text-[11px] uppercase tracking-widest">
            <span className="text-gray-500 font-bold">Your balance</span>
            <span className="font-mono text-gray-300">
              {balance
                ? `${Number(balance.formatted).toLocaleString(undefined, {
                    maximumFractionDigits: 2,
                  })} USDC`
                : '—'}
            </span>
          </div>

          {/* Recipient */}
          <Field
            label="Recipient"
            error={validation.recipientError}
            valid={validation.recipientValid}
          >
            <input
              type="text"
              value={to}
              onChange={(e) => setTo(e.target.value.trim())}
              placeholder="0x…"
              spellCheck={false}
              autoComplete="off"
              className="w-full bg-transparent text-sm font-mono text-white placeholder:text-gray-700 outline-none"
            />
          </Field>

          {/* Amount */}
          <Field
            label="Amount (USDC)"
            error={validation.amountError}
            valid={validation.amountValid}
            rightSlot={
              balance && (
                <button
                  type="button"
                  onClick={handleMax}
                  className="text-[10px] font-bold uppercase tracking-widest text-blue-400 hover:text-blue-300"
                >
                  Max
                </button>
              )
            }
          >
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
              placeholder="0.00"
              spellCheck={false}
              autoComplete="off"
              className="w-full bg-transparent text-sm font-mono text-white placeholder:text-gray-700 outline-none"
            />
          </Field>

          {/* Gas estimate */}
          {validation.canSubmit && (
            <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-gray-500 font-bold">
              <span className="flex items-center gap-1.5">
                <Fuel size={11} />
                Est. network fee
              </span>
              <span className="font-mono normal-case tracking-normal text-gray-400">
                {gasError
                  ? '—'
                  : gasEstimate
                  ? gasEstimate.usd !== undefined
                    ? `~$${gasEstimate.usd.toFixed(4)} · ${gasEstimate.eth.toFixed(6)} ETH`
                    : `${gasEstimate.eth.toFixed(6)} ETH`
                  : 'estimating…'}
              </span>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={!validation.canSubmit || isSubmitting || isConfirming}
            className="mt-2 flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:bg-gray-800 disabled:text-gray-600 text-white text-sm font-bold shadow-lg shadow-blue-600/20 transition-colors disabled:shadow-none"
          >
            {isSubmitting ? (
              <>
                <Loader2 size={14} className="animate-spin" /> Awaiting wallet…
              </>
            ) : isConfirming ? (
              <>
                <Loader2 size={14} className="animate-spin" /> Confirming on-chain…
              </>
            ) : (
              <>
                <Send size={14} />
                Send USDC
              </>
            )}
          </button>

          {/* Pending tx link */}
          {hash && !isConfirmed && (
            <a
              href={ARBISCAN_TX(hash)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-gray-500 hover:text-gray-300 font-mono flex items-center gap-1 justify-center"
            >
              View on Arbiscan
              <ExternalLink size={10} />
            </a>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-[11px]">
              <XCircle size={14} className="mt-0.5 flex-shrink-0" />
              <span>
                {error.message.split('\n')[0] || 'Transaction failed.'}
              </span>
            </div>
          )}
        </form>
      )}
    </Shell>
  );
}

// -------- sub-components --------

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-[#0f172a] border border-gray-800 rounded-xl p-6 min-h-[320px] w-full max-w-md mx-auto">
      <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-4">
        Send USDC · Arbitrum
      </h3>
      {children}
    </div>
  );
}

function Field({
  label,
  error,
  valid,
  rightSlot,
  children,
}: {
  label: string;
  error?: string;
  valid: boolean;
  rightSlot?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex justify-between items-center mb-1.5">
        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
          {label}
        </label>
        {rightSlot}
      </div>
      <div
        className={`px-3 py-2.5 rounded-lg border bg-black/40 transition-colors ${
          error
            ? 'border-red-500/50'
            : valid
            ? 'border-blue-500/40'
            : 'border-gray-800 focus-within:border-gray-600'
        }`}
      >
        {children}
      </div>
      {error && (
        <p className="text-[10px] text-red-400 mt-1 font-mono">{error}</p>
      )}
    </div>
  );
}

function SuccessPane({
  hash,
  onReset,
}: {
  hash: `0x${string}` | undefined;
  onReset: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-4 py-6 text-center">
      <CheckCircle2 size={40} className="text-green-400" />
      <div>
        <p className="text-sm font-bold text-white">Transfer confirmed</p>
        <p className="text-[11px] text-gray-500 mt-1">
          USDC is on the way to the recipient.
        </p>
      </div>
      {hash && (
        <a
          href={ARBISCAN_TX(hash)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-[11px] font-mono text-blue-400 hover:text-blue-300"
        >
          View on Arbiscan
          <ExternalLink size={11} />
        </a>
      )}
      <button
        onClick={onReset}
        className="mt-2 px-4 py-2 rounded-lg border border-gray-800 hover:border-gray-600 text-xs text-gray-300 hover:text-white transition-colors"
      >
        Send another
      </button>
    </div>
  );
}
