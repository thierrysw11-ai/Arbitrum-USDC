/**
 * Tool registry for the Sentinel agent.
 *
 * Each tool is a server-side function the agent can call to gather facts
 * about a wallet. The tools wrap our existing server-side reader
 * (`server.ts`) and pure-math layer (`math.ts`), so the numbers an agent
 * quotes are exactly the numbers shown in the Portfolio UI — no parallel
 * implementation drift.
 *
 * Each entry exports:
 *   - `definition`: the JSON schema Anthropic needs to understand the tool
 *   - `handler(input)`: the actual server-side function
 */

import { createPublicClient, http, isAddress, type Address } from "viem";
import { mainnet } from "viem/chains";

import { getServerPortfolio } from "@/lib/aave/server";
import { paidFetch } from "@/lib/x402/agent-fetch";
import {
  applyPriceShock,
  baseToUsd,
  formatHealthFactor,
  formatUsd,
  liquidationPriceForAsset,
  rayAprToApy,
  tokenToFloat,
  wadToFloat,
} from "@/lib/aave/math";
import {
  getChain,
  getChainBySlug,
  type ChainSlug,
} from "@/lib/chains";

// --------------------------------------------------------------------------
// Helpers — Aave portfolio summarization
// --------------------------------------------------------------------------

/**
 * Compress a `Portfolio` into the shape we want Claude to see — small,
 * human-numbered, no bigints. Bigints don't survive JSON.stringify cleanly
 * and the model doesn't need WAD-precision; it needs floats it can reason
 * about in plain English.
 */
function summarizePortfolio(p: Awaited<ReturnType<typeof getServerPortfolio>>) {
  const totalCollateralUsd = baseToUsd(p.account.totalCollateralBase);
  const totalDebtUsd = baseToUsd(p.account.totalDebtBase);
  const hf = wadToFloat(p.account.healthFactor);
  const liqThreshold = Number(p.account.currentLiquidationThreshold) / 10_000;

  const positions = p.positions.map((pos) => {
    const supplied = tokenToFloat(pos.aTokenBalance, pos.decimals);
    const borrowed = tokenToFloat(pos.variableDebtBalance, pos.decimals);
    const priceUsd = Number(pos.priceBase) / 1e8;
    const supplyApy = rayAprToApy(pos.liquidityRate);
    const borrowApy = rayAprToApy(pos.variableBorrowRate);
    const liqPriceBase = liquidationPriceForAsset(
      pos,
      p.positions,
      p.account.totalDebtBase
    );
    const liqPriceUsd =
      liqPriceBase !== null ? Number(liqPriceBase) / 1e8 : null;
    return {
      asset: pos.asset,
      symbol: pos.symbol,
      supplied,
      suppliedUsd: supplied * priceUsd,
      borrowed,
      borrowedUsd: borrowed * priceUsd,
      priceUsd,
      supplyApy,
      borrowApy,
      isCollateral: pos.usageAsCollateralEnabled && pos.aTokenBalance > 0n,
      liquidationPriceUsd: liqPriceUsd,
      liquidationThreshold:
        Number(pos.liquidationThreshold) / 10_000,
    };
  });

  return {
    address: p.address,
    healthFactor: hf,
    healthFactorDisplay: formatHealthFactor(p.account.healthFactor),
    totalCollateralUsd,
    totalCollateralUsdDisplay: formatUsd(totalCollateralUsd),
    totalDebtUsd,
    totalDebtUsdDisplay: formatUsd(totalDebtUsd),
    weightedLiquidationThreshold: liqThreshold,
    isLiquidatable: hf > 0 && hf < 1,
    positions,
  };
}

// --------------------------------------------------------------------------
// Recent activity — Aave subgraph
// --------------------------------------------------------------------------

const SUBGRAPH_URL =
  process.env.NEXT_PUBLIC_AAVE_SUBGRAPH_URL ||
  "https://api.studio.thegraph.com/query/4928/aave-subgraph/v0.2.0";

