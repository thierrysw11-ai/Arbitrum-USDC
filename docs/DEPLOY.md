# Deployment Runbook

Step-by-step to take this repo from local to a live, shareable portfolio URL.
Total time: ~30-40 minutes spread across three services (The Graph, Reown,
Vercel). All three have free tiers sufficient for a portfolio piece.

## 0. One-time cleanup (~2 min)

If you reorganized from the original flat layout, close VS Code and any
`hardhat` / `graph` processes on Windows, then delete these leftovers from the
repo root:

```
abis/  build/  generated/  node_modules/  src/
package.json  package-lock.json  hardhat.config.js
subgraph.yaml  schema.graphql  .env
```

They're pre-reorg cruft. Everything live is inside `subgraph/` or `web/`.

## 1. Install & build the subgraph (~3 min)

```bash
cd subgraph
npm install
npm run codegen
npm run build
```

`codegen` generates TypeScript types from `schema.graphql` + the USDC ABI.
`build` compiles the AssemblyScript mapping to WASM. Both should finish
cleanly; if not, paste the error to your agent for a fix.

## 2. Deploy the subgraph to The Graph Studio (~15 min incl. indexing)

1. Go to <https://thegraph.com/studio> and sign in with a wallet.
2. Click **Create a Subgraph**. Name it `arbitrum-usdc`. Pick **Arbitrum One**
   as the network.
3. The Studio shows a **Deploy Key** — keep the tab open.
4. Back in the terminal:

   ```bash
   npm run auth      # paste the deploy key
   npm run deploy    # bumps the version, uploads to IPFS, registers with Studio
   ```

5. Wait for Studio to show **Synced**. (Startblock is 22207880, so initial sync
   is fast — a few minutes.)
6. Copy the **Query URL** shown on the Studio page. You'll need it in step 4.

## 3. Get a WalletConnect project ID (~2 min)

1. Go to <https://cloud.reown.com> (formerly cloud.walletconnect.com).
2. Create a new project — call it "Arbitrum DeFi Hub".
3. Copy the **Project ID**.

## 4. Get a Graph gateway API key (~2 min)

1. Go to <https://thegraph.com/studio/apikeys/>.
2. Create a key. Copy it.

## 5. Run the frontend locally (~3 min)

```bash
cd ../web
npm install --legacy-peer-deps
cp .env.example .env.local      # or `copy` on Windows
```

Edit `.env.local`:

```
NEXT_PUBLIC_WC_PROJECT_ID=<from step 3>
NEXT_PUBLIC_GRAPH_API_KEY=<from step 4>
NEXT_PUBLIC_USDC_SUBGRAPH_URL=<Query URL from step 2>
NEXT_PUBLIC_AAVE_SUBGRAPH_URL=https://gateway.thegraph.com/api/<key>/subgraphs/id/<your aave-subgraph id>
NEXT_PUBLIC_ARBITRUM_RPC_URL=https://arb1.arbitrum.io/rpc

# Sentinel agent (server-only)
ANTHROPIC_API_KEY=<from console.anthropic.com>

# x402 agentic payments
NEXT_PUBLIC_BASE_URL=http://localhost:3000
X402_RECEIVER_ADDRESS=<a wallet you control on Arbitrum One>
FACILITATOR_PRIVATE_KEY=<dedicated facilitator key, ETH on Arbitrum for gas>
AGENT_PRIVATE_KEY=<dedicated agent key, USDC on Arbitrum, no ETH needed>
```

The facilitator wallet needs a small amount of ETH on Arbitrum One (it pays
gas to call `transferWithAuthorization`). The agent wallet needs a few cents
of USDC on Arbitrum but no ETH — the facilitator covers gas. Use fresh,
dedicated keys with minimal balances for safety.

Run:

```bash
npm run dev
```

Open <http://localhost:3000>. Smoke-check:

- Wallet connect button works; connects on Arbitrum.
- `/` shows the Aave risk gauge and the USDC volume chart — data loads from
  your subgraph.
- `/send` loads; submitting a transfer opens the wallet for signature.

## 6. Push to GitHub (~2 min)

```bash
git add -A
git commit -m "Portfolio-ready Arbitrum DeFi Hub"
git push origin main
```

The `.gitignore` already excludes the pre-reorg cruft and all env files.

## 7. Deploy the frontend to Vercel (~5 min)

1. <https://vercel.com/new> → import your repo.
2. **Important:** set **Root Directory** to `web/`.
3. Framework preset auto-detects as Next.js. Leave build command default
   (`next build`).
4. Add env vars from `.env.local`. **Update `NEXT_PUBLIC_BASE_URL` to your
   Vercel domain** (e.g. `https://arbitrum-defi-hub.vercel.app`) — the
   x402 paywall builds absolute resource URLs from this.
5. Deploy.

The full env-var list to paste into Vercel:

- `NEXT_PUBLIC_WC_PROJECT_ID`
- `NEXT_PUBLIC_GRAPH_API_KEY`
- `NEXT_PUBLIC_USDC_SUBGRAPH_URL`
- `NEXT_PUBLIC_AAVE_SUBGRAPH_URL`
- `NEXT_PUBLIC_ARBITRUM_RPC_URL`
- `ANTHROPIC_API_KEY`
- `NEXT_PUBLIC_BASE_URL` ← set to your Vercel URL
- `X402_RECEIVER_ADDRESS`
- `FACILITATOR_PRIVATE_KEY`
- `AGENT_PRIVATE_KEY`

Update the root `README.md` to add your live Vercel URL under a "Live demo"
section and commit again.

## 8. Polish (see docs/SCREENSHOTS.md and docs/DEMO_SCRIPT.md)

Take three screenshots, record a short demo, embed them in the README, and
write the portfolio post (see `docs/LINKEDIN_POST.md` for a draft).

## Troubleshooting

**`graph codegen` fails with schema errors** — make sure `schema.graphql` is
valid GraphQL. A common pitfall is accidentally pasting non-GraphQL content
into it.

**Vercel build fails on `eresolve`** — add `--legacy-peer-deps` to the install
by creating a `.npmrc` in `web/` with `legacy-peer-deps=true`, then redeploy.

**Wallet connects but no chain data loads** — check that
`NEXT_PUBLIC_USDC_SUBGRAPH_URL` points at the query URL (ends in `/graphql`
for the Studio endpoint, or in a subgraph id for the decentralized network),
and that `NEXT_PUBLIC_GRAPH_API_KEY` is filled in if your URL uses the
`/api/<key>/` pattern.

**Aave gauge shows "no position"** — this is correct if your wallet doesn't
have an active Aave V3 position on Arbitrum. To test the gauge, either supply
or borrow on <https://app.aave.com/?marketName=proto_arbitrum_v3>, or connect
a different wallet that already has a position.
