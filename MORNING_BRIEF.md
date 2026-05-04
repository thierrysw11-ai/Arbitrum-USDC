# Morning brief — overnight progress

Everything below is in your working tree, ready for review. **Nothing has
been committed or pushed.** Run `git status` and `git diff` first to see the
full surface area before deciding what to keep.

## TL;DR

Three categories of work happened overnight:

1. **Recovered from the "fix: premium button" damage** — your repo had
   accumulated null-byte corruption + truncated files + orphan modules
   from the long chain of failed AI fix-attempts before this session. All
   five corrupted files now compile cleanly; the agent layer is fully
   restored from the canonical commit `3f304a8`.

2. **Made the Sentinel Elite Analysis button actually work** — the button
   was hitting the paywalled `/api/agent/premium-analysis` endpoint without
   any x402 payment header, so it just rendered the 402 challenge as an
   error. It now calls the FREE Sentinel agent (`/api/agent`) with a
   structured prompt that orchestrates `get_portfolio` + two
   `simulate_price_shock` calls (-30% and -50%) + the new
   `get_wallet_holdings` tool. Real on-chain reads, no payment required,
   real numbers in the modal.

3. **Pushed Phase A multi-chain forward** — set up `networks.json` for
   one-liner USDC subgraph deploys on Base/OP/Polygon, and made
   `usePortfolio` chain-aware so it reads from whichever chain the wallet
   is connected to (with safe fallback when on unsupported chains).

`tsc --noEmit` exits 0 across the whole project.

## Verification before you commit

```powershell
cd C:\Users\TA\Arbitrum-USDC\web
npm run dev
```

Open http://localhost:3000 and check:

1. **Landing page** — should show a hero with "REAL-TIME. ON-CHAIN. SENTINEL." title, purple pill badge, "Open Portfolio" + "Send USDC" CTAs, and a stats card on the right with "20+ Aave V3 Reserves" and a pulsing green "LIVE" indicator. The 4-card grid (gauge + flow + markets + whale) sits below the hero.
2. **Portfolio page** — same hero treatment as before, with the USDCGuardian / Sentinel Elite branding intact. The "Current Buffer +14.2%" hardcoded card has been removed; only "Liquidation Point: 1.00 HF" remains (with an explanation). Click *Run Sentinel Elite Analysis* → modal opens → click *Run Analysis* → should see real data within ~10s.
3. **Connect wallet** → top-right shows three pills: green "LIVE" badge, an Arbitrum chain pill (click to switch chains — all 4 chains show in the modal), and your address pill.
4. **Sentinel chat** (Ask Sentinel button) → ask "What other tokens do I hold?" → should call the new `get_wallet_holdings` tool and show real ERC-20 balances.

## Files changed (all in working tree, not committed)

### Recovery / repair

| File | What happened |
|------|---------------|
| `web/src/lib/agent/tools.ts` | Restored from commit `3f304a8`. Original 7 tools back: `get_portfolio`, `simulate_price_shock`, `get_liquidation_price`, `get_recent_activity`, `get_chsb_balance`, `get_chsb_activity`, `get_premium_analysis`. **Plus 8th new tool `get_wallet_holdings`** — Alchemy ERC-20 scan with symbol resolution across Arbitrum/Base/OP/Polygon. |
| `web/src/lib/agent/system-prompt.ts` | Added `get_wallet_holdings` description with anti-spam guidance. |
| `web/src/lib/agent/scanner.ts` | Stubbed (`@deprecated` notice) — was returning `symbol: "TOKEN"` for everything + injecting fake `ETH_TEST` data. |
| `web/src/lib/agent/generateEliteReport.ts` | Stubbed — hardcoded template that fed model fabrications. |
| `web/src/components/agent/route.ts` | Stubbed — misplaced (route under `components/`, not `app/api/`) + broken import path + mock data. Was unreachable dead code. |
| `web/src/hooks/useSentinelIntelligence.ts` | Stubbed — orphan, misnamed `use*` despite no React hook content, full of fabricated yield-strategy copy. |
| `web/src/app/api/agent/premium-analysis/route.ts` | Restored from `3f304a8` — original x402-protected handler with multi-asset shock matrix logic. |
| `web/src/app/page.tsx` | Stripped 199 trailing null bytes. **Then added a hero section** matching the portfolio page treatment — "REAL-TIME. ON-CHAIN. SENTINEL." title, multi-chain pill, Open Portfolio + Send USDC CTAs, stats card with "20+ reserves" and "LIVE" indicator. |
| `web/src/app/portfolio/page.tsx` | Stripped 2,907 trailing null bytes. Then removed the hardcoded `+14.2%` "Current Buffer" card; kept the "Liquidation Point: 1.00 HF" card (universally true) with explanation copy. |
| `web/src/components/PremiumAnalysisButton.tsx` | Stripped 3,742 trailing null bytes. **Then rewrote** to call `/api/agent` (free) with a structured 4-tool analysis prompt. Modal renders Claude's response with proper loading + retry states. |
| `web/src/lib/wagmi.ts` | Stripped 1,840 trailing null bytes. Your `'use client'` directive, hardcoded WC project ID fallback, "USDC Guardian" appName, and "Keep true for better SSR" comment all preserved. |
| `web/src/app/layout.tsx` | **Reconstructed** — file was truncated at line 48 mid-JSX. Restored: closing tags, `<main>{children}</main>`, the LIVE badge with pulsing emerald dot, `<ConnectButton />`. Your USDCGuardian G-logo branding (lines 1-47) preserved verbatim. |

### Phase A — multi-chain

