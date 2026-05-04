/**
 * @deprecated As of the post-restore patch, this file is orphaned.
 *
 * Despite the `use*` filename, this file never contained a React hook —
 * it was a duplicate of `lib/agent/generateEliteReport.ts` that
 * interpolated fabricated copy ("Morpho Steakhouse vault yields",
 * "Elite Hedge configuration", "delta-neutral yield strategy") into a
 * template, which the AI sessions then embedded into the agent's
 * outputs without grounding in actual on-chain data.
 *
 * The Sentinel agent now composes its responses directly from real
 * tool-handler results in `lib/agent/tools.ts`. There is no template
 * layer, and the model's outputs are constrained to numbers it actually
 * read from Aave V3 / Alchemy / subgraphs.
 *
 * Safe to delete this file: nothing in the repo imports from it
 * (verified via `grep -rn useSentinelIntelligence src/`).
 */

export {};