async function fetchRecentActivity(symbol?: string): Promise<unknown> {
  const filter = symbol
    ? `where: { reserve_: { symbol: "${symbol.toUpperCase()}" } },`
    : "";
  const query = `
    query Recent {
      borrows(first: 10, orderBy: timestamp, orderDirection: desc, ${filter}) {
        user { id }
        reserve { symbol decimals }
        amount
        timestamp
      }
      repays(first: 10, orderBy: timestamp, orderDirection: desc, ${filter}) {
        user { id }
        reserve { symbol decimals }
        amount
        timestamp
      }
      liquidations(first: 5, orderBy: timestamp, orderDirection: desc) {
        user { id }
        liquidator
        debtAsset { symbol }
        collateralAsset { symbol }
        debtToCover
        liquidatedCollateralAmount
        timestamp
      }
    }
  `;
  const res = await fetch(SUBGRAPH_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) {
    throw new Error(`Subgraph returned ${res.status}`);
  }
  const json = await res.json();
  if (json.errors) {
    throw new Error(
      `Subgraph errors: ${json.errors.map((e: { message: string }) => e.message).join("; ")}`
    );
  }
  return json.data;
}

// --------------------------------------------------------------------------
// Swissborg / CHSB (Ethereum mainnet) — ERC-20 indexer + balanceOf
// --------------------------------------------------------------------------

const SWISSBORG_SUBGRAPH_ID =
  "9kSBz2fuubY6dMBxEAUhZMa6SqE93YiAuJTzfrde7Kt8";

function swissborgSubgraphUrl(): string | null {
  if (process.env.SWISSBORG_SUBGRAPH_URL) {
    return process.env.SWISSBORG_SUBGRAPH_URL;
  }
  const key = process.env.NEXT_PUBLIC_GRAPH_API_KEY;
  if (!key) return null;
  return `https://gateway.thegraph.com/api/${key}/subgraphs/id/${SWISSBORG_SUBGRAPH_ID}`;
}

interface SbTransfer {
  id: string;
  from: string;
  to: string;
  value: string;
  timestamp: string;
  txHash: string;
  blockNumber: string;
}

async function fetchSwissborgActivity(
  address: string,
  limit: number
): Promise<{
  recentTransfers: Array<{
    direction: "in" | "out";
    counterparty: string;
    value: string;
    valueFormatted: number;
    timestamp: number;
    txHash: string;
    blockNumber: number;
  }>;
  derivedBalance: {
    value: string;
    valueFormatted: number;
    note: string;
  };
}> {
  const url = swissborgSubgraphUrl();
  if (!url) {
    throw new Error(
      "Swissborg subgraph URL not configured. Set SWISSBORG_SUBGRAPH_URL " +
        "or NEXT_PUBLIC_GRAPH_API_KEY in .env.local."
    );
  }

  const query = `
    query SbActivity($addr: Bytes!, $limit: Int!) {
      out: transfers(
        first: $limit
        orderBy: timestamp
        orderDirection: desc
        where: { from: $addr }
      ) {
        id from to value timestamp txHash blockNumber
      }
      in_: transfers(
        first: $limit
        orderBy: timestamp
        orderDirection: desc
        where: { to: $addr }
      ) {
        id from to value timestamp txHash blockNumber
      }
    }
  `;

  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      query,
      variables: { addr: address.toLowerCase(), limit },
    }),
  });
  if (!res.ok) {
    throw new Error(`Swissborg subgraph returned ${res.status}`);
  }
  const json = (await res.json()) as {
    data?: { out: SbTransfer[]; in_: SbTransfer[] };
    errors?: Array<{ message: string }>;
  };
  if (json.errors) {
    throw new Error(
      `Swissborg subgraph errors: ${json.errors.map((e) => e.message).join("; ")}`
    );
  }
  const out = json.data?.out ?? [];
  const ins = json.data?.in_ ?? [];

  const DECIMALS = 8n;
  const SCALE = 10n ** DECIMALS;
  const formatRaw = (v: string): number => {
    try {
      const big = BigInt(v);
      const whole = big / SCALE;
      const frac = big % SCALE;
      return Number(whole) + Number(frac) / Number(SCALE);
    } catch {
      return Number.NaN;
    }
  };

  let net = 0n;
  for (const t of ins) net += BigInt(t.value);
  for (const t of out) net -= BigInt(t.value);

  const merged = [
    ...ins.map((t) => ({ ...t, _dir: "in" as const })),
    ...out.map((t) => ({ ...t, _dir: "out" as const })),
  ];
  const seen = new Set<string>();
  const dedup: typeof merged = [];
  for (const t of merged) {
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    dedup.push(t);
  }
  dedup.sort((a, b) => Number(b.timestamp) - Number(a.timestamp));
  const recent = dedup.slice(0, limit);

  return {
    recentTransfers: recent.map((t) => ({
      direction: t._dir,
      counterparty: t._dir === "in" ? t.from : t.to,
      value: t.value,
      valueFormatted: formatRaw(t.value),
      timestamp: Number(t.timestamp),
      txHash: t.txHash,
      blockNumber: Number(t.blockNumber),
    })),
    derivedBalance: {
      value: net.toString(),
      valueFormatted: formatRaw(net.toString()),
      note:
        "Net flow derived from indexed transfers (assumes 8-decimal token, " +
        "BORG/CHSB convention). Accurate only if the subgraph has indexed " +
        "from token genesis; otherwise treat as balance change since the " +
        "indexer's start block.",
    },
  };
}

