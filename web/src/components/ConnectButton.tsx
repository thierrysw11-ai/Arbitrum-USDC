'use client';

import React from 'react';
import { ConnectButton as RKConnectButton } from '@rainbow-me/rainbowkit';
import { Wallet, LogOut } from 'lucide-react';

function shortenAddress(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/**
 * Custom-styled wrapper over RainbowKit's ConnectButton so the UI keeps the
 * existing dApp aesthetic (dark, compact pill + disconnect icon) instead of
 * using the default RainbowKit chrome.
 */
const ConnectButton = () => {
  return (
    <RKConnectButton.Custom>
      {({
        account,
        chain,
        openAccountModal,
        openConnectModal,
        openChainModal,
        authenticationStatus,
        mounted,
      }) => {
        const ready = mounted && authenticationStatus !== 'loading';
        const connected =
          ready &&
          account &&
          chain &&
          (!authenticationStatus || authenticationStatus === 'authenticated');

        return (
          <div
            {...(!ready && {
              'aria-hidden': true,
              style: { opacity: 0, pointerEvents: 'none', userSelect: 'none' },
            })}
          >
            {(() => {
              if (!connected) {
                return (
                  <button
                    onClick={openConnectModal}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold shadow-lg shadow-blue-600/20 transition-colors"
                  >
                    <Wallet size={14} />
                    Connect Wallet
                  </button>
                );
              }

              if (chain.unsupported) {
                return (
                  <button
                    onClick={openChainModal}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600/20 border border-red-500/40 text-red-300 hover:bg-red-600/30 transition-colors text-sm font-bold"
                  >
                    Wrong network
                  </button>
                );
              }

              return (
                <div className="flex items-center gap-2">
                  <button
                    onClick={openAccountModal}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600/10 border border-blue-500/30 text-blue-300 hover:bg-blue-600/20 transition-colors text-sm font-mono"
                  >
                    <Wallet size={14} />
                    {shortenAddress(account.address)}
                  </button>
                  <button
                    onClick={openAccountModal}
                    className="p-2 rounded-lg border border-gray-800 text-gray-500 hover:text-white hover:border-gray-600 transition-colors"
                    aria-label="Account & disconnect"
                    title="Account & disconnect"
                  >
                    <LogOut size={14} />
                  </button>
                </div>
              );
            })()}
          </div>
        );
      }}
    </RKConnectButton.Custom>
  );
};

export default ConnectButton;
