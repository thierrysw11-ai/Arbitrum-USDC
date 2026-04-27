"use client";

import { useEffect, useRef, useState } from "react";
import { X, Send, Sparkles, Loader2 } from "lucide-react";

import ToolTrace from "./ToolTrace";

/**
 * Slide-out chat panel for the Sentinel agent.
 *
 * Anchors to the right edge of the viewport, slides in/out, contains:
 *  - Header with title + close button
 *  - Scrolling message list with assistant text, user text, and tool
 *    traces interleaved in chronological order
 *  - Input field with send button
 *
 * The conversation is held entirely in component state — refreshing the
 * page resets it. Persistence is a Phase 2.5 concern.
 */

// Mirror of WireMessage in the route handler. Keeping a copy here avoids
// importing server-side types into a client component.
type Message =
  | { role: "user"; content: string }
  | {
      role: "assistant";
      content: Array<
        | { type: "text"; text: string }
        | { type: "tool_use"; id: string; name: string; input: unknown }
      >;
    }
  | {
      role: "tool";
      results: Array<{
        tool_use_id: string;
        name: string;
        result: unknown;
      }>;
    };

const SUGGESTIONS_DEFAULT = [
  "Summarize this position's risk in plain English.",
  "What happens to the health factor if WETH drops 30%?",
  "What's the liquidation price for the largest collateral asset?",
  "Show me recent liquidations on Arbitrum.",
];

const SUGGESTIONS_NO_ADDRESS = [
  "What can you do?",
  "Show me recent borrows on Arbitrum.",
  "What's the most recent liquidation on Aave V3 Arbitrum?",
];

export default function AgentPanel({
  open,
  onClose,
  activeAddress,
}: {
  open: boolean;
  onClose: () => void;
  activeAddress?: `0x${string}`;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new messages.
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, sending]);

  const send = async (raw: string) => {
    const text = raw.trim();
    if (!text || sending) return;

    setError(null);
    const next: Message[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setSending(true);

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messages: next,
          activeAddress,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Agent returned ${res.status}`);
      }
      const json = (await res.json()) as { messages: Message[] };
      setMessages(json.messages);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  };

  const reset = () => {
    setMessages([]);
    setError(null);
    setInput("");
  };

  // Tool results are looked up by id when rendering. Build the index once
  // per render, since messages aren't huge.
  const toolResultById = new Map<string, { name: string; result: unknown }>();
  for (const m of messages) {
    if (m.role === "tool") {
      for (const r of m.results) {
        toolResultById.set(r.tool_use_id, { name: r.name, result: r.result });
      }
    }
  }

  const suggestions = activeAddress ? SUGGESTIONS_DEFAULT : SUGGESTIONS_NO_ADDRESS;

  return (
    <>
      {/* Backdrop — soft dim, click to close */}
      <div
        onClick={onClose}
        className={`fixed inset-0 bg-black/40 transition-opacity z-40 ${
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      />
      {/* Panel */}
      <aside
        className={`fixed top-0 right-0 h-screen w-full sm:w-[480px] bg-[#0b1220] border-l border-gray-800 z-50 flex flex-col transition-transform ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <header className="flex items-center gap-3 px-4 py-3 border-b border-gray-800 shrink-0">
          <Sparkles className="w-4 h-4 text-blue-400" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white">Sentinel</p>
            <p className="text-[11px] text-gray-500">
              Read-only Aave V3 advisor
              {activeAddress && (
                <>
                  {" · "}
                  <span className="font-mono text-gray-600">
                    {activeAddress.slice(0, 6)}…{activeAddress.slice(-4)}
                  </span>
                </>
              )}
            </p>
          </div>
          {messages.length > 0 && (
            <button
              onClick={reset}
              className="text-[11px] text-gray-500 hover:text-white px-2 py-1 rounded transition-colors"
            >
              Reset
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-gray-900 text-gray-400 hover:text-white transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {messages.length === 0 && (
            <Welcome
              suggestions={suggestions}
              onSelect={send}
              activeAddress={activeAddress}
            />
          )}

          {messages.map((m, i) => {
            if (m.role === "user") {
              return (
                <div key={i} className="flex justify-end">
                  <div className="max-w-[85%] px-3 py-2 bg-blue-600 text-white text-sm rounded-2xl rounded-br-sm">
                    {m.content}
                  </div>
                </div>
              );
            }
            if (m.role === "assistant") {
              return (
                <div key={i} className="space-y-2">
                  {m.content.map((block, j) => {
                    if (block.type === "text") {
                      return (
                        <div
                          key={j}
                          className="max-w-[95%] text-sm text-gray-200 leading-relaxed whitespace-pre-wrap"
                        >
                          {block.text}
                        </div>
                      );
                    }
                    // tool_use — pair with the matching tool_result if we
                    // already have it (we always do, since the route runs
                    // the loop server-side before returning).
                    const result = toolResultById.get(block.id);
                    return (
                      <ToolTrace
                        key={j}
                        name={block.name}
                        args={block.input}
                        result={result?.result}
                      />
                    );
                  })}
                </div>
              );
            }
            // tool messages render via the assistant turn pairing above.
            return null;
          })}

          {sending && (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Loader2 className="w-3 h-3 animate-spin" />
              Sentinel is thinking…
            </div>
          )}

          {error && (
            <div className="text-[11px] text-red-400 bg-red-950/40 border border-red-900 rounded-md p-2 font-mono break-all">
              {error}
            </div>
          )}
        </div>

        {/* Input */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex items-center gap-2 px-4 py-3 border-t border-gray-800 shrink-0"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              activeAddress
                ? "Ask about this position…"
                : "Ask Sentinel anything about Aave V3 on Arbitrum…"
            }
            disabled={sending}
            className="flex-1 bg-gray-900 border border-gray-700 rounded-md px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-blue-500 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!input.trim() || sending}
            className="p-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-800 disabled:text-gray-600 text-white rounded-md transition-colors"
            aria-label="Send"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </aside>
    </>
  );
}

function Welcome({
  suggestions,
  onSelect,
  activeAddress,
}: {
  suggestions: string[];
  onSelect: (s: string) => void;
  activeAddress?: `0x${string}`;
}) {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-gray-300 leading-relaxed">
          I can read live Aave V3 positions on Arbitrum and answer
          questions about risk, liquidation prices, and what-if price
          shocks. I never execute trades.
        </p>
        {activeAddress && (
          <p className="text-[11px] text-gray-500 mt-2">
            I&apos;ll use the address you&apos;re currently viewing unless
            you tell me otherwise.
          </p>
        )}
      </div>
      <div>
        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">
          Try asking
        </p>
        <ul className="space-y-1">
          {suggestions.map((s) => (
            <li key={s}>
              <button
                onClick={() => onSelect(s)}
                className="w-full text-left text-xs text-gray-300 px-3 py-2 bg-gray-900/40 hover:bg-gray-900 border border-gray-800 hover:border-blue-700 rounded-md transition-colors"
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
