# Arbitrum DeFi Hub — Web

Next.js 14 App Router frontend for the Arbitrum DeFi Hub.

## Quickstart

```bash
npm install
cp .env.example .env.local
# fill in the four NEXT_PUBLIC_* vars
npm run dev
```

Open http://localhost:3000.

## Env vars

| Name                            | Purpose                                             |
| ------------------------------- | --------------------------------------------------- |
| `NEXT_PUBLIC_WC_PROJECT_ID`     | WalletConnect Cloud project id (reown.com)          |
| `NEXT_PUBLIC_GRAPH_API_KEY`     | The Graph gateway API key                           |
| `NEXT_PUBLIC_USDC_SUBGRAPH_URL` | Gateway URL for your deployed USDC subgraph         |
| `NEXT_PUBLIC_AAVE_SUBGRAPH_URL` | Aave V3 Arbitrum subgraph URL                       |
| `NEXT_PUBLIC_ARBITRUM_RPC_URL` | HTTPS RPC for Arbitrum (default: arb1.arbitrum.io) |

## Scripts

```bash
npm run dev        # local dev server
npm run build      # production build
npm run start      # run production build
npm run lint       # next lint
npm run typecheck  # tsc --noEmit
```

## Project structure

```
src/
├── app/
│   ├── layout.tsx       # root layout, nav, footer, Providers wrapper
│   ├── page.tsx         # dashboard (AaveRiskGauge + LiquidityFlow)
│   ├── providers.tsx    # WagmiProvider + ReactQuery + Apollo + Web3Modal
│   └── globals.css
├── components/
│   ├── ConnectButton.tsx    # WalletConnect button
│   ├── AaveRiskGauge.tsx    # reads getUserAccountData() from Aave V3 Pool
│   ├── LiquidityFlow.tsx    # queries USDC subgraph, buckets transfers
│   └── RiskGauge.tsx        # presentational gauge used by AaveRiskGauge
└── lib/
    ├── wagmi.ts         # wagmi config (Arbitrum chain, WalletConnect)
    └── apollo.ts        # Apollo clients (USDC + Aave subgraphs)
```

## Notes

- `createWeb3Modal` is invoked inside a `useEffect` in `providers.tsx` so it
  only runs in the browser — calling it during SSR blows up.
- The default Apollo client is the **USDC subgraph**. For Aave queries, pass
  `{ client: aaveClient }` to `useQuery`.
- `AaveRiskGauge` reads Aave V3's `getUserAccountData` via viem. No Aave
  subgraph required — if the connected wallet has a position, health factor is
  rendered directly.
