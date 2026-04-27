# Portfolio post drafts

Three variants — pick one and tweak. All fit the LinkedIn / Twitter soft-cap.

---

## Variant A — concise, shipping-oriented (~600 chars)

Shipped a new portfolio project: **Arbitrum DeFi Hub** — a public risk & yield
monitor on Arbitrum One.

It pulls USDC transfer activity from a custom subgraph I wrote (The Graph,
AssemblyScript) and reads your Aave V3 health factor directly from the pool
contract. There's also a native USDC send flow built on wagmi's
`useWriteContract`.

Stack: Next.js 14 · wagmi v2 · viem · WalletConnect v2 · Apollo · Tailwind ·
Recharts.

Biggest learning: pre-aggregating hourly volume inside the subgraph mapping
makes the chart feel instant — worth the extra entity.

Live: <your-vercel-url>
Code: <your-github-url>

---

## Variant B — story-led (~900 chars)

A week ago I only had opinions about web3 infra. Today I have a portfolio piece
that exercises the whole stack.

**Arbitrum DeFi Hub** is a public risk & yield monitor:
• a custom subgraph I wrote indexes every USDC Transfer on Arbitrum into raw
  events + a pre-aggregated `HourlyVolume` bucket
• an Aave V3 risk gauge reads `getUserAccountData` straight from the pool
  contract via viem — no math replicated client-side
• a Send USDC page signs a standard ERC-20 `transfer` with wagmi v2 and shows
  the tx on Arbiscan as it confirms

The two decisions I'm most proud of:
1. Moving volume bucketing into the indexer, not the browser. Faster loads,
   shows I can think about where compute belongs.
2. Reading the health factor from the pool contract instead of the Aave
   subgraph. One round-trip, no stale data, no repl of Aave's math.

Stack: Next.js 14 App Router · wagmi v2 · viem · The Graph · WalletConnect v2
· Apollo · Tailwind · Recharts.

Live: <your-vercel-url>
Code: <your-github-url>

---

## Variant C — dry / technical (~700 chars)

New portfolio project: an Arbitrum DeFi dashboard.

Two data planes:
1. **USDC liquidity flow** — indexed by a subgraph I authored. `Transfer`
   events feed a `HourlyVolume` aggregate that the frontend queries for a 24h
   chart. Indexer does the bucketing, browser just renders.
2. **Aave V3 risk** — the connected wallet's health factor, read via
   `getUserAccountData` on the V3 Pool contract (viem). No subgraph needed.

Plus a `/send` route with a full write flow: wagmi's `useWriteContract` +
`useWaitForTransactionReceipt`, input validation, balance cap, Arbiscan link.

Next.js 14 App Router · wagmi v2 · viem · WalletConnect v2 · Apollo Client ·
Tailwind.

Live: <your-vercel-url>
Code: <your-github-url>

---

## Posting tips

- Lead with a **result**, not the stack — the stack lives in line 2.
- Mention **one decision you're proud of**. Recruiters skim for signals that
  you think, not just ship.
- Pin the post on Twitter; add to the "Featured" section on LinkedIn.
- Reply to your own post with a 30-second screen recording once you have one
  (see `docs/DEMO_SCRIPT.md`). Engagement multiplies.

## Hashtags (optional, LinkedIn only)

`#web3 #ethereum #arbitrum #defi #typescript #react #portfolio`
