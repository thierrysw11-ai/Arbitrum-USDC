# Loom walkthrough — 75-second silent + captions

Companion to [`DEMO_SCRIPT.md`](./DEMO_SCRIPT.md) (the 28s silent autoplay
clip for LinkedIn). This one is the longer **Loom** version that goes in the
README and on the project page — silent screen recording with timed text
overlays added in Loom's editor. No voice-over needed.

Why silent + captions for a portfolio Loom:
- LinkedIn / Twitter autoplay muted by default → captions are immediately
  legible, voice-over is invisible.
- Reviewers in open offices or commuting can watch without sound.
- No re-takes for verbal stumbles.
- The code does the talking; captions just point at what to look at.

Target length: **60–90 seconds**. Aim for 75. Anything over 90 and reviewers
scrub.

---

## Pre-flight checklist

Do these in order, once, before you hit record:

1. **Wallet** — connected to Arbitrum One in MetaMask. Position is live on
   Aave V3 with HF in the **80–200 1.5–3.0 zone** so the gauge looks
   demo-realistic. A 5 USDC supply + 1.5 DAI borrow gives HF ≈ 2.6, which
   is the demo position you've already built.
2. **Browser** — fresh Chrome window, bookmarks bar hidden, DevTools closed,
   zoom at 100%. One tab: `https://arbitrum-usdc.vercel.app`.
3. **Wallet popup** — pre-unlock MetaMask so the connect flow doesn't stall
   on the password screen mid-recording.
4. **Mic** — disabled in Loom's recorder settings. Confirm the recording
   indicator shows "video only" (no mic icon).
5. **Cursor** — Loom highlights clicks; no separate cursor tool needed.

## Storyboard — silent + on-screen captions (75 seconds)

Captions are added in Loom's post-record editor. Each caption shows for 4–6
seconds, in the upper-left or upper-right of the frame (away from where the
viewer's eye is following the cursor). Use a sans-serif white font on a
semi-transparent black background.

| # | Time      | On-screen action                                                                                                  | Caption (overlay text)                                                  |
| - | --------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 1 | 0:00–0:05 | Land on `/`. Hold on the hero + Aave gauge.                                                                       | **Arbitrum DeFi Hub** — live risk + yield monitor for Arbitrum One.    |
| 2 | 0:05–0:12 | Pan slowly down the dashboard. Hover the **Aave V3 risk gauge** (HF 2.60).                                        | Aave V3 risk profile. Health factor read live from the Pool contract. |
| 3 | 0:12–0:18 | Pan to the **USDC volume chart**. Hover one of the bars to show the tooltip.                                      | $1.5B+ USDC transfer volume. Indexed by my own subgraph.              |
| 4 | 0:18–0:22 | Click **Connect Wallet** → MetaMask → Connect. (Or skip if already connected.)                                    | Connecting wallet — wagmi v2 + WalletConnect.                          |
| 5 | 0:22–0:28 | Click **Portfolio** in nav. Show health factor 2.60, $5 collateral, $1.50 debt, $0.38 USDC liquidation price.     | Live Aave V3 position. HF, collateral, debt, liq price — all on-chain. |
| 6 | 0:28–0:38 | Scroll to the **Price-Shock Simulator**. Open dropdown → select USDC → drag slider to **-30%**. HF drops to 1.82. | What if USDC depegs 30%? Liquidation math runs client-side, in real time. |
| 7 | 0:38–0:44 | Click **Send** in nav. Paste address (your own), click **Max**. Don't submit.                                      | USDC send — wagmi v2 write. Validation + balance cap + gas estimate.   |
| 8 | 0:44–0:60 | Click the floating **Ask Sentinel** button. Type "What's my health factor and USDC liquidation price?". Wait for tool calls (`get_portfolio`, `get_liquidation_price`) to render with green checks. | **Sentinel** — Anthropic Claude agent with on-chain tool registry.    |
| 9 | 0:60–0:70 | Hold on the agent's response — HF, liq price, and narrative all visible.                                          | Numbers grounded in viem RPC reads. No hallucinations.                 |
| 10| 0:70–0:75 | Cut to the GitHub repo (or just hold the agent answer).                                                           | Code: github.com/thierrysw11-ai/Arbitrum-USDC                          |

## Caption copy — clean list (paste into Loom one by one)

For convenience, here are the 10 caption strings stripped of formatting.
Set each one to display for 5–6 seconds. Loom remembers font/style across
captions in a session, so you only style the first one.

1. Arbitrum DeFi Hub — live risk + yield monitor for Arbitrum One.
2. Aave V3 risk profile. Health factor read live from the Pool contract.
3. $1.5B+ USDC transfer volume. Indexed by my own subgraph.
4. Connecting wallet — wagmi v2 + WalletConnect.
5. Live Aave V3 position. HF, collateral, debt, liq price — all on-chain.
6. What if USDC depegs 30%? Liquidation math runs client-side, in real time.
7. USDC send — wagmi v2 write. Validation + balance cap + gas estimate.
8. Sentinel — Anthropic Claude agent with on-chain tool registry.
9. Numbers grounded in viem RPC reads. No hallucinations.
10. Code: github.com/thierrysw11-ai/Arbitrum-USDC

## Recording tips

- **One take is fine.** If you misclick, just continue — Loom lets you trim
  in post.
- **Keep mouse movements deliberate.** Hover for half a second on key
  numbers (HF 2.60, volume figure, agent answer).
- **Don't rush the agent's response.** The tool-call chips and final answer
  take 5–10 seconds to render. Let them. The "thinking" time is part of the
  story — it's evidence the agent is calling real tools.
- **If you fluff the click sequence**, just navigate back and re-do that
  section. Trim the false start in Loom's editor.

## Editing in Loom

Loom's web editor lets you:
- **Trim** the start and end (cut "uh oh let me click this" moments)
- **Add text overlays** with start/end times
- **Speed up boring sections** at 1.5–2× (the connect flow is a good candidate)
- **Add a chapter marker** at each major section break

Process:
1. Record the raw 90s flow without thinking about captions.
2. Open in Loom editor, trim head/tail.
3. Add the 10 captions from the list above with their timings.
4. Speed up sections 4 (wallet connect) and 7 (send form fill) by 1.5× to
   buy time for caption read-ahead.
5. Set the title to "Arbitrum DeFi Hub — 75s walkthrough".
6. Set sharing to "Anyone with the link".
7. Copy the share URL.

## After publishing

1. Make the link **publicly viewable** — Loom default is "Anyone with the
   link" but double-check by opening in incognito.
2. Drop the URL into the README under "Live demo" — replace the `_coming
   soon_` placeholder.
3. Post the same Loom link as the LinkedIn launch post's first comment.
   LinkedIn de-prioritizes external links in post bodies but tolerates them
   in comments.
