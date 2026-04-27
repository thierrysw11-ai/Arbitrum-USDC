# Aave V3 Arbitrum Subgraph

Indexes Aave V3 lending activity on Arbitrum One — supplies, withdraws,
borrows, repays, liquidations, and flash loans — with daily aggregates and
ERC20-resolved reserve metadata. Built to power the **Arbitrum DeFi Hub**
markets table (`web/src/components/AaveMarketsOverview.tsx`).

## What this fixes

The previous deployment (`Hr4ZdBkwkeENLSXwRLCPUQ1Xh5ep9S36dMz7PMcxwCp3`)
ships Reserve entities with empty `symbol` / `name` strings, which is why
the Markets table was rendering rows of `???`. This version pulls token
metadata directly from the underlying ERC20 contract on first sight via
`ERC20.bind(asset).try_symbol()` / `try_name()` / `try_decimals()`, with
safe fallbacks if a proxy reverts mid-upgrade.

## Layout

```
aave-subgraph/
├── abis/
│   ├── ERC20.json        # symbol / name / decimals / totalSupply
│   └── Pool.json         # 7 Aave V3 Pool events
├── src/
│   └── pool.ts           # Mapping handlers + helpers
├── schema.graphql        # Reserve, Account, per-event entities, DailyReserveStat
├── subgraph.yaml         # Pool @ 0x794a61358D6845594F94dc1DB02A252b5b4814aD, startBlock 7742429
└── package.json
```

## Indexed events

| Event                | Reserve effect                               | Per-event entity | Daily counter         |
| -------------------- | -------------------------------------------- | ---------------- | --------------------- |
| `Supply`             | `totalSupply += amount`                      | `Supply`         | `supplyVolume/Count`  |
| `Withdraw`           | `totalSupply -= amount` (clamped at 0)       | —                | —                     |
| `Borrow`             | `totalBorrow += amount`                      | `Borrow`         | `borrowVolume/Count`  |
| `Repay`              | `totalBorrow -= amount` (clamped at 0)       | `Repay`          | `repayVolume/Count`   |
| `LiquidationCall`    | none direct (Withdraw/Repay handle subledger) | `Liquidation`    | `liquidationCount` (debt reserve) |
| `FlashLoan`          | none                                         | `FlashLoan`      | `flashLoanVolume/Count` |
| `ReserveDataUpdated` | snapshots ray-scaled rates + indexes         | —                | —                     |

`totalSupply` / `totalBorrow` are **principal aggregates** — to get the
interest-bearing amount, multiply by the matching `liquidityIndex` /
`variableBorrowIndex` and divide by 1e27 (RAY).

## Local development

```bash
npm install
npx graph codegen     # generates ./generated/* from ABIs + schema
npx graph build       # compiles AssemblyScript → wasm under ./build
```

## Deploying to Subgraph Studio

```bash
npx graph auth --studio <DEPLOY_KEY>
npx graph deploy --studio aave-v3-arbitrum
```

After deploy, Studio prints a new query URL of the form
`https://api.studio.thegraph.com/query/<id>/aave-v3-arbitrum/<version>`.
Update `web/.env.local`:

```
NEXT_PUBLIC_AAVE_SUBGRAPH_URL=https://api.studio.thegraph.com/query/.../aave-v3-arbitrum/v0.1.0
```

## Schema quick-ref

The Markets table query expects:

```graphql
reserves(first: 50, orderBy: totalSupply, orderDirection: desc) {
  id symbol name decimals asset
  liquidityRate variableBorrowRate
  totalSupply totalBorrow lastUpdatedAt
  dailyStats(first: 7, orderBy: date, orderDirection: desc) {
    date supplyVolume borrowVolume
  }
}
```

Per-user dashboards can drill in via `Account.supplies / borrows / repays`
and `Reserve.flashLoans`. Liquidation alerts can subscribe to the
`Liquidation` entity.

## Notes

- `Withdraw` is currently aggregated into `Reserve.totalSupply` only — no
  per-event entity. Add one in `schema.graphql` + emit it in
  `handleWithdraw` if you need a withdraw activity feed.
- Stable-rate borrows (`interestRateMode = 1`) have effectively been
  retired in Aave V3, but the field is still indexed for completeness.
- `startBlock: 7742429` is the Pool proxy deployment block (March 2022).
  Earlier blocks are skipped for free by the indexer.
