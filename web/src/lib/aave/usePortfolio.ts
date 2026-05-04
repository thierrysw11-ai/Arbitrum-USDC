"use client";

import { useMemo } from "react";
import { useAccount, useReadContract, useReadContracts } from "wagmi";

import {
  DEFAULT_CHAIN,
  getChain,
  isSupportedChainId,
} from "@/lib/chains";
import {
  AAVE_ORACLE_ABI,
  POOL_ABI,
  PROTOCOL_DATA_PROVIDER_ABI,
} from "./abi";
import type { Portfolio, PositionRow, UserAccountData } from "./types";

/**
 * Reads an Aave V3 position on whichever chain is currently active.
 *
 * Chain resolution (Phase A multi-chain edition):
 *   1. If `viewChainId` is supplied, use it (explicit override).
 *   2. Else use the wallet's connected chainId from `useAccount()`.
 *   3. Else fall back to `DEFAULT_CHAIN` (Arbitrum One).
 *   4. If the resolved chain is not in the supported registry,
 *      collapse to `DEFAULT_CHAIN` so we don't try to call Arbitrum's
 *      Aave Pool address on, say, Ethereum mainnet (would just revert).
 *
 * Address resolution:
 *   - If `viewAddress` is supplied, read that address (spectator mode).
 *   - Else use the connected wallet from `useAccount()`.
 *
 * Returns the same `Portfolio` snapshot shape as before, plus the chain
 * info so callers can render which chain's data they're seeing.
 *
 * High level (per-chain):
 *   1. Fetch the canonical reserve list from `ProtocolDataProvider.getAllReservesTokens()`.
 *   2. Multicall, for every reserve:
 *        - `getUserReserveData(asset, user)` → balances + collateral toggle
 *        - `getReserveConfigurationData(asset)` → decimals + LTV + LT
 *        - `AaveOracle.getAssetPrice(asset)` → USD price (8 decimals)
 *        - `Pool.getReserveData(asset)` → live ray-scaled APRs
 *   3. Filter out reserves where the user has zero collateral and zero debt.
 *   4. Read `Pool.getUserAccountData(user)` for the protocol-computed aggregate.
 */
