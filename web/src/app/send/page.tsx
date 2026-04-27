import SendUSDC from '@/components/SendUSDC';

export const metadata = {
  title: 'Send USDC — Arbitrum DeFi Hub',
  description:
    'Send USDC on Arbitrum directly from your connected wallet. Read-only dashboard plus a real on-chain write flow.',
};

export default function SendPage() {
  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-3xl font-black text-white mb-2 tracking-tight">
          Send USDC
        </h1>
        <p className="text-gray-500 text-sm max-w-2xl">
          Transfer USDC on Arbitrum One directly from your connected wallet. The
          dApp signs a standard{' '}
          <code className="font-mono text-gray-400">transfer(to, amount)</code>{' '}
          call against the canonical USDC contract — no intermediate smart
          contract, no approval step, no fees beyond L2 gas.
        </p>
      </section>

      <SendUSDC />

      <section className="p-6 bg-[#0f172a]/60 border border-gray-800 rounded-xl max-w-md mx-auto">
        <h2 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3">
          How it works
        </h2>
        <ol className="space-y-2 text-[11px] text-gray-400 list-decimal list-inside">
          <li>Connect your wallet (must be on Arbitrum One).</li>
          <li>Enter a recipient address and an amount — validated live.</li>
          <li>
            Click <em>Send USDC</em> to sign the{' '}
            <code className="font-mono">transfer</code> with your wallet.
          </li>
          <li>Track the tx on Arbiscan; confirmation updates automatically.</li>
        </ol>
      </section>
    </div>
  );
}
