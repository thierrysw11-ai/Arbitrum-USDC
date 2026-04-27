"use client";

import { useMemo } from "react";
import { useQuery, gql } from "@apollo/client";
import { useRouter, useSearchParams } from "next/navigation";
import { Users, ArrowRight } from "lucide-react";

import { aaveClient } from "@/lib/apollo";

/**
 * "Recent borrowers" hint panel. Pulls the most recent Borrow events from
 * our own Aave V3 Arbitrum subgraph, dedupes by user, and lets the
 * visitor one-click into spectator mode for that wallet.
 *
 * This is the primary fix for "I don't have an Aave position myself, what
 * address should I test with?" — every wallet here has, by definition,
 * borrowed on Aave V3 Arbitrum recently, so the rich UI lights up.
 */

const RECENT_BORROWS = gql`
  query RecentBorrows {
    borrows(first: 30, orderBy: timestamp, orderDirection: desc) {
      id
      user {
        id
      }
      reserve {
        symbol
        decimals
      }
      amount
      timestamp
    }
  }
`;

interface BorrowRow {
  id: string;
  user: { id: string };
  reserve: { symbol: string; decimals: number };
  amount: string;
  timestamp: string;
}

export default function RecentBorrowers() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const { data, loading, error } = useQuery<{ borrows: BorrowRow[] }>(
    RECENT_BORROWS,
    { client: aaveClient, fetchPolicy: "cache-first" }
  );

  // Dedupe by `user.id`, keep the *most recent* borrow per user, cap at 6.
  // The 30-row over-fetch is intentional: subgraph borrowers are bursty,
  // and a single whale spamming borrows would otherwise crowd the list.
  const uniqueUsers = useMemo(() => {
    if (!data?.borrows) return [];
    const seen = new Map<string, BorrowRow>();
    for (const b of data.borrows) {
      if (!seen.has(b.user.id)) seen.set(b.user.id, b);
      if (seen.size >= 6) break;
    }
    return Array.from(seen.values());
  }, [data]);

  if (loading) {
    return (
      <section className="p-6 bg-[#0f172a]/60 border border-gray-800 rounded-xl">
        <header className="flex items-center gap-2 mb-4">
          <Users className="w-4 h-4 text-blue-400" />
          <h2 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
            Recent Aave V3 Borrowers
          </h2>
        </header>
        <div className="space-y-2 animate-pulse">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-10 bg-gray-900/60 rounded-md" />
          ))}
        </div>
      </section>
    );
  }

  // Quietly drop the panel if the subgraph is unavailable — we don't want
  // to block the page on a non-essential hint.
  if (error || uniqueUsers.length === 0) return null;

  const view = (addr: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("address", addr.toLowerCase());
    router.replace(`/portfolio?${params.toString()}`);
  };

  return (
    <section className="p-6 bg-[#0f172a]/60 border border-gray-800 rounded-xl">
      <header className="flex items-center gap-2 mb-4">
        <Users className="w-4 h-4 text-blue-400" />
        <h2 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
          Recent Aave V3 Arbitrum Borrowers
        </h2>
        <span className="ml-auto text-[11px] text-gray-600">
          One-click into any of these to see the full UI
        </span>
      </header>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {uniqueUsers.map((b) => {
          const addr = b.user.id;
          const decimals = b.reserve.decimals ?? 18;
          // Best-effort human read; the exact figure isn't important here,
          // it's just a "here's what they did" hint.
          const human = Number(b.amount) / 10 ** decimals;
          const ageMin = Math.max(
            0,
            Math.round((Date.now() / 1000 - Number(b.timestamp)) / 60)
          );
          return (
            <li key={b.id}>
              <button
                onClick={() => view(addr)}
                className="w-full flex items-center justify-between px-3 py-2 bg-gray-900/40 hover:bg-gray-900 border border-gray-800 hover:border-blue-700 rounded-md transition-colors group"
              >
                <div className="text-left min-w-0">
                  <p className="font-mono text-xs text-white truncate">
                    {addr.slice(0, 10)}…{addr.slice(-6)}
                  </p>
                  <p className="text-[10px] text-gray-500 mt-0.5">
                    Borrowed{" "}
                    {human.toLocaleString(undefined, {
                      maximumFractionDigits: 2,
                    })}{" "}
                    {b.reserve.symbol}
                    <span className="ml-2 text-gray-600">
                      · {formatAge(ageMin)}
                    </span>
                  </p>
                </div>
                <ArrowRight className="w-3 h-3 text-gray-600 group-hover:text-blue-400 shrink-0 ml-2" />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function formatAge(minutes: number): string {
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
