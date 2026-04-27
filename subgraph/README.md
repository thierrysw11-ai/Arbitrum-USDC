# Arbitrum USDC Subgraph

Indexes `Transfer` events from the canonical USDC token on Arbitrum One
(`0xaf88d065e77c8cc2239327c5edb3a432268e5831`) and exposes both raw events and
a pre-aggregated hourly bucket.

Powers the `LiquidityFlow` chart in the Arbitrum DeFi Hub frontend.

## Entities

```graphql
type Transfer @entity(immutable: true) {
  id: ID!            # txHash-logIndex
  from: Bytes!
  to: Bytes!
  value: BigInt!     # 6 decimals
  blockNumber: BigInt!
  timestamp: BigInt!
  txHash: Bytes!
}

type HourlyVolume @entity {
  id: ID!                    # stringified hourStartTimestamp
  hourStartTimestamp: BigInt!
  totalVolume: BigInt!       # sum of transfer values for the hour
  whaleVolume: BigInt!       # sum of values from transfers >= $1M
  transferCount: Int!
}
```

The `HourlyVolume` entity is upserted on every `Transfer` — the frontend can
ask for `hourlyVolumes(first: 24, orderBy: hourStartTimestamp, orderDirection: desc)`
and render a 24-hour chart without downloading thousands of raw events.

## Local development

```bash
npm install
npm run codegen   # generates types in ./generated from schema.graphql + ABIs
npm run build     # compiles the AssemblyScript mapping to WASM
```

## Deploying

Deploy to **The Graph Studio** (decentralized network) once you have a subgraph
slug and a deploy key:

```bash
npm run auth       # prompts for deploy key from https://thegraph.com/studio
npm run deploy
```

After publishing, copy the subgraph's query URL into the `web/.env.local` as
`NEXT_PUBLIC_USDC_SUBGRAPH_URL`.

## Notes

- `startBlock` in `subgraph.yaml` is set to `22207880`. Lowering it will index
  further back in history but takes longer to sync.
- The whale threshold (`1,000,000` USDC = `1e12` raw units) is a constant in
  `src/USDC.ts`. Change it there if you want a different cutoff, then redeploy.
- Every transfer touches two entities (one insert, one upsert), which is still
  very cheap on the decentralized network.
