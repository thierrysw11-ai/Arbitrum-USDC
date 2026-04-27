# 30-second demo recording — script & shot list

A tight screen recording is the single highest-leverage asset for a portfolio
piece. LinkedIn's autoplay and Twitter's video previews both reward short,
legible clips.

## Tools

- **Mac:** QuickTime → File → New Screen Recording, or Cmd+Shift+5.
- **Windows:** Xbox Game Bar (Win+G) records the active window. Or OBS if you
  want scene transitions.
- **Cross-platform:** <https://www.screen.studio> (paid, but the best output)
  or <https://www.loom.com> (free tier).

Export as **MP4, 1080p, <30 MB**. For a GIF fallback use ezgif.com → under
10 MB so LinkedIn previews it.

## Pre-flight (do these once)

1. Prepare a **clean Chrome profile**: no other tabs, bookmarks bar hidden,
   DevTools closed.
2. Zoom the page to 90% so the chart + gauge + nav all fit at 1440×900.
3. Have a **funded test wallet** on Arbitrum with a small USDC balance
   (~$5–$10) and a test recipient address copied to your clipboard.
4. Make sure the wallet already has a small Aave V3 position so the gauge
   shows a real number.

## Storyboard (total 28s)

| # | Duration | Action | On-screen focus |
|---|----------|--------|----------------|
| 1 | 0:00 – 0:03 | Open the live URL fresh. | Title card / hero section. |
| 2 | 0:03 – 0:07 | Click **Connect Wallet**; pick wallet; approve. | Connect modal → connected state. |
| 3 | 0:07 – 0:13 | Hover the **Aave gauge** — tooltip shows HF value. Pan to the **USDC chart** — hover a bar to show the tooltip. | Real on-chain data. |
| 4 | 0:13 – 0:16 | Click **Send** in the nav. | Navigation → Send page. |
| 5 | 0:16 – 0:22 | Paste recipient, type amount, click **Max**, click **Send USDC**. | Form interaction. |
| 6 | 0:22 – 0:26 | Wallet popup → **Confirm**. | Signing the tx. |
| 7 | 0:26 – 0:28 | Success pane appears with Arbiscan link. Hover the link briefly so the reviewer sees it's real. | Proof of a real confirmed transfer. |

## Voice-over? No.

Silent is fine (and preferred for autoplay). If you must narrate, keep it to
three lines max:

> "Arbitrum DeFi Hub. Live on-chain risk + volume, pulled from a custom
> subgraph I wrote. And a real USDC send flow — here it is confirming on
> Arbiscan."

## After export

1. Save the MP4 to `docs/demo.mp4` (or host on YouTube unlisted and link —
> GitHub renders inline MP4s but large files bloat clones).
2. Add it to `README.md` immediately under the hero:
   ```markdown
   ## Demo

   <video src="docs/demo.mp4" controls width="600"></video>
   ```
3. Post the GIF version to LinkedIn / Twitter as a reply to your launch post
   (higher engagement than a link).
