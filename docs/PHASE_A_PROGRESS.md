# Phase A — Multi-chain expansion progress log

Phase A goal: extend the dApp from Arbitrum-only to **Arbitrum + Base +
Optimism + Polygon**. Each chain a first-class citizen — same UX, same
agent tools, just parameterized by chain.

## Status snapshot

| Sub-task | Status |
|----------|--------|
| 1. Recon + `chains.ts` registry | **verified** — see "Address verification status" below; only token addresses still need manual verification |
| 2. wagmi multi-chain config | **done** — `lib/wagmi.ts` now consumes the registry and registers all four chains. Chain switcher will appear in the connect modal automatically. |
| 3. Refactor existing components to consume `chains.ts` | not started |
| 4. Subgraph deploys (Base, OP, Polygon) | not started |
| 5. Chain-aware Apollo clients | not started |
| 6. Portfolio page chain-aware | not started |
| 7. Aave Markets Overview chain-aware | not started |
| 8. Send page chain-aware | not started |
| 9. Sentinel agent tools take `chain` parameter | not started |
| 10. "All chains" dashboard | not started |
| 11. Real-position testing on Base + OP + Polygon | not started |

## What got done in the background pass

**File created:** [`web/src/lib/chains.ts`](../web/src/lib/chains.ts)

Single source of truth for chain-specific config. Defines:

- `ChainSlug` union type — narrows runtime strings to known chains.
- `ChainConfig` interface — identity, RPC, explorer, native currency,
  USDC, Aave V3 addresses, subgraph env-var keys.
- Four populated entries: Arbitrum One, Base, Optimism, Polygon.
- `CHAINS` (by chainId) and `CHAINS_BY_SLUG` registries.
- Helpers: `getChain`, `getChainBySlug`, `isChainSlug`, `isSupportedChainId`,
  `explorerTxUrl`, `explorerAddressUrl`, `getRpcUrl`, `getUsdcSubgraphUrl`,
  `getAaveSubgraphUrl`.

The file is **purely additive** — no existing code consumes it yet, so the
live deployment is unaffected. It's the foundation for sub-task 2 onwards.

## Address verification status

### ✅ Verified during the background pass (April 2026)

