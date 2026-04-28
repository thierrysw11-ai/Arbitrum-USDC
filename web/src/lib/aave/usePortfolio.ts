"use client";

import { useMemo } from "react";
import { useAccount, useReadContract, useReadContracts } from "wagmi";
import { arbitrum } from "wagmi/chains";

import { AAVE_V3_ARBITRUM } from "./addresses";
import {
  AAVE_ORACLE_ABI,
  POOL_ABI,
  PROTOCOL_DATA_PROVIDER_ABI,
} from "./abi";
import type { Portfolio, PositionRow, UserAccountData } from "./types";

/**
 * Reads an Aave V3 position on Arbitrum One.
 *
 * If `viewAddress` is supplied, reads that address regardless of whether
 * a wallet is connected — this is the "spectator" mode that powers the
 * "View any address" input on the Portfolio page (and is also the exact
 * shape Phase 2's agent will call into when reasoning about a wallet).
 *
 * If `viewAddress` is omitted, falls back to the connected wallet from
 * `useAccount()`.
 *
 * High level:
 *   1. Fetch the canonical reserve list from `ProtocolDataProvider.getAllReservesTokens()`.
 *   2. Multicall, for every reserve:
 *        - `getUserReserveData(asset, user)` → balances + collateral toggle
 *        - `getReserveConfigurationData(asset)` → decimals + LTV + LT
 *        - `AaveOracle.getAssetPrice(asset)` → USD price (8 decimals)
 *        - `Pool.getReserveData(asset)` → live ray-scaled APRs
 *   3. Filter out reserves where the user has zero collateral and zero debt.
 *   4. Read `Pool.getUserAccountData(user)` for the protocol-computed aggregate.
 *
 * Returns a `Portfolio` snapshot. Loading states bubble up; transient
 * read failures (a single reserve's price feed reverting, say) are
 * tolerated by skipping the affected row rather than failing the whole
 * call.
 */
export function usePortfolio(
  viewAddress?: `0x${string}`
): Portfolio & { address?: `0x${string}`; isOverride: boolean } {
  const { address: connectedAddress } = useAccount();
  // The address we actually read against. Override takes precedence so a
  // user can inspect any wallet without connecting.
  const address = viewAddress ?? connectedAddress;
  const isOverride = !!viewAddress && viewAddress !== connectedAddress;

  // -------------------------------------------------------------------------
  // 1. Aggregate position (single read against the Pool)
  // -------------------------------------------------------------------------
  const accountQuery = useReadContract({
    chainId: arbitrum.id,
    address: AAVE_V3_ARBITRUM.Pool as `0x${string}`,
    abi: POOL_ABI,
    functionName: "getUserAccountData",
    args: address ? [address] : undefined,
    query: {
      enabled: !!address,
      // Aave's aggregate ticks every block; 30 s staleTime is plenty for
      // a "what's my position" panel and saves a lot of RPC traffic.
      staleTime: 30_000,
    },
  });

  // -------------------------------------------------------------------------
  // 2. Canonical reserve list (rare to change, cache aggressively)
  // -------------------------------------------------------------------------
  const reservesQuery = useReadContract({
    chainId: arbitrum.id,
    address: AAVE_V3_ARBITRUM.AaveProtocolDataProvider as `0x${string}`,
    abi: PROTOCOL_DATA_PROVIDER_ABI,
    functionName: "getAllReservesTokens",
    query: {
      enabled: !!address,
      // New reserves get listed maybe a few times a year — cache for an hour.
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
    if (!address || reserveList.length === 0) return [];
    return reserveList.flatMap((r) => [
      {
        chainId: arbitrum.id,
        address: AAVE_V3_ARBITRUM.AaveProtocolDataProvider as `0x${string}`,
        abi: PROTOCOL_DATA_PROVIDER_ABI,
        functionName: "getUserReserveData",
        args: [r.tokenAddress, address],
      },
      {
        chainId: arbitrum.id,
        address: AAVE_V3_ARBITRUM.AaveProtocolDataProvider as `0x${string}`,
        abi: PROTOCOL_DATA_PROVIDER_ABI,
        functionName: "getReserveConfigurationData",
        args: [r.tokenAddress],
      },
      {
        chainId: arbitrum.id,
        address: AAVE_V3_ARBITRUM.AaveOracle as `0x${string}`,
        abi: AAVE_ORACLE_ABI,
        functionName: "getAssetPrice",
        args: [r.tokenAddress],
      },
      {
        chainId: arbitrum.id,
        address: AAVE_V3_ARBITRUM.Pool as `0x${string}`,
        abi: POOL_ABI,
        functionName: "getReserveData",
        args: [r.tokenAddress],
      },
    ]);
  }, [address, reserveList]);

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

      // getUserReserveData returns 9 fields as a tuple. Wagmi/viem types
      // these as a wide union (any of the contracts in our multicall could
      // be returning); we know which call this index is from at runtime, so
      // cast through unknown to satisfy stricter Vercel tsc.
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

      // Pool.getReserveData returns a struct — viem decodes the tuple into
      // an object keyed by the named fields when the ABI declares them.
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