// On-chain BORG/CHSB balanceOf via viem (Ethereum mainnet)

const DEFAULT_BORG_CONTRACT: Address =
  "0xba9d4199faB4f26eFE3551D490E3821486f135Ba";

const MAINNET_RPC_URL =
  process.env.MAINNET_RPC_URL ||
  process.env.NEXT_PUBLIC_MAINNET_RPC_URL ||
  "https://eth.llamarpc.com";

const mainnetClient = createPublicClient({
  chain: mainnet,
  transport: http(MAINNET_RPC_URL, { batch: true }),
});

const ERC20_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "decimals",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    name: "symbol",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
] as const;

function readBorgContract(): Address {
  const raw = process.env.BORG_CONTRACT_ADDRESS;
  if (raw && isAddress(raw)) return raw.toLowerCase() as Address;
  return DEFAULT_BORG_CONTRACT;
}

async function fetchBorgBalance(
  address: Address,
  contractOverride?: Address
): Promise<{
  contract: Address;
  symbol: string;
  decimals: number;
  balance: string;
  balanceFormatted: number;
}> {
  const contract = contractOverride ?? readBorgContract();

  const [bal, dec, sym] = await mainnetClient.multicall({
    contracts: [
      { address: contract, abi: ERC20_ABI, functionName: "balanceOf", args: [address] },
      { address: contract, abi: ERC20_ABI, functionName: "decimals" },
      { address: contract, abi: ERC20_ABI, functionName: "symbol" },
    ],
    allowFailure: false,
  });

  const decimals = Number(dec);
  const scale = 10n ** BigInt(decimals);
  const whole = bal / scale;
  const frac = bal % scale;
  const balanceFormatted = Number(whole) + Number(frac) / Number(scale);

  return {
    contract,
    symbol: String(sym),
    decimals,
    balance: bal.toString(),
    balanceFormatted,
  };
}

// --------------------------------------------------------------------------
// Wallet holdings — multi-chain ERC-20 + native scan via Alchemy
//
// For each supported chain (Arbitrum, Base, Optimism, Polygon) Alchemy
// exposes:
//   - alchemy_getTokenBalances(address, "erc20") → list of every ERC-20
//     the wallet has ever touched, with raw balance.
//   - alchemy_getTokenMetadata(contract) → symbol, name, decimals.
//   - eth_getBalance(address) → native gas-token balance (standard JSON-RPC).
//
// We fan out one balance call + N metadata calls (one per non-zero token),
// running metadata calls in parallel. For a typical wallet this resolves
// within a few seconds.
//
// Note: Alchemy's token-balances result includes airdropped/spam tokens
// the wallet didn't ask for. We don't filter them server-side — the agent
// can reason about whether a token is plausibly real. Filtering at the
// source would risk dropping legitimate small balances.
// --------------------------------------------------------------------------