Verified against authoritative sources via WebFetch / WebSearch — namely the
[bgd-labs/aave-address-book](https://github.com/bgd-labs/aave-address-book)
canonical Solidity registry and Etherscan-style explorer labels (Arbiscan,
BaseScan, Optimistic Etherscan, PolygonScan). All marked `// VERIFIED:` in
`chains.ts`.

- **Arbitrum** — every address (already verified pre-pass against live code)
- **Base** — Aave Pool, AddressesProvider, DataProvider (corrected), Oracle, USDC, ETH/USD Chainlink feed
- **Optimism** — Aave Pool, AddressesProvider, DataProvider (corrected), Oracle, USDC, ETH/USD Chainlink feed
- **Polygon** — Aave Pool, AddressesProvider, DataProvider (corrected), Oracle, USDC, ETH/USD Chainlink feed, MATIC/USD Chainlink feed

### 🛠️ Corrections applied in this pass

Three Aave V3 DataProvider addresses were wrong in the initial draft. The
authoritative source (aave-address-book) confirms these values:

| Chain | Was | Now |
|-------|-----|-----|
| Optimism | `0x7F23D86Ee20D869112572136221e173428DD740B` | `0x69FA688f1Dc47d4B5d8029D5a35FB7a548310654` (matches Arbitrum — deterministic) |
| Polygon | `0x9441B65EE553F70df9C77d45d3283B6BC24F222d` | `0x69FA688f1Dc47d4B5d8029D5a35FB7a548310654` (matches Arbitrum — deterministic) |
| Base | `0x2d8A3C5677189723C4cB8873CfC9C8976FDF38Ac` | `0x0F43731EB8d45A581f4a36DD74F5f358bc90C73A` (Base-specific deployment) |

Key insight discovered during verification: Aave V3 on Arbitrum / Optimism /
Polygon all share the same Pool, AddressesProvider, AND DataProvider
addresses (CREATE2-deterministic). Only the Oracle is chain-specific.
**Base uses a separate deployment — all Aave V3 addresses on Base are
unique.**

### ⚠️ Still requires manual verification

Token addresses (WBTC, DAI, USDT, wstETH, rETH, cbETH, stMATIC, cbBTC) and
their per-token Chainlink USD feeds were NOT verified against authoritative
sources during the background pass — search results were too noisy to be
authoritative. Each is still marked `// VERIFY:` in `chains.ts`.

These addresses are non-critical for sub-tasks 2–5 (wagmi config, Apollo,
Portfolio, Send) — those only need USDC, Aave Pool, and the native ETH/USD
feed, all of which are now verified. Token addresses become relevant only
once `AaveMarketsOverview` is migrated (sub-task 7).

To verify when you get there: pull each chain's `tokens` block in
[`web/src/lib/chains.ts`](../web/src/lib/chains.ts), cross-check addresses
against [aave-address-book on GitHub](https://github.com/bgd-labs/aave-address-book/tree/main/src)
(per-chain `.sol` files have full reserve lists), and strip the `// VERIFY:`
comments as you confirm.

## Migration map — files that need refactoring (sub-task 3)

The recon pass surfaced **13 files** with hardcoded chain-specific values.
Listed in order of recommended migration (dependencies first, leaf
components last):

### Foundation files (do first)

- `web/src/lib/aave/addresses.ts` — supersede with `getChain(chainId).aaveV3.*`
- `web/src/lib/x402/networks.ts` — supersede with `getChain(chainId).usdc.*`
- `web/src/lib/wagmi.ts` — register all four chains in wagmi config

### Hooks and infrastructure

- `web/src/lib/aave/usePortfolio.ts` — 6 hardcoded `arbitrum.id` references
- `web/src/lib/agent/tools.ts` — agent tools need a `chain` parameter
- `web/src/lib/x402/agent-fetch.ts`
- `web/src/lib/x402/facilitator.ts`
- `web/src/app/api/agent/premium-analysis/route.ts` — hardcoded USDC address

### Leaf components (do last)

- `web/src/components/SendUSDC.tsx` — USDC address, ETH/USD feed, chainId × 6
- `web/src/components/AaveMarketsOverview.tsx` — ETH/USD feed, chainId × 3
- `web/src/components/AaveRiskGauge.tsx` — Pool address, chainId
- `web/src/components/UsdcPeg.tsx` — chainId
- `web/src/components/portfolio/PremiumAnalysisButton.tsx`

The migration is mostly "find-and-replace with type narrowing." Recommended
approach: for each file, accept a `chainId` (or `chain`) parameter via prop
or hook, look up via `getChain(chainId)`, fall back to `DEFAULT_CHAIN` if
unsupported. The TypeScript compiler will guide you — once you remove the
`arbitrum.id` import, every callsite that needed it will surface as an
error.

## New env vars required (Vercel)

Once subgraphs are deployed for Base / OP / Polygon, set these on Vercel:

```
NEXT_PUBLIC_USDC_SUBGRAPH_URL_BASE=...
NEXT_PUBLIC_USDC_SUBGRAPH_URL_OPTIMISM=...
NEXT_PUBLIC_USDC_SUBGRAPH_URL_POLYGON=...

NEXT_PUBLIC_AAVE_SUBGRAPH_URL_BASE=...      # only if you deploy Aave subgraphs per chain
NEXT_PUBLIC_AAVE_SUBGRAPH_URL_OPTIMISM=...  # otherwise the markets-overview can read on-chain via multicall
NEXT_PUBLIC_AAVE_SUBGRAPH_URL_POLYGON=...

NEXT_PUBLIC_BASE_RPC_URL=...      # optional — public default works
NEXT_PUBLIC_OPTIMISM_RPC_URL=...  # optional
NEXT_PUBLIC_POLYGON_RPC_URL=...   # optional
```

The existing `NEXT_PUBLIC_USDC_SUBGRAPH_URL` and
`NEXT_PUBLIC_AAVE_SUBGRAPH_URL` are preserved as the Arbitrum values —
no breaking change to the current deployment.

## Recommended next move when you're back

1. **Verify the addresses** (15–30 min — open the four official-source URLs,
   spot-check the values, remove `// VERIFY:` comments as you confirm).
2. **Sub-task 2: wagmi multi-chain config** (~30 min) — add `base`,
   `optimism`, `polygon` to `createWagmiConfig` so RainbowKit's chain
   switcher appears in the connect modal. Smallest possible win, gets you
   visible multi-chain UX immediately. Single-file change to
   `web/src/lib/wagmi.ts`.
3. **Sub-task 4: deploy USDC subgraph for one new chain** (~1 hour each) —
   start with Base since it's the most relevant for the x402 story. Pattern
   matches the `subgraph/` workflow you used for v0.7.0 — just change the
   address and startBlock.

After that the leaf components (sub-tasks 6–8) become a sequence of small,
independently shippable commits.

## Risks and gotchas tracked during recon

- **Aave Pool address differs on Base.** Don't assume cross-chain identity
  — Base uses `0xA238Dd...`, the other three share `0x794a61...`.
- **Bridged USDC trap.** Polygon and Optimism both have a *bridged* USDC.e
  at well-known addresses with deep liquidity. Those are NOT EIP-3009
  enabled, so your x402 flow would silently fail. Comments in `chains.ts`
  flag the wrong addresses to avoid.
- **Polygon gas token.** MATIC vs ETH affects the Send page's "EST. NETWORK
  FEE" display. The `nativeCurrency.symbol` field handles this — make sure
  the gas estimator UI reads from `chain.nativeCurrency.symbol` rather than
  hardcoding "ETH".
- **Aave reserve sets diverge across chains.** AaveMarketsOverview iterates
  reserves so this should "just work," but the Chainlink price-feed mapping
  in `AaveMarketsOverview.tsx` (line 96) hardcodes `WETH:` and a few others
  for Arbitrum. That mapping needs to be moved into `chains.ts` as a
  per-chain `tokenPriceFeeds` map, or replaced with on-chain reads via
  Aave's own oracle.

## Time spent on this background pass

~30 minutes:
- Recon (grep across web/src) — 5 min
- Read existing addresses.ts, networks.ts, SendUSDC.tsx — 5 min
- Author chains.ts with full type definitions and four-chain registry — 15 min
- This progress log — 5 min

Net result: the foundation file for Phase A is ready, and you have a clear
map of every file that still needs to consume it.
