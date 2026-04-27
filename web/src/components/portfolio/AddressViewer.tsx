"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { isAddress } from "viem";
import { useAccount } from "wagmi";
import { Eye, X, Search } from "lucide-react";

/**
 * Lets the user inspect any wallet's Aave V3 position without connecting
 * one of their own. Address persists in the URL (?address=0x…) so a view
 * can be linked or refreshed.
 *
 * Behavior:
 *   - Empty input: shows a textbox + "View" button.
 *   - In spectator mode (?address= set): shows the active address with a
 *     "Clear" button that drops back to the connected wallet (or to the
 *     prompt-to-connect state, if no wallet is connected).
 */
export default function AddressViewer({
  activeAddress,
  isOverride,
}: {
  activeAddress?: `0x${string}`;
  isOverride: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { address: connectedAddress } = useAccount();

  // Local input state, only committed to the URL on submit.
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Reset the input whenever the URL override flips off (e.g. after Clear
  // or external navigation).
  useEffect(() => {
    if (!searchParams.get("address")) setValue("");
  }, [searchParams]);

  const submit = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) {
      setError(null);
      return;
    }
    if (!isAddress(trimmed)) {
      setError("Not a valid address");
      return;
    }
    setError(null);
    const params = new URLSearchParams(searchParams.toString());
    params.set("address", trimmed.toLowerCase());
    router.replace(`/portfolio?${params.toString()}`);
  };

  const clear = () => {
    setValue("");
    setError(null);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("address");
    const qs = params.toString();
    router.replace(qs ? `/portfolio?${qs}` : "/portfolio");
  };

  // -----------------------------------------------------------------------
  // Spectator mode banner — show whose position is being viewed.
  // -----------------------------------------------------------------------
  if (isOverride && activeAddress) {
    const isOwnWallet =
      !!connectedAddress &&
      connectedAddress.toLowerCase() === activeAddress.toLowerCase();
    return (
      <div className="flex items-center gap-3 px-4 py-3 bg-blue-950/30 border border-blue-900/60 rounded-xl">
        <Eye className="w-4 h-4 text-blue-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">
            Viewing
          </p>
          <p className="font-mono text-xs text-white truncate mt-0.5">
            {activeAddress}
          </p>
        </div>
        <button
          onClick={clear}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 hover:bg-gray-800 border border-gray-700 rounded-md text-xs font-semibold text-gray-300 transition-colors"
        >
          <X className="w-3 h-3" />
          {isOwnWallet ? "Clear" : "Back to my wallet"}
        </button>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Default — search input.
  // -----------------------------------------------------------------------
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit(value);
      }}
      className="flex flex-col gap-2"
    >
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              if (error) setError(null);
            }}
            placeholder="Inspect any wallet — paste a 0x address"
            className="w-full bg-gray-900 border border-gray-700 rounded-md pl-9 pr-3 py-2 text-sm text-white font-mono placeholder:text-gray-600 placeholder:font-sans focus:outline-none focus:border-blue-500"
            spellCheck={false}
            autoComplete="off"
          />
        </div>
        <button
          type="submit"
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-800 disabled:text-gray-600 text-white text-xs font-bold uppercase tracking-widest rounded-md transition-colors"
          disabled={!value.trim()}
        >
          View
        </button>
      </div>
      {error && (
        <p className="text-[11px] text-red-400 font-mono">{error}</p>
      )}
    </form>
  );
}
