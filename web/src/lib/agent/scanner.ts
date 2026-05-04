/**
 * @deprecated As of the post-restore patch, this file is orphaned.
 *
 * The original `scanMetamaskPortfolio` function in this file:
 *   - Set every token's `symbol` to the literal string "TOKEN" instead of
 *     resolving real symbols via Alchemy metadata
 *   - Injected fake `ETH_TEST` data when Alchemy returned nothing, polluting
 *     the agent's tool results with test garbage
 *   - Was the source of the "No significant external holdings detected"
 *     misreporting in the Sentinel agent's output
 *
 * Wallet scanning now lives in `tools.ts` as the `get_wallet_holdings` tool.
 * That implementation calls `alchemy_getTokenBalances` + `alchemy_getTokenMetadata`
 * to resolve real symbols/names/decimals across Arbitrum, Base, Optimism,
 * and Polygon, with proper error handling and no test data injection.
 *
 * Safe to delete this file: nothing in the repo imports from it. Left as a
 * stub only so the deletion shows up clearly in a future `git rm` commit.
 */

export {};