| File | What changed |
|------|---------------|
| `web/src/lib/chains.ts` | Verified during the earlier session — Aave Pool/Provider/DataProvider/Oracle addresses cross-checked against [bgd-labs/aave-address-book](https://github.com/bgd-labs/aave-address-book). Three DataProvider addresses corrected (OP, Polygon, Base). |
| `web/src/lib/wagmi.ts` | (Same file as above.) Your version already consumed the registry to register all 4 chains. |
| `web/src/components/ConnectButton.tsx` | Already had the chain switcher pill. |
| `web/src/lib/aave/usePortfolio.ts` | **Sub-task 6 — chain-aware.** Hook now resolves chain from `useAccount().chainId`, uses per-chain Aave V3 addresses from the registry, gates reads when on unsupported chains. Returns new fields `chainId`, `chainName`, `isUnsupportedChain` for consumers. |
| `subgraph/networks.json` | **Sub-task 4 — created.** Maps each chain to its USDC contract + start block. The Graph CLI 0.87+ substitutes these into `subgraph.yaml` at build time. |
| `subgraph/package.json` | Added `build:base` / `build:optimism` / `build:polygon` and `deploy:base` / `deploy:optimism` / `deploy:polygon` scripts. Existing `deploy` (Arbitrum) untouched. |
| `docs/PHASE_A_PROGRESS.md` | Updated to reflect sub-tasks 4 + 6 status. |

## Action items for you

### High priority

1. **Run dev server, verify everything compiles + renders.**
   ```powershell
   cd web; npm run dev
   ```
   If anything looks broken, paste me what you see.

2. **Check that `ALCHEMY_API_KEY` is in your `.env.local`** — the new
   `get_wallet_holdings` tool needs it. The broken scanner was using it,
   so it's probably already there, but worth confirming. Also add it to
   Vercel env vars before deploying.

3. **If everything works, commit the recovery as one tidy commit:**
   ```powershell
   cd C:\Users\TA\Arbitrum-USDC
   git add web/ docs/ subgraph/ MORNING_BRIEF.md
   git commit -m "fix(agent): restore tool registry + repair UI corruption + add wallet-holdings tool

   - Restore lib/agent/tools.ts from canonical commit (7 tools back online)
   - Add 8th tool get_wallet_holdings (Alchemy ERC-20 scan, all 4 chains)
   - Strip null-byte corruption from 4 UI files
   - Reconstruct layout.tsx (was truncated mid-JSX)
   - Rewrite PremiumAnalysisButton to call /api/agent (free) with 4-tool prompt
   - Remove hardcoded +14.2% buffer card on portfolio page
   - Add matching hero section to landing page
   - Phase A: usePortfolio is now chain-aware
   - Phase A: subgraph/networks.json scaffolded for one-liner multi-chain deploy"
   git push
   ```

### Medium priority — when you're ready for sub-task 4 deploy

To actually deploy the USDC subgraph on the three new chains:

```powershell
cd C:\Users\TA\Arbitrum-USDC\subgraph

# Update startBlocks in networks.json first — current values are conservative
# placeholders. Get current head from each chain's explorer, subtract:
#   Base:    300,000  (≈ 7 days at 2s/block)
#   OP:      300,000  (≈ 7 days at 2s/block)
#   Polygon: 275,000  (≈ 7 days at 2.2s/block)

# Then create the three Studio subgraphs (one-time, in The Graph Studio UI):
#   - base-usdc
#   - optimism-usdc
#   - polygon-usdc

# Then deploy each:
npm run deploy:base       # prompts for version label, e.g. 0.1.0
npm run deploy:optimism
npm run deploy:polygon

# In Studio: publish each version on-chain (small ETH gas + GRT signal,
# all paid on Arbitrum One — same as your existing v0.7.0).

# Finally, set the new env vars on Vercel:
#   NEXT_PUBLIC_USDC_SUBGRAPH_URL_BASE
#   NEXT_PUBLIC_USDC_SUBGRAPH_URL_OPTIMISM
#   NEXT_PUBLIC_USDC_SUBGRAPH_URL_POLYGON
```

### Low priority — cleanup

The four stubbed-but-not-deleted files can go via:

```powershell
cd C:\Users\TA\Arbitrum-USDC
git rm web/src/lib/agent/scanner.ts
git rm web/src/lib/agent/generateEliteReport.ts
git rm web/src/components/agent/route.ts
git rm web/src/hooks/useSentinelIntelligence.ts
git commit -m "chore: remove orphaned modules left as deprecation stubs"
```

I left them as `export {};` stubs because I can't delete files from the
sandbox — they're harmless dead code until you `git rm` them.

## What I did NOT touch

- Your Vercel env vars. Anything that needs changing there is in the
  action items above.
- Your wallet, your subgraph deployments, your live `arbitrum-usdc.vercel.app`
  deployment. The repo state is what changes; the live site stays on
  whatever Vercel last built (which was probably from before the corruption,
  hence why the dApp was still serving even though the local repo was broken).
- Your `.env.local` file. The `ALCHEMY_API_KEY` for the new wallet-holdings
  tool needs to be there — verify it is.
- Your screenshots, README, or Loom script. Those stayed where you left them.

## Outstanding (for whenever you want to resume)

- **Phase A sub-tasks 5, 7, 8, 9, 10, 11** — Apollo clients, chain-aware
  Markets Overview / Send page / Sentinel tools, "All Chains" dashboard
  view, real-position testing per chain.
- **Loom recording** — script and screenshots are still ready in `docs/`.
- **Demo screenshots refresh** — your previous screenshots show the old
  branding (Arbitrum DeFi Hub) before the USDCGuardian rebrand. Reshoot
  when ready.

Sleep well. Everything's in your working tree; nothing's been pushed.
