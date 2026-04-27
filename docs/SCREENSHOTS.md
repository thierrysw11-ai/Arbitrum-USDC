# Screenshots checklist

Six screenshots cover the whole dApp's surface area. Save each as a PNG in
`docs/screenshots/` (create the folder). Names matter — they're referenced from
`README.md`.

## What to capture

### 1. `dashboard-disconnected.png`
The `/` page, no wallet connected.
- Shows the Aave gauge prompting for connect + the USDC chart rendering from
  public subgraph data.
- Good visual because the chart already looks alive.

### 2. `dashboard-connected-no-position.png`
The `/` page, wallet connected but no active Aave position.
- The gauge should show the "No active Aave V3 position" state.
- Demonstrates the graceful empty-state handling.

### 3. `dashboard-connected-with-position.png` *(best visual)*
The `/` page, wallet connected with an active Aave position on Arbitrum.
- Gauge shows an actual health factor and coloured status pill.
- If you don't have a position, the fastest way to create one is a tiny
  supply on <https://app.aave.com/?marketName=proto_arbitrum_v3> (e.g. ~$5 of
  USDC supplied, no borrow — gives HF of ∞ / "safe"). Or supply + borrow a few
  dollars for a more interesting number.

### 4. `send-form.png`
The `/send` page, form filled in with a realistic recipient and amount.
- Leave it at "Send USDC" (pre-submit) so reviewers see the polished form.

### 5. `send-confirmed.png`
The `/send` page after a successful transfer.
- Shows the green checkmark success pane with the Arbiscan link.
- Use a testnet-style small amount ($0.50–$1 USDC).

### 6. `subgraph-studio.png`
A screenshot of your subgraph in The Graph Studio dashboard showing **Synced**
status and recent queries.
- Proves the subgraph is actually deployed, not just scaffolded.

## Capture settings

- **Viewport:** 1440×900 (Chrome DevTools device toolbar → "Responsive"). Keeps
  images readable on GitHub and LinkedIn.
- **Dark mode:** default. The dApp is dark-only, so no choice.
- **Chrome UI:** use DevTools "Capture full-size screenshot" (Cmd+Shift+P →
  "Capture") to omit the URL bar. Cleaner result.
- **Format:** PNG. Compress with <https://tinypng.com> before committing so
  the repo stays slim.

## After capturing

1. Commit them:
   ```bash
   git add docs/screenshots
   git commit -m "docs: add portfolio screenshots"
   git push
   ```
2. Add them to `README.md` under a new **Screenshots** section — a 2×3 grid
   using HTML looks cleanest on GitHub:
   ```markdown
   <p align="center">
     <img src="docs/screenshots/dashboard-connected-with-position.png" width="48%">
     <img src="docs/screenshots/send-form.png" width="48%">
   </p>
   ```
