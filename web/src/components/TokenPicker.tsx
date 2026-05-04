'use client';

/**
 * Searchable token picker for the Send page.
 *
 * Pure presentational — caller provides the chainId + current selection,
 * and receives a callback when the user picks a different token. Reads
 * the popular-tokens registry to populate the list.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search, Check } from 'lucide-react';

import {
  searchTokens,
  type PopularToken,
} from '@/lib/tokens/popular';

export function TokenPicker({
  chainId,
  value,
  onChange,
  className = '',
}: {
  chainId: number;
  value: PopularToken | null;
  onChange: (t: PopularToken) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(
    () => searchTokens(chainId, query),
    [chainId, query]
  );

  // Close when clicking outside
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border border-gray-800 hover:border-gray-600 bg-black/40 text-left transition-colors"
      >
        <div className="min-w-0 flex items-center gap-2">
          {value ? (
            <>
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-zinc-700 to-zinc-900 border border-zinc-700 flex items-center justify-center flex-shrink-0">
                <span className="text-[9px] font-mono font-bold text-zinc-300">
                  {value.symbol.slice(0, 3)}
                </span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-mono font-bold text-white truncate">
                  {value.symbol}
                </p>
                <p className="text-[10px] text-zinc-500 truncate">{value.name}</p>
              </div>
            </>
          ) : (
            <span className="text-sm text-zinc-500">Select token…</span>
          )}
        </div>
        <ChevronDown
          size={14}
          className={`text-zinc-500 flex-shrink-0 transition-transform ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {open && (
        <div className="absolute z-50 left-0 right-0 mt-1 rounded-lg border border-zinc-700 bg-zinc-950 shadow-2xl overflow-hidden">
          <div className="px-3 py-2 border-b border-zinc-800 flex items-center gap-2">
            <Search size={14} className="text-zinc-500 flex-shrink-0" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search symbol or name…"
              className="w-full bg-transparent text-sm text-white placeholder:text-zinc-600 outline-none"
              spellCheck={false}
              autoComplete="off"
            />
          </div>
          <div className="max-h-[280px] overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-zinc-500">
                No tokens match &ldquo;{query}&rdquo;.
              </div>
            ) : (
              filtered.map((t) => {
                const isSelected =
                  value !== null &&
                  value.chainId === t.chainId &&
                  ((value.address === null && t.address === null) ||
                    value.address?.toLowerCase() === t.address?.toLowerCase());
                return (
                  <button
                    key={`${t.chainId}-${t.address ?? 'native'}`}
                    type="button"
                    onClick={() => {
                      onChange(t);
                      setOpen(false);
                      setQuery('');
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-white/[0.03] transition-colors border-b border-zinc-900/50 last:border-b-0 ${
                      isSelected ? 'bg-blue-500/5' : ''
                    }`}
                  >
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-zinc-700 to-zinc-900 border border-zinc-700 flex items-center justify-center flex-shrink-0">
                      <span className="text-[9px] font-mono font-bold text-zinc-300">
                        {t.symbol.slice(0, 3)}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-mono font-bold text-white">
                        {t.symbol}
                        {t.address === null && (
                          <span className="ml-1.5 text-[9px] uppercase tracking-widest text-emerald-400 font-bold">
                            native
                          </span>
                        )}
                      </p>
                      <p className="text-[10px] text-zinc-500 truncate">
                        {t.name}
                      </p>
                    </div>
                    {isSelected && (
                      <Check
                        size={14}
                        className="text-blue-400 flex-shrink-0"
                      />
                    )}
                  </button>
                );
              })
            )}
          </div>
          <div className="px-3 py-2 border-t border-zinc-800 text-[10px] text-zinc-600">
            {filtered.length} token{filtered.length === 1 ? '' : 's'} on this chain
          </div>
        </div>
      )}
    </div>
  );
}
