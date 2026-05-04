'use client';

/**
 * Generic Send component — handles any registered token (native gas tokens
 * and ERC-20s) on any of the 5 supported chains.
 *
 * Why a separate file from the legacy SendUSDC:
 *   - SendUSDC was tied to USDC + Arbitrum + a hardcoded ETH/USD price feed.
 *     Refactoring in-place would have churned hundreds of lines.
 *   - SendToken is the new public component. The /send page imports this.
 *     SendUSDC.tsx remains in the tree as legacy until cleaned up.
 *
 * Two transfer paths:
 *   - Native gas token (ETH on rollups, MATIC on Polygon) → useSendTransaction
 *   - ERC-20 → useWriteContract with `transfer(to, amount)`
 *
 * Per-chain affordances:
 *   - Token list comes from the popular-tokens registry, scoped to the
 *     wallet's connected chain. Switching wallet network changes the list.
 *   - Block-explorer URL pulled from the chain registry (chains.ts).
 *   - Gas estimation uses the connected chain's public RPC; USD readout
 *     skipped on chains where we don't have an ETH/USD price feed wired.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  useAccount,
  useBalance,
  useWriteContract,
  useWaitForTransactionReceipt,
  usePublicClient,
  useSendTransaction,
} from 'wagmi';
import { erc20Abi, isAddress, parseUnits, type Address } from 'viem';
import {
  Send,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Loader2,
  Fuel,
} from 'lucide-react';

import {
  POPULAR_TOKEN_COUNT,
  nativeTokenFor,
  tokensForChain,
  type PopularToken,
} from '@/lib/tokens/popular';
import {
  DEFAULT_CHAIN,
  explorerTxUrl,
  getChain,
} from '@/lib/chains';
import { TokenPicker } from './TokenPicker';

export default function SendToken() {
  const { address, isConnected, chainId: connectedChainId } = useAccount();

  // Resolve the active chain. If the wallet is on an unsupported chain we
  // fall back to DEFAULT_CHAIN's slug so the picker still renders something
  // sensible — the user will be prompted to switch when they try to send.
  const effectiveChainId = connectedChainId ?? DEFAULT_CHAIN.chainId;
  const chainConfig = getChain(effectiveChainId) ?? DEFAULT_CHAIN;
  const isUnsupportedChain =
    connectedChainId !== undefined && getChain(connectedChainId) === undefined;

  // Selected token. Default to the chain's native gas token (ETH on
  // rollups, MATIC on Polygon). When the chain changes, reset to native.
  const [selectedToken, setSelectedToken] = useState<PopularToken | null>(
    () => nativeTokenFor(effectiveChainId) ?? null
  );
  useEffect(() => {
    setSelectedToken(nativeTokenFor(effectiveChainId) ?? null);
  }, [effectiveChainId]);

  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');

  // Balance read — wagmi handles native vs ERC-20 based on whether `token`
  // is undefined.
  const { data: balance, refetch: refetchBalance } = useBalance({
    address,
    token: selectedToken?.address ?? undefined,
    chainId: effectiveChainId,
    query: {
      enabled: Boolean(address && selectedToken && !isUnsupportedChain),
    },
  });

  // ERC-20 path
  const {
    writeContract,
    data: erc20Hash,
    isPending: isErc20Submitting,
    error: erc20SubmitError,
    reset: resetErc20Write,
  } = useWriteContract();

  // Native path
  const {
    sendTransaction,
    data: nativeHash,
    isPending: isNativeSubmitting,
    error: nativeSubmitError,
    reset: resetNativeSend,
  } = useSendTransaction();

  const isNative = selectedToken?.address === null;
  const hash = isNative ? nativeHash : erc20Hash;
  const isSubmitting = isNative ? isNativeSubmitting : isErc20Submitting;
  const submitError = isNative ? nativeSubmitError : erc20SubmitError;

  const { isLoading: isConfirming, isSuccess: isConfirmed, error: confirmError } =
    useWaitForTransactionReceipt({ hash, chainId: effectiveChainId });

  const error = submitError ?? confirmError;

  // ─── gas estimation ────────────────────────────────────────────────
  const publicClient = usePublicClient({ chainId: effectiveChainId });
  const [gasUnits, setGasUnits] = useState<bigint | undefined>(undefined);
  const [gasError, setGasError] = useState<string | undefined>(undefined);

  // ─── form validation ───────────────────────────────────────────────
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
    if (amount.length > 0 && selectedToken) {
      try {
        const parsed = parseUnits(amount, selectedToken.decimals);
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

    const canSubmit =
      recipientValid &&
      amountValid &&
      Boolean(selectedToken) &&
      !isUnsupportedChain;

    return { recipientValid, recipientError, amountValid, amountError, canSubmit };
  }, [to, amount, balance, selectedToken, isUnsupportedChain]);

  // Re-estimate gas whenever the form becomes valid.
  useEffect(() => {
    if (
      !publicClient ||
      !validation.canSubmit ||
      !address ||
      !selectedToken
    ) {
      setGasUnits(undefined);
      setGasError(undefined);
      return;
    }
    let cancelled = false;
    const parsed = parseUnits(amount, selectedToken.decimals);
    const promise = isNative
      ? publicClient.estimateGas({
          account: address,
          to: to as Address,
          value: parsed,
        })
      : publicClient.estimateContractGas({
          address: selectedToken.address!,
          abi: erc20Abi,
          functionName: 'transfer',
          args: [to as Address, parsed],
          account: address,
        });
    promise
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
  }, [
    publicClient,
    validation.canSubmit,
    address,
    to,
    amount,
    isNative,
    selectedToken,
  ]);

  const handleSend = () => {
    if (!validation.canSubmit || !selectedToken) return;
    const parsed = parseUnits(amount, selectedToken.decimals);
    if (isNative) {
      sendTransaction({
        to: to as Address,
        value: parsed,
        chainId: effectiveChainId,
      });
    } else {
      writeContract({
        address: selectedToken.address!,
        abi: erc20Abi,
        functionName: 'transfer',
        args: [to as Address, parsed],
        chainId: effectiveChainId,
      });
    }
  };

  const handleReset = () => {
    setTo('');
    setAmount('');
    resetErc20Write();
    resetNativeSend();
    refetchBalance();
  };

  const handleMax = () => {
    if (!balance) return;
    setAmount(balance.formatted);
  };

  const tokenCountOnChain = tokensForChain(effectiveChainId).length;

  // ─── render ────────────────────────────────────────────────────────
  if (!isConnected) {
    return (
      <Shell title={`Send · ${chainConfig.displayName}`}>
        <div className="flex flex-col items-center justify-center text-center py-12 gap-3">
          <Send className="text-gray-600" size={32} />
          <p className="text-sm text-gray-400 font-semibold">
            Connect your wallet to send any of {POPULAR_TOKEN_COUNT}+ tokens
            across {tokensForChain(0).length === 0 ? '5 chains' : 'all supported chains'}.
          </p>
          <p className="text-[11px] text-gray-600 max-w-xs">
            ERC-20s call <code className="font-mono text-gray-400">transfer</code>;
            native gas tokens (ETH, MATIC) use a standard wallet send. No
            intermediate contracts.
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell title={`Send · ${chainConfig.displayName}`}>
      {isUnsupportedChain && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[12px]">
          Your wallet is on an unsupported chain. Switch to Arbitrum, Base,
          Optimism, Polygon, or Ethereum mainnet to send.
        </div>
      )}

      {isConfirmed ? (
        <SuccessPane
          hash={hash}
          chainConfig={chainConfig}
          symbol={selectedToken?.symbol ?? 'token'}
          onReset={handleReset}
        />
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex flex-col gap-4"
        >
          {/* Token picker */}
          <Field label="Token" valid={Boolean(selectedToken)}>
            <TokenPicker
              chainId={effectiveChainId}
              value={selectedToken}
              onChange={setSelectedToken}
            />
          </Field>

          {/* Balance */}
          <div className="flex justify-between items-center text-[11px] uppercase tracking-widest">
            <span className="text-gray-500 font-bold">Your balance</span>
            <span className="font-mono text-gray-300">
              {balance && selectedToken
                ? `${Number(balance.formatted).toLocaleString(undefined, {
                    maximumFractionDigits: 6,
                  })} ${selectedToken.symbol}`
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
            label={`Amount${selectedToken ? ` (${selectedToken.symbol})` : ''}`}
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
              onChange={(e) =>
                setAmount(e.target.value.replace(/[^0-9.]/g, ''))
              }
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
                  ? 'estimate failed'
                  : gasUnits
                    ? `~${gasUnits.toLocaleString()} gas units`
                    : 'estimating…'}
              </span>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={
              !validation.canSubmit || isSubmitting || isConfirming
            }
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
                Send {selectedToken?.symbol ?? 'token'}
              </>
            )}
          </button>

          {/* Pending tx link */}
          {hash && !isConfirmed && (
            <a
              href={explorerTxUrl(chainConfig, hash)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-gray-500 hover:text-gray-300 font-mono flex items-center gap-1 justify-center"
            >
              View on {chainConfig.displayName} explorer
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

      {/* Footer info — token count for the connected chain */}
      <p className="text-[10px] text-zinc-600 mt-4 text-center">
        {tokenCountOnChain} popular token{tokenCountOnChain === 1 ? '' : 's'}{' '}
        registered on {chainConfig.displayName} · search to filter
      </p>
    </Shell>
  );
}

// =========================================================================
// Sub-components
// =========================================================================

function Shell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-[#0f172a] border border-gray-800 rounded-xl p-6 min-h-[320px] w-full max-w-md mx-auto">
      <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-4">
        {title}
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
  chainConfig,
  symbol,
  onReset,
}: {
  hash: `0x${string}` | undefined;
  chainConfig: ReturnType<typeof getChain> extends infer T
    ? T extends undefined
      ? never
      : T
    : never;
  symbol: string;
  onReset: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-4 py-6 text-center">
      <CheckCircle2 size={40} className="text-green-400" />
      <div>
        <p className="text-sm font-bold text-white">Transfer confirmed</p>
        <p className="text-[11px] text-gray-500 mt-1">
          {symbol} is on the way to the recipient.
        </p>
      </div>
      {hash && (
        <a
          href={explorerTxUrl(chainConfig, hash)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-[11px] font-mono text-blue-400 hover:text-blue-300"
        >
          View on {chainConfig.displayName} explorer
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