const ALCHEMY_NETWORK_BY_CHAIN_ID: Record<number, string> = {
  42161: "arb-mainnet",
  8453: "base-mainnet",
  10: "opt-mainnet",
  137: "polygon-mainnet",
};

function alchemyUrl(chainId: number): string | null {
  const key = process.env.ALCHEMY_API_KEY;
  if (!key) return null;
  const network = ALCHEMY_NETWORK_BY_CHAIN_ID[chainId];
  if (!network) return null;
  return `https://${network}.g.alchemy.com/v2/${key}`;
}

interface AlchemyTokenBalance {
  contractAddress: string;
  tokenBalance: string; // hex
}

interface AlchemyTokenMetadata {
  decimals: number | null;
  logo: string | null;
  name: string | null;
  symbol: string | null;
}

async function alchemyJsonRpc<T>(
  url: string,
  method: string,
  params: unknown[]
): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: 1, jsonrpc: "2.0", method, params }),
  });
  if (!res.ok) throw new Error(`Alchemy ${method} returned ${res.status}`);
  const json = (await res.json()) as { result?: T; error?: { message: string } };
  if (json.error) throw new Error(`Alchemy ${method} error: ${json.error.message}`);
  if (json.result === undefined) {
    throw new Error(`Alchemy ${method} returned no result`);
  }
  return json.result;
}

interface WalletHoldingsResult {
  chainId: number;
  chainName: string;
  address: string;
  nativeBalance: {
    symbol: string;
    balance: string;
    balanceFormatted: number;
  };
  erc20Count: number;
  erc20: Array<{
    contract: string;
    symbol: string;
    name: string | null;
    decimals: number;
    balance: string;
    balanceFormatted: number;
  }>;
  note?: string;
}

async function fetchWalletHoldings(
  address: string,
  chainId: number
): Promise<WalletHoldingsResult> {
  const url = alchemyUrl(chainId);
  if (!url) {
    throw new Error(
      "Wallet scan requires ALCHEMY_API_KEY to be set on the server, and " +
        `the chain (chainId=${chainId}) must be Arbitrum, Base, Optimism, or Polygon.`
    );
  }

  const chain = getChain(chainId);
  const chainName = chain?.displayName ?? `chainId ${chainId}`;
  const nativeSymbol = chain?.nativeCurrency.symbol ?? "ETH";

  // 1. ERC-20 balances + native balance, in parallel.
  const [balResult, nativeHex] = await Promise.all([
    alchemyJsonRpc<{ tokenBalances: AlchemyTokenBalance[] }>(
      url,
      "alchemy_getTokenBalances",
      [address, "erc20"]
    ),
    alchemyJsonRpc<string>(url, "eth_getBalance", [address, "latest"]),
  ]);

  const nativeWei = BigInt(nativeHex);
  const nativeFormatted = Number(nativeWei) / 1e18;

  const nonZero = balResult.tokenBalances.filter((t) => {
    if (!t.tokenBalance) return false;
    try {
      return BigInt(t.tokenBalance) > 0n;
    } catch {
      return false;
    }
  });

  // 2. Resolve metadata for each non-zero ERC-20 in parallel. A wallet
  // holding 100+ spam tokens will issue 100+ metadata calls; bound the work
  // so we don't blow Alchemy's rate limits.
  const TOKEN_LIMIT = 50;
  const truncated = nonZero.length > TOKEN_LIMIT;
  const slice = nonZero.slice(0, TOKEN_LIMIT);

  const enriched = await Promise.all(
    slice.map(async (t) => {
      try {
        const meta = await alchemyJsonRpc<AlchemyTokenMetadata>(
          url,
          "alchemy_getTokenMetadata",
          [t.contractAddress]
        );
        const decimals = meta.decimals ?? 18;
        const balance = BigInt(t.tokenBalance);
        const scale = 10n ** BigInt(decimals);
        const whole = balance / scale;
        const frac = balance % scale;
        const balanceFormatted =
          Number(whole) + Number(frac) / Number(scale);
        return {
          contract: t.contractAddress,
          symbol: meta.symbol ?? "(unknown)",
          name: meta.name,
          decimals,
          balance: t.tokenBalance,
          balanceFormatted,
        };
      } catch {
        return {
          contract: t.contractAddress,
          symbol: "(unresolvable)",
          name: null,
          decimals: 18,
          balance: t.tokenBalance,
          balanceFormatted: 0,
        };
      }
    })
  );

  // Sort so the user's biggest positions surface first.
  enriched.sort((a, b) => b.balanceFormatted - a.balanceFormatted);

  return {
    chainId,
    chainName,
    address,
    nativeBalance: {
      symbol: nativeSymbol,
      balance: nativeWei.toString(),
      balanceFormatted: nativeFormatted,
    },
    erc20Count: nonZero.length,
    erc20: enriched,
    note: truncated
      ? `Showing top ${TOKEN_LIMIT} ERC-20s by raw balance; wallet has ${nonZero.length} non-zero token positions including airdropped/spam tokens.`
      : undefined,
  };
}