export function usePortfolio(
  viewAddress?: `0x${string}`,
  viewChainId?: number
): Portfolio & {
  address?: `0x${string}`;
  isOverride: boolean;
  chainId: number;
  chainName: string;
  isUnsupportedChain: boolean;
} {
  const { address: connectedAddress, chainId: connectedChainId } = useAccount();

  // The address we actually read against. Override takes precedence so a
  // user can inspect any wallet without connecting.
  const address = viewAddress ?? connectedAddress;
  const isOverride = !!viewAddress && viewAddress !== connectedAddress;

  // Resolve the target chain. Explicit override > connected wallet > default.
  // If the result isn't in our registry (e.g. user is on Ethereum mainnet),
  // surface that to the caller so the UI can render an empty-state, but
  // collapse to DEFAULT_CHAIN internally so we don't crash on undefined.
  const requestedChainId =
    viewChainId ?? connectedChainId ?? DEFAULT_CHAIN.chainId;
  const isUnsupportedChain =
    requestedChainId !== undefined && !isSupportedChainId(requestedChainId);
  const chain = isUnsupportedChain
    ? DEFAULT_CHAIN
    : getChain(requestedChainId) ?? DEFAULT_CHAIN;

  // Pre-cast Aave V3 addresses for this chain. Done once per render so the
  // contract args below can be plain object literals.
  const poolAddress = chain.aaveV3.pool as `0x${string}`;
  const dataProviderAddress = chain.aaveV3.dataProvider as `0x${string}`;
  const oracleAddress = chain.aaveV3.oracle as `0x${string}`;

  // Reads are gated on `address && !isUnsupportedChain` so we never issue
  // an Arbitrum-Pool call against, say, Ethereum's RPC.
  const readsEnabled = !!address && !isUnsupportedChain;

  // -------------------------------------------------------------------------
  // 1. Aggregate position (single read against the Pool)
  // -------------------------------------------------------------------------
  const accountQuery = useReadContract({
    chainId: chain.chainId,
    address: poolAddress,
    abi: POOL_ABI,
    functionName: "getUserAccountData",
    args: address ? [address] : undefined,
    query: {
      enabled: readsEnabled,
      staleTime: 30_000,
    },
  });

  // -------------------------------------------------------------------------
  // 2. Canonical reserve list (rare to change, cache aggressively)
  // -------------------------------------------------------------------------
  const reservesQuery = useReadContract({
    chainId: chain.chainId,
    address: dataProviderAddress,
    abi: PROTOCOL_DATA_PROVIDER_ABI,
    functionName: "getAllReservesTokens",
    query: {
      enabled: readsEnabled,
      staleTime: 60 * 60_000,
    },
  });

  const reserveList = (reservesQuery.data ?? []) as readonly {
    symbol: string;
    tokenAddress: `0x${string}`;
  }[];

  // -------------------------------------------------------------------------
  // 3. Per-reserve multicall — 4 reads per asset, batched
  // -------------------------------------------------------------------------
  const perReserveContracts = useMemo(() => {
    if (!readsEnabled || !address || reserveList.length === 0) return [];
    return reserveList.flatMap((r) => [
      {
        chainId: chain.chainId,
        address: dataProviderAddress,
        abi: PROTOCOL_DATA_PROVIDER_ABI,
        functionName: "getUserReserveData",
        args: [r.tokenAddress, address],
      },
      {
        chainId: chain.chainId,
        address: dataProviderAddress,
        abi: PROTOCOL_DATA_PROVIDER_ABI,
        functionName: "getReserveConfigurationData",
        args: [r.tokenAddress],
      },
      {
        chainId: chain.chainId,
        address: oracleAddress,
        abi: AAVE_ORACLE_ABI,
        functionName: "getAssetPrice",
        args: [r.tokenAddress],
      },
      {
        chainId: chain.chainId,
        address: poolAddress,
        abi: POOL_ABI,
        functionName: "getReserveData",
        args: [r.tokenAddress],
      },
    ]);
  }, [
    readsEnabled,
    address,
    reserveList,
    chain.chainId,
    dataProviderAddress,
    oracleAddress,
    poolAddress,
  ]);

  const perReserveQuery = useReadContracts({
    contracts: perReserveContracts,
    allowFailure: true,
    query: {
      enabled: perReserveContracts.length > 0,
      staleTime: 30_000,
    },
  });

  // -------------------------------------------------------------------------
  // 4. Stitch results into PositionRow[]
  // -------------------------------------------------------------------------
  const positions = useMemo<PositionRow[]>(() => {
    if (!perReserveQuery.data || reserveList.length === 0) return [];
    const rows: PositionRow[] = [];
    for (let i = 0; i < reserveList.length; i++) {
      const base = i * 4;
      const userRes = perReserveQuery.data[base];
      const cfgRes = perReserveQuery.data[base + 1];
      const priceRes = perReserveQuery.data[base + 2];
      const reserveDataRes = perReserveQuery.data[base + 3];

      // If anything failed, skip this row rather than poison the whole table.
      if (
        userRes?.status !== "success" ||
        cfgRes?.status !== "success" ||
        priceRes?.status !== "success" ||
        reserveDataRes?.status !== "success"
      ) {
        continue;
      }

      const userArr = userRes.result as unknown as readonly [
        bigint, // currentATokenBalance
        bigint, // currentStableDebt
        bigint, // currentVariableDebt
        bigint, // principalStableDebt
        bigint, // scaledVariableDebt
        bigint, // stableBorrowRate
        bigint, // liquidityRate (per-user)
        number, // stableRateLastUpdated
        boolean // usageAsCollateralEnabled
      ];
      const aTokenBalance = userArr[0];
      const variableDebtBalance = userArr[2];
      const usageAsCollateralEnabled = userArr[8];

      // Skip reserves the user has never touched.
      if (aTokenBalance === 0n && variableDebtBalance === 0n) continue;

      const cfgArr = cfgRes.result as unknown as readonly [
        bigint, // decimals
        bigint, // ltv
        bigint, // liquidationThreshold
        bigint, // liquidationBonus
        bigint, // reserveFactor
        boolean,
        boolean,
        boolean,
        boolean,
        boolean
      ];
      const decimals = Number(cfgArr[0]);
      const ltv = cfgArr[1];
      const liquidationThreshold = cfgArr[2];

      const priceBase = priceRes.result as unknown as bigint;

      const reserveData = reserveDataRes.result as unknown as {
        currentLiquidityRate: bigint;
        currentVariableBorrowRate: bigint;
      };

      rows.push({
        asset: reserveList[i].tokenAddress.toLowerCase() as `0x${string}`,
        symbol: reserveList[i].symbol,
        decimals,
        aTokenBalance,
        variableDebtBalance,
        priceBase,
        liquidationThreshold,
        ltv,
        usageAsCollateralEnabled,
        liquidityRate: reserveData.currentLiquidityRate,
        variableBorrowRate: reserveData.currentVariableBorrowRate,
      });
    }
    return rows;
  }, [perReserveQuery.data, reserveList]);

  const account = useMemo<UserAccountData>(() => {
    if (!accountQuery.data) {
      return {
        totalCollateralBase: 0n,
        totalDebtBase: 0n,
        availableBorrowsBase: 0n,
        currentLiquidationThreshold: 0n,
        ltv: 0n,
        healthFactor: 0n,
      };
    }
    const a = accountQuery.data as unknown as readonly [
      bigint,
      bigint,
      bigint,
      bigint,
      bigint,
      bigint
    ];
    return {
      totalCollateralBase: a[0],
      totalDebtBase: a[1],
      availableBorrowsBase: a[2],
      currentLiquidationThreshold: a[3],
      ltv: a[4],
      healthFactor: a[5],
    };
  }, [accountQuery.data]);

  return {
    address,
    isOverride,
    chainId: chain.chainId,
    chainName: chain.displayName,
    isUnsupportedChain,
    account,
    positions,
    loading:
      accountQuery.isLoading ||
      reservesQuery.isLoading ||
      perReserveQuery.isLoading,
    error:
      (accountQuery.error as Error | null) ??
      (reservesQuery.error as Error | null) ??
      (perReserveQuery.error as Error | null) ??
      null,
  };
}
