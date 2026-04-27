/**
 * Server-side equivalent of the `usePortfolio` React hook.
 *
 * The hook in `usePortfolio.ts` runs in the browser via wagmi. The agent's
 * tool handlers run on the Next.js server, where we have no React context
 * and no wagmi instance — so we recreate the same reads here using a raw
 * viem `PublicClient` and the same ABIs.
 *
 * Both paths return the same `Portfolio` shape (positions[], account).
 * That shape is what the math layer (`math.ts`) consumes, so the agent's
 * `simulatePriceShock` and `getLiquidationPrice` tools can reuse the
 * exact same code as the frontend's interactive simulator.
 */

import { createPublicClient, http } from "viem";
import { arbitrum } from "viem/chains";

import { AAVE_V3_ARBITRUM } from "./addresses";
import {
  AAVE_ORACLE_ABI,
  POOL_ABI,
  PROTOCOL_DATA_PROVIDER_ABI,
} from "./abi";
import type { PositionRow, UserAccountData } from "./types";

// One shared client per process — viem encourages reuse, and the public
// Arbitrum RPC is fine for read-only multicalls. If we ever need
// higher throughput, swap NEXT_PUBLIC_ARBITRUM_RPC_URL for an Alchemy /
// Infura URL.
const rpcUrl =
  process.env.NEXT_PUBLIC_ARBITRUM_RPC_URL || "https://arb1.arbitrum.io/rpc";

const client = createPublicClient({
  chain: arbitrum,
  transport: http(rpcUrl, { batch: true }),
});

export interface ServerPortfolio {
  address: `0x${string}`;
  account: UserAccountData;
  positions: PositionRow[];
}

/**
 * Load a wallet's full Aave V3 Arbitrum position. Mirrors the React hook
 * step-for-step: aggregate + reserve list + per-reserve multicall +
 * stitch.
 */
export async function getServerPortfolio(
  address: `0x${string}`
): Promise<ServerPortfolio> {
  // ---------------------------------------------------------------------
  // 1. Aggregate position
  // ---------------------------------------------------------------------
  const aggRaw = (await client.readContract({
    address: AAVE_V3_ARBITRUM.Pool as `0x${string}`,
    abi: POOL_ABI,
    functionName: "getUserAccountData",
    args: [address],
  })) as readonly [bigint, bigint, bigint, bigint, bigint, bigint];

  const account: UserAccountData = {
    totalCollateralBase: aggRaw[0],
    totalDebtBase: aggRaw[1],
    availableBorrowsBase: aggRaw[2],
    currentLiquidationThreshold: aggRaw[3],
    ltv: aggRaw[4],
    healthFactor: aggRaw[5],
  };

  // ---------------------------------------------------------------------
  // 2. Reserve list
  // ---------------------------------------------------------------------
  const reserves = (await client.readContract({
    address: AAVE_V3_ARBITRUM.AaveProtocolDataProvider as `0x${string}`,
    abi: PROTOCOL_DATA_PROVIDER_ABI,
    functionName: "getAllReservesTokens",
  })) as readonly { symbol: string; tokenAddress: `0x${string}` }[];

  // ---------------------------------------------------------------------
  // 3. Per-reserve batched reads via viem multicall
  // ---------------------------------------------------------------------
  const calls = reserves.flatMap((r) => [
    {
      address: AAVE_V3_ARBITRUM.AaveProtocolDataProvider as `0x${string}`,
      abi: PROTOCOL_DATA_PROVIDER_ABI,
      functionName: "getUserReserveData" as const,
      args: [r.tokenAddress, address] as const,
    },
    {
      address: AAVE_V3_ARBITRUM.AaveProtocolDataProvider as `0x${string}`,
      abi: PROTOCOL_DATA_PROVIDER_ABI,
      functionName: "getReserveConfigurationData" as const,
      args: [r.tokenAddress] as const,
    },
    {
      address: AAVE_V3_ARBITRUM.AaveOracle as `0x${string}`,
      abi: AAVE_ORACLE_ABI,
      functionName: "getAssetPrice" as const,
      args: [r.tokenAddress] as const,
    },
    {
      address: AAVE_V3_ARBITRUM.Pool as `0x${string}`,
      abi: POOL_ABI,
      functionName: "getReserveData" as const,
      args: [r.tokenAddress] as const,
    },
  ]);

  // allowFailure lets a single revert (rare oracle hiccup) skip the row
  // rather than blow up the whole tool call.
  const results = await client.multicall({
    contracts: calls,
    allowFailure: true,
  });

  // ---------------------------------------------------------------------
  // 4. Stitch into PositionRow[]
  // ---------------------------------------------------------------------
  const positions: PositionRow[] = [];
  for (let i = 0; i < reserves.length; i++) {
    const base = i * 4;
    const userRes = results[base];
    const cfgRes = results[base + 1];
    const priceRes = results[base + 2];
    const reserveDataRes = results[base + 3];

    if (
      userRes.status !== "success" ||
      cfgRes.status !== "success" ||
      priceRes.status !== "success" ||
      reserveDataRes.status !== "success"
    ) {
      continue;
    }

    const userArr = userRes.result as readonly [
      bigint, bigint, bigint, bigint, bigint, bigint, bigint, number, boolean
    ];
    const aTokenBalance = userArr[0];
    const variableDebtBalance = userArr[2];
    const usageAsCollateralEnabled = userArr[8];

    if (aTokenBalance === 0n && variableDebtBalance === 0n) continue;

    const cfgArr = cfgRes.result as readonly [
      bigint, bigint, bigint, bigint, bigint,
      boolean, boolean, boolean, boolean, boolean
    ];
    const decimals = Number(cfgArr[0]);
    const ltv = cfgArr[1];
    const liquidationThreshold = cfgArr[2];

    const priceBase = priceRes.result as bigint;

    const reserveData = reserveDataRes.result as {
      currentLiquidityRate: bigint;
      currentVariableBorrowRate: bigint;
    };

    positions.push({
      asset: reserves[i].tokenAddress.toLowerCase() as `0x${string}`,
      symbol: reserves[i].symbol,
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

  return { address, account, positions };
}