// --------------------------------------------------------------------------
// Tool definitions (Anthropic schema)
// --------------------------------------------------------------------------

export const TOOL_DEFINITIONS = [
  {
    name: "get_portfolio",
    description:
      "Read a wallet's live Aave V3 position on Arbitrum One: health " +
      "factor, total collateral and debt in USD, and a per-asset breakdown " +
      "showing supplied/borrowed amounts, supply/borrow APYs, current " +
      "USD price, and the liquidation price for each collateral asset.",
    input_schema: {
      type: "object",
      properties: {
        address: {
          type: "string",
          description:
            "Ethereum address (0x-prefixed hex, 42 chars). The wallet to inspect.",
        },
      },
      required: ["address"],
    },
  },
  {
    name: "simulate_price_shock",
    description:
      "Simulate what would happen to a wallet's health factor if an asset " +
      "price moves. Use this to answer 'what if' questions like 'what " +
      "happens to my position if ETH drops 30%?' or 'how bad would a " +
      "market-wide 50% crash be?'.",
    input_schema: {
      type: "object",
      properties: {
        address: { type: "string", description: "Wallet to simulate against" },
        asset: {
          type: "string",
          description:
            "Token symbol to shock (e.g. 'WETH', 'ARB', 'USDC'), or the " +
            "literal string 'ALL_NON_STABLE' to shock every non-stable " +
            "asset uniformly (use this for 'market crash' scenarios).",
        },
        pctChange: {
          type: "number",
          description:
            "Percent price change. Negative = drop (e.g. -30 for 30% drop), " +
            "positive = pump. Range -90 to +200.",
        },
      },
      required: ["address", "asset", "pctChange"],
    },
  },
  {
    name: "get_liquidation_price",
    description:
      "Get the exact USD price an asset would have to drop to before the " +
      "wallet's position becomes liquidatable, holding all other prices " +
      "constant. Returns null if the asset isn't a collateral asset for " +
      "this wallet, if there's no debt, or if other collateral is enough " +
      "to cover the debt by itself.",
    input_schema: {
      type: "object",
      properties: {
        address: { type: "string" },
        asset: {
          type: "string",
          description: "Token symbol to compute the liquidation price for.",
        },
      },
      required: ["address", "asset"],
    },
  },
  {
    name: "get_recent_activity",
    description:
      "Query the Aave V3 Arbitrum subgraph for recent on-chain activity: " +
      "the latest borrows, repays, and liquidations. Useful for answering " +
      "questions like 'is anyone getting liquidated right now?' or 'what's " +
      "the recent activity in WETH?'. Optionally filter by asset symbol.",
    input_schema: {
      type: "object",
      properties: {
        symbol: {
          type: "string",
          description:
            "Optional. If provided, only return activity for this reserve " +
            "(e.g. 'WETH', 'USDC'). If omitted, returns market-wide activity.",
        },
      },
    },
  },
  {
    name: "get_wallet_holdings",
    description:
      "Scan a wallet on a given chain (Arbitrum One, Base, Optimism, or " +
      "Polygon) and return all non-zero ERC-20 token balances plus the " +
      "native gas-token balance. Resolves token symbols, names, and decimals " +
      "via Alchemy. Sorted by formatted balance descending. Use this to " +
      "answer 'what's in this wallet?', 'what does the user hold besides " +
      "Aave?', or 'show me the user's MetaMask portfolio'. " +
      "IMPORTANT: Alchemy returns every ERC-20 the wallet has ever touched, " +
      "INCLUDING airdropped scam tokens with fake high values. Treat unknown " +
      "tokens skeptically; weight your portfolio reasoning toward tokens you " +
      "recognize (USDC, WETH, WBTC, DAI, USDT, ARB, AAVE, etc.) and known " +
      "Aave receipts. Don't quote unfamiliar token balances as user wealth " +
      "without flagging that the token might be spam.",
    input_schema: {
      type: "object",
      properties: {
        address: {
          type: "string",
          description:
            "Ethereum address (0x-prefixed hex, 42 chars). The wallet to scan.",
        },
        chain: {
          type: "string",
          enum: ["arbitrum-one", "base", "optimism", "polygon"],
          description:
            "Which chain to scan. Defaults to 'arbitrum-one' if omitted.",
        },
      },
      required: ["address"],
    },
  },
  {
    name: "get_chsb_balance",
    description:
      "Read a wallet's legacy CHSB ERC-20 balance on Ethereum mainnet via " +
      "balanceOf at 0xba9d...135Ba. CHSB is the original Swissborg token; " +
      "Swissborg has since rebranded it to BORG and moved the canonical " +
      "token to Solana (SPL). This tool ONLY sees un-migrated CHSB on " +
      "Ethereum — it does NOT return current BORG holdings, and it does " +
      "NOT see balances held custodially inside the Swissborg app. Use " +
      "this only when the user explicitly asks about Ethereum CHSB.",
    input_schema: {
      type: "object",
      properties: {
        address: {
          type: "string",
          description:
            "Ethereum mainnet address (0x-prefixed hex). The wallet to inspect.",
        },
      },
      required: ["address"],
    },
  },
  {
    name: "get_chsb_activity",
    description:
      "Read recent legacy CHSB ERC-20 transfers for a wallet on Ethereum " +
      "mainnet via the user's CHSB transfer-indexer subgraph. Returns " +
      "in/out transfers plus a net flow derived from indexed history. Same " +
      "scope caveat as get_chsb_balance: this is legacy CHSB on Ethereum, " +
      "not current BORG on Solana, and not custodial Swissborg balances.",
    input_schema: {
      type: "object",
      properties: {
        address: {
          type: "string",
          description:
            "Ethereum mainnet address (0x-prefixed hex). The wallet to inspect.",
        },
        limit: {
          type: "number",
          description:
            "Optional. Max number of transfers to return (default 10, max 50).",
        },
      },
      required: ["address"],
    },
  },
  {
    name: "get_premium_analysis",
    description:
      "Run a paid premium analysis on an Aave V3 Arbitrum position. " +
      "This calls a paywalled internal endpoint that returns a multi-asset " +
      "shock matrix (-50%, -30%, -10% across all non-stable collateral " +
      "simultaneously) plus the resulting health factor at each step. " +
      "Costs 0.01 USDC per call, settled on-chain via x402 from the " +
      "agent's own wallet on Arbitrum One. Use this when the user wants " +
      "deeper risk analysis than get_portfolio + simulate_price_shock can " +
      "provide, or when they explicitly ask for the premium / paid analysis. " +
      "The response includes the on-chain settlement tx hash on Arbiscan.",
    input_schema: {
      type: "object",
      properties: {
        address: {
          type: "string",
          description:
            "Arbitrum address (0x-prefixed hex) whose Aave position to analyze.",
        },
      },
      required: ["address"],
    },
  },
] as const;

