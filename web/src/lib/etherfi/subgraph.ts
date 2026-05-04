/**
 * ether.fi subgraph access.
 *
 * Two subgraphs published on the decentralized network (gateway URLs
 * built per-call from NEXT_PUBLIC_GRAPH_API_KEY so the key isn't leaked
 * in source).
 *
 *   etherfi-Arbitrum  — weETH activity on Arbitrum One.
 *     Schema (verified against sample query):
 *       Protocol { id, totalHolders, totalTransferCount, totalVolumeTransferred }
 *       Token    { id (address), symbol, name, decimals, totalSupply,
 *                  totalTransferred, transferCount }
 *       Account  { id (address), balance, lastSeenAt, totalReceived }
 *       LargeTransfer { id, ... }
 *
 *   EtherFi-restaking-subgraph — core protocol on Ethereum mainnet.
 *     Schema not yet inspected — wired here for future extension.
 *
 * Both subgraphs index weETH = 0x35751007a407ca6FEFfE80b3cB397736D2cf4dbe
 * on their respective chains.
 */

const ARB_SUBGRAPH_ID = '8dZJWkNCJ5BTbK4m3MAQ5yNhZzD2rqjNyp3yoVo5v7B5';
const MAINNET_SUBGRAPH_ID = 'Cd5KbWfQyYfFEJGpbwCgqVaGUJhUsL5FbMjRX4KRWNBt';

export const WEETH_ARBITRUM_ADDRESS =
  '0x35751007a407ca6FEFfE80b3cB397736D2cf4dbe';
export const WEETH_MAINNET_ADDRESS =
  '0xCd5fE23C85820F7B72D0926FC9b05b43E359b7ee';

function gatewayUrl(deploymentId: string): string | null {
  const key = process.env.NEXT_PUBLIC_GRAPH_API_KEY;
  if (!key) return null;
  return `https://gateway.thegraph.com/api/${key}/subgraphs/id/${deploymentId}`;
}

export const arbSubgraphUrl = (): string | null => gatewayUrl(ARB_SUBGRAPH_ID);
export const mainnetSubgraphUrl = (): string | null =>
  gatewayUrl(MAINNET_SUBGRAPH_ID);

// =========================================================================
// Wire shapes — keep nullable everywhere because The Graph returns
// `null` for missing entities.
// =========================================================================

export interface EtherfiProtocolStats {
  id: string;
  totalHolders: number;
  totalTransferCount: number;
  /** Total volume in raw uint256. Caller divides by 10^decimals. */
  totalVolumeTransferred: bigint;
}

export interface EtherfiTokenStats {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  totalSupplyRaw: bigint;
  totalSupplyFormatted: number;
  totalTransferredRaw: bigint;
  transferCount: number;
}

export interface EtherfiAccountStats {
  address: string;
  balanceRaw: bigint;
  balanceFormatted: number;
  lastSeenAt: number; // unix seconds
  totalReceivedRaw: bigint;
  totalReceivedFormatted: number;
}

export interface EtherfiArbInsights {
  protocol: EtherfiProtocolStats | null;
  token: EtherfiTokenStats | null;
  account: EtherfiAccountStats | null;
  /** True if the wallet was found in the Account index, i.e. has
   *  ever held weETH on Arbitrum (balance may be 0 now). */
  hasEverHeld: boolean;
}

// =========================================================================
// Query — Arbitrum subgraph
// =========================================================================

const ARB_INSIGHTS_QUERY = `
  query EtherfiArbInsights($addr: ID!) {
    protocols(first: 1) {
      id
      totalHolders
      totalTransferCount
      totalVolumeTransferred
    }
    tokens(first: 1) {
      id
      symbol
      name
      decimals
      totalSupply
      totalTransferred
      transferCount
    }
    account(id: $addr) {
      id
      balance
      lastSeenAt
      totalReceived
    }
  }
`;

interface ArbQueryResponse {
  data?: {
    protocols: Array<{
      id: string;
      totalHolders: string;
      totalTransferCount: string;
      totalVolumeTransferred: string;
    }>;
    tokens: Array<{
      id: string;
      symbol: string;
      name: string;
      decimals: number;
      totalSupply: string;
      totalTransferred: string;
      transferCount: string;
    }>;
    account: {
      id: string;
      balance: string;
      lastSeenAt: string;
      totalReceived: string;
    } | null;
  };
  errors?: Array<{ message: string }>;
}

/**
 * Fetch the headline ether.fi-Arbitrum insights for a given address. Uses
 * a single GraphQL query (3 entity reads) so the network cost is one
 * round-trip regardless of which fields the UI ends up rendering.
 */
export async function fetchEtherfiArbInsights(
  address: string
): Promise<EtherfiArbInsights> {
  const url = arbSubgraphUrl();
  if (!url) {
    throw new Error(
      'NEXT_PUBLIC_GRAPH_API_KEY not configured — etherfi subgraph unreachable'
    );
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      query: ARB_INSIGHTS_QUERY,
      variables: { addr: address.toLowerCase() },
    }),
  });
  if (!res.ok) {
    throw new Error(`ether.fi subgraph HTTP ${res.status}`);
  }
  const json = (await res.json()) as ArbQueryResponse;
  if (json.errors && json.errors.length > 0) {
    throw new Error(
      `ether.fi subgraph errors: ${json.errors.map((e) => e.message).join('; ')}`
    );
  }

  const data = json.data;
  if (!data) {
    throw new Error('ether.fi subgraph returned no data');
  }

  const formatRaw = (raw: string, decimals: number): number => {
    try {
      const big = BigInt(raw);
      const scale = 10n ** BigInt(decimals);
      const whole = big / scale;
      const frac = big % scale;
      return Number(whole) + Number(frac) / Number(scale);
    } catch {
      return Number.NaN;
    }
  };

  const protocolRaw = data.protocols[0];
  const tokenRaw = data.tokens[0];
  const decimals = tokenRaw?.decimals ?? 18;

  const protocol: EtherfiProtocolStats | null = protocolRaw
    ? {
        id: protocolRaw.id,
        totalHolders: Number(protocolRaw.totalHolders),
        totalTransferCount: Number(protocolRaw.totalTransferCount),
        totalVolumeTransferred: BigInt(protocolRaw.totalVolumeTransferred),
      }
    : null;

  const token: EtherfiTokenStats | null = tokenRaw
    ? {
        address: tokenRaw.id,
        symbol: tokenRaw.symbol,
        name: tokenRaw.name,
        decimals: tokenRaw.decimals,
        totalSupplyRaw: BigInt(tokenRaw.totalSupply),
        totalSupplyFormatted: formatRaw(tokenRaw.totalSupply, decimals),
        totalTransferredRaw: BigInt(tokenRaw.totalTransferred),
        transferCount: Number(tokenRaw.transferCount),
      }
    : null;

  const account: EtherfiAccountStats | null = data.account
    ? {
        address: data.account.id,
        balanceRaw: BigInt(data.account.balance),
        balanceFormatted: formatRaw(data.account.balance, decimals),
        lastSeenAt: Number(data.account.lastSeenAt),
        totalReceivedRaw: BigInt(data.account.totalReceived),
        totalReceivedFormatted: formatRaw(data.account.totalReceived, decimals),
      }
    : null;

  return {
    protocol,
    token,
    account,
    hasEverHeld: account !== null,
  };
}
