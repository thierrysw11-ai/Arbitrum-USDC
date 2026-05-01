"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAccount } from "wagmi";
import { isAddress } from "viem";
import { Wallet, AlertCircle, Sparkles } from "lucide-react";

import { usePortfolio } from "@/lib/aave/usePortfolio";
import PortfolioOverview from "@/components/portfolio/PortfolioOverview";
import PositionsTable from "@/components/portfolio/PositionsTable";
import PriceShockSimulator from "@/components/portfolio/PriceShockSimulator";
import AddressViewer from "@/components/portfolio/AddressViewer";
import RecentBorrowers from "@/components/portfolio/RecentBorrowers";
import { PremiumAnalysisButton } from "@/components/portfolio/PremiumAnalysisButton";
import AgentPanel from "@/components/agent/AgentPanel";
import ConnectButton from "@/components/ConnectButton";

/**
 * /portfolio — live Aave V3 position view + Sentinel chat panel.
 *
 * Two ways to use it:
 *   1. Connect a wallet — reads your own position.
 *   2. Spectator mode — paste any wallet address (or hit
 *      /portfolio?address=0x…). Reads that wallet without needing a
 *      connection.
 *
 * Spectator mode is also exactly the shape Phase 2's agent calls into
 * when reasoning about a wallet: same hook, same data, just a different
 * caller passing in the address.
 */
export default function PortfolioPage() {
  return (
    // Suspense boundary required because useSearchParams suspends on first
    // render in Next 14's App Router.
    <Suspense
      fallback={
        <PageShell>
          <HeaderBlock />
        </PageShell>
      }
    >
      <PortfolioPageInner />
    </Suspense>
  );
}

function PortfolioPageInner() {
  const searchParams = useSearchParams();
  const { isConnected } = useAccount();
  const [agentOpen, setAgentOpen] = useState(false);

  // Validate the URL param up-front. An invalid address is treated the
  // same as no override so we don't hand garbage into wagmi.
  const rawOverride = searchParams.get("address");
  const overrideAddress =
    rawOverride && isAddress(rawOverride)
      ? (rawOverride.toLowerCase() as `0x${string}`)
      : undefined;

  const {
    address,
    isOverride,
    account,
    positions,
    loading,
    error,
  } = usePortfolio(overrideAddress);

  // Compute the page body once. The launcher button + agent panel are
  // appended uniformly to every state below.
  let body: React.ReactNode;

  if (!isConnected && !overrideAddress) {
    // No wallet, no override — prompt to connect or to paste an address.
    body = (
      <PageShell>
        <HeaderBlock />
        <AddressViewer activeAddress={address} isOverride={isOverride} />
        <section className="p-12 bg-[#0f172a]/60 border border-gray-800 rounded-xl text-center">
          <Wallet className="w-10 h-10 text-gray-600 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">
            Connect a wallet — or inspect any address
          </h2>
          <p className="text-sm text-gray-500 mb-6 max-w-md mx-auto">
            Sentinel reads live Aave V3 health factor, per-asset balances,
            and liquidation prices straight from Arbitrum One. Connect your
            own wallet, or paste any 0x address above to view its position.
          </p>
          <div className="inline-block">
            <ConnectButton />
          </div>
        </section>
        <RecentBorrowers />
      </PageShell>
    );
  } else if (loading && positions.length === 0) {
    // Loading skeleton.
    body = (
      <PageShell>
        <HeaderBlock />
        <AddressViewer activeAddress={address} isOverride={isOverride} />
        <section className="p-8 bg-[#0f172a]/60 border border-gray-800 rounded-xl">
          <div className="animate-pulse space-y-4">
            <div className="h-12 bg-gray-800 rounded w-1/3" />
            <div className="h-4 bg-gray-800 rounded w-1/4" />
            <div className="h-4 bg-gray-800 rounded w-1/5" />
          </div>
        </section>
      </PageShell>
    );
  } else if (error) {
    // Hard error.
    body = (
      <PageShell>
        <HeaderBlock />
        <AddressViewer activeAddress={address} isOverride={isOverride} />
        <section className="p-8 bg-red-950/30 border border-red-900 rounded-xl">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div>
              <h2 className="text-base font-bold text-red-300 mb-1">
                Failed to load portfolio
              </h2>
              <p className="text-xs text-red-400/80 font-mono break-all">
                {error.message ?? "Unknown error"}
              </p>
              <p className="text-xs text-gray-500 mt-3">
                Usually a transient RPC issue. Refresh the page; if it
                keeps happening, the configured RPC endpoint may be down.
              </p>
            </div>
          </div>
        </section>
      </PageShell>
    );
  } else {
    // Happy path — fully loaded portfolio (own wallet OR spectator).
    body = (
      <PageShell>
        <HeaderBlock address={address} />
        <AddressViewer activeAddress={address} isOverride={isOverride} />
        <PortfolioOverview account={account} />
        <PositionsTable
          positions={positions}
          totalDebtBase={account.totalDebtBase}
        />
        <PriceShockSimulator positions={positions} />
        {/* Premium x402 analysis — only show when there's a position to analyze
            and the user is connected (so they can sign the EIP-3009 auth). */}
        {positions.length > 0 && isConnected && (
          <PremiumAnalysisButton address={address} />
        )}
        {/* Empty-position hint — drop in a list of recent borrowers so a
            spectator who landed on an inactive wallet has somewhere to go. */}
        {positions.length === 0 && <RecentBorrowers />}
      </PageShell>
    );
  }

  return (
    <>
      {body}
      <AgentLauncher onOpen={() => setAgentOpen(true)} />
      <AgentPanel
        open={agentOpen}
        onClose={() => setAgentOpen(false)}
        activeAddress={address}
      />
    </>
  );
}

function PageShell({ children }: { children: React.ReactNode }) {
  return <div className="space-y-6">{children}</div>;
}

function AgentLauncher({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="fixed bottom-6 right-6 z-30 flex items-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-full shadow-lg shadow-blue-900/40 transition-colors"
    >
      <Sparkles className="w-4 h-4" />
      Ask Sentinel
    </button>
  );
}

function HeaderBlock({ address }: { address?: `0x${string}` }) {
  return (
    <section>
      <h1 className="text-3xl font-black text-white mb-2 tracking-tight">
        Portfolio
      </h1>
      <p className="text-gray-500 text-sm max-w-2xl">
        Live Aave V3 position on Arbitrum One — health factor, per-asset
        balances, liquidation prices, and an interactive price-shock
        simulator.
        {address && (
          <span className="ml-2 text-gray-600 font-mono text-[11px]">
            {address.slice(0, 6)}…{address.slice(-4)}
          </span>
        )}
      </p>
    </section>
  );
}
