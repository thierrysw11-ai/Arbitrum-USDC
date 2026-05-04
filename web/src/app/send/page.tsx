import SendToken from '@/components/SendToken';

export const metadata = {
  title: 'Send — USDC Guardian',
  description:
    'Send any of 50+ popular tokens (and native gas tokens) across Ethereum, Arbitrum, Base, Optimism, and Polygon directly from your connected wallet.',
};

export default function SendPage() {
  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-3xl font-black text-white mb-2 tracking-tight">
          Send tokens
        </h1>
        <p className="text-gray-500 text-sm max-w-2xl">
          Transfer any popular ERC-20 (or the chain&apos;s native gas token)
          directly from your wallet across the 5 supported chains. ERC-20s call{' '}
          <code className="font-mono text-gray-400">
            transfer(to, amount)
          </code>{' '}
          on the canonical contract; native ETH / MATIC use a standard wallet
          send. No intermediate contract, no approval, no fees beyond network
          gas.
        </p>
      </section>

      <SendToken />

      <section className="p-6 bg-[#0f172a]/60 border border-gray-800 rounded-xl max-w-md mx-auto">
        <h2 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3">
          How it works
        </h2>
        <ol className="space-y-2 text-[11px] text-gray-400 list-decimal list-inside">
          <li>
            Connect your wallet — the picker shows tokens for whichever
            chain you&apos;re currently on.
          </li>
          <li>
            Pick a token (search by symbol or name), enter recipient + amount —
            validated live against your balance.
          </li>
          <li>
            Click <em>Send</em>. Your wallet signs either{' '}
            <code className="font-mono">transfer</code> (ERC-20) or a plain
            value transfer (native).
          </li>
          <li>
            Track the tx on the chain&apos;s explorer; confirmation updates
            automatically.
          </li>
        </ol>
      </section>
    </div>
  );
}