// --------------------------------------------------------------------------
// Tool handlers — actually run the requested tool, return JSON-safe data.
// --------------------------------------------------------------------------

export type ToolName = (typeof TOOL_DEFINITIONS)[number]["name"];

export async function runTool(
  name: string,
  rawInput: unknown
): Promise<unknown> {
  const input = rawInput as Record<string, unknown>;

  switch (name) {
    case "get_portfolio": {
      const address = String(input.address ?? "").toLowerCase();
      if (!isAddress(address)) {
        return { error: `Not a valid 0x address: ${address}` };
      }
      try {
        const p = await getServerPortfolio(address as `0x${string}`);
        return summarizePortfolio(p);
      } catch (err) {
        return { error: (err as Error).message };
      }
    }

    case "simulate_price_shock": {
      const address = String(input.address ?? "").toLowerCase();
      const asset = String(input.asset ?? "");
      const pct = Number(input.pctChange);
      if (!isAddress(address)) {
        return { error: `Not a valid 0x address: ${address}` };
      }
      if (!asset) return { error: "Missing asset symbol" };
      if (!Number.isFinite(pct)) return { error: "pctChange must be a number" };

      try {
        const p = await getServerPortfolio(address as `0x${string}`);
        const shock = applyPriceShock(p.positions, {
          assetSymbol: asset,
          pctChange: pct,
        });
        const beforeHf = wadToFloat(p.account.healthFactor);
        const afterHf = wadToFloat(shock.shockedHealthFactor);
        return {
          address,
          shock: { asset, pctChange: pct },
          before: {
            healthFactor: beforeHf,
            healthFactorDisplay: formatHealthFactor(p.account.healthFactor),
            totalCollateralUsd: baseToUsd(p.account.totalCollateralBase),
            totalDebtUsd: baseToUsd(p.account.totalDebtBase),
          },
          after: {
            healthFactor: afterHf,
            healthFactorDisplay: formatHealthFactor(shock.shockedHealthFactor),
            totalCollateralUsd: baseToUsd(shock.shockedCollateralBase),
            totalDebtUsd: baseToUsd(shock.shockedDebtBase),
            isLiquidatable: shock.liquidatable,
          },
        };
      } catch (err) {
        return { error: (err as Error).message };
      }
    }

    case "get_liquidation_price": {
      const address = String(input.address ?? "").toLowerCase();
      const asset = String(input.asset ?? "");
      if (!isAddress(address)) {
        return { error: `Not a valid 0x address: ${address}` };
      }
      try {
        const p = await getServerPortfolio(address as `0x${string}`);
        const target = p.positions.find(
          (pos) => pos.symbol.toUpperCase() === asset.toUpperCase()
        );
        if (!target) {
          return {
            address,
            asset,
            liquidationPriceUsd: null,
            note: `Wallet has no position in ${asset}. Available symbols: ${p.positions.map((x) => x.symbol).join(", ") || "(none)"}`,
          };
        }
        const liqBase = liquidationPriceForAsset(
          target,
          p.positions,
          p.account.totalDebtBase
        );
        return {
          address,
          asset: target.symbol,
          currentPriceUsd: Number(target.priceBase) / 1e8,
          liquidationPriceUsd:
            liqBase !== null ? Number(liqBase) / 1e8 : null,
          note:
            liqBase === null
              ? "Either there's no debt, or other collateral covers all debt by itself."
              : undefined,
        };
      } catch (err) {
        return { error: (err as Error).message };
      }
    }

    case "get_recent_activity": {
      const symbol =
        typeof input.symbol === "string" ? input.symbol : undefined;
      try {
        const data = await fetchRecentActivity(symbol);
        return data;
      } catch (err) {
        return { error: (err as Error).message };
      }
    }

    case "get_wallet_holdings": {
      const address = String(input.address ?? "").toLowerCase();
      if (!isAddress(address)) {
        return { error: `Not a valid 0x address: ${address}` };
      }
      const slugInput =
        typeof input.chain === "string" ? input.chain : "arbitrum-one";
      const chain = getChainBySlug(slugInput);
      if (!chain) {
        return {
          error: `Unsupported chain slug: ${slugInput}. Use one of: arbitrum-one, base, optimism, polygon.`,
        };
      }
      try {
        return await fetchWalletHoldings(address, chain.chainId);
      } catch (err) {
        return { error: (err as Error).message };
      }
    }

    case "get_chsb_balance": {
      const address = String(input.address ?? "").toLowerCase();
      if (!isAddress(address)) {
        return { error: `Not a valid 0x address: ${address}` };
      }
      try {
        const data = await fetchBorgBalance(address as Address);
        return {
          chain: "ethereum",
          token: "CHSB (legacy Swissborg ERC-20)",
          scope:
            "On-chain CHSB only. Does not reflect BORG on Solana or " +
            "custodial Swissborg-app balances.",
          address,
          ...data,
        };
      } catch (err) {
        return { error: (err as Error).message };
      }
    }

    case "get_chsb_activity": {
      const address = String(input.address ?? "").toLowerCase();
      if (!isAddress(address)) {
        return { error: `Not a valid 0x address: ${address}` };
      }
      const rawLimit = Number(input.limit);
      const limit = Number.isFinite(rawLimit)
        ? Math.max(1, Math.min(50, Math.floor(rawLimit)))
        : 10;
      try {
        const data = await fetchSwissborgActivity(address, limit);
        return {
          chain: "ethereum",
          token: "CHSB (legacy Swissborg ERC-20)",
          scope:
            "On-chain CHSB transfers only. Does not reflect BORG on Solana " +
            "or custodial Swissborg-app balances.",
          address,
          ...data,
        };
      } catch (err) {
        return { error: (err as Error).message };
      }
    }

    case "get_premium_analysis": {
      const address = String(input.address ?? "").toLowerCase();
      if (!isAddress(address)) {
        return { error: `Not a valid 0x address: ${address}` };
      }
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
      const url = `${baseUrl}/api/agent/premium-analysis`;
      try {
        const { response, payment } = await paidFetch(
          url,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ address }),
          },
          { preferredNetwork: "arbitrum-one" }
        );
        if (!response.ok) {
          const text = await response.text();
          return {
            error: `paid endpoint returned ${response.status}: ${text}`,
            payment,
          };
        }
        const data = await response.json();
        const txHash = payment.paymentResponse?.txHash;
        return {
          ...data,
          x402: {
            paid: payment.paid,
            network: payment.requirement?.network,
            amountUsdc:
              payment.requirement &&
              `${(Number(payment.requirement.maxAmountRequired) / 1e6).toFixed(2)} USDC`,
            settlementTxHash: txHash,
            arbiscanUrl: txHash ? `https://arbiscan.io/tx/${txHash}` : undefined,
            settlementSuccess: payment.paymentResponse?.success,
            settlementError: payment.paymentResponse?.errorReason,
          },
        };
      } catch (err) {
        return { error: (err as Error).message };
      }
    }

    default:
      return { error: `Unknown tool: ${name}. Available: ${TOOL_DEFINITIONS.map((t) => t.name).join(", ")}` };
  }
}

// Note: `_chainSlug` typing unused in this file but kept in the registry import
// so future tools can pass a slug through without re-importing the type.
type _ChainSlugUnused = ChainSlug;
export type { _ChainSlugUnused };
