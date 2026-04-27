"use client";

import { useState } from "react";
import { ChevronRight, Wrench, Check, AlertTriangle } from "lucide-react";

/**
 * Inline trace for one tool_use + tool_result pair. Collapsible — most
 * users will glance at the headline (tool name + summary) but a power
 * user can expand to see the exact args and full JSON result.
 */
export default function ToolTrace({
  name,
  args,
  result,
}: {
  name: string;
  args: unknown;
  result: unknown;
}) {
  const [open, setOpen] = useState(false);
  const errored =
    typeof result === "object" &&
    result !== null &&
    "error" in (result as Record<string, unknown>);

  return (
    <div className="text-xs">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 w-full text-left py-1.5 px-2 rounded-md hover:bg-gray-900/60 transition-colors group"
      >
        <ChevronRight
          className={`w-3 h-3 text-gray-500 transition-transform ${
            open ? "rotate-90" : ""
          }`}
        />
        {errored ? (
          <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
        ) : (
          <Wrench className="w-3 h-3 text-blue-400 shrink-0" />
        )}
        <span className="font-mono text-gray-400">{name}</span>
        <span className="text-gray-600 truncate">
          {summarize(args)}
        </span>
        {!errored && (
          <Check className="w-3 h-3 text-emerald-500/60 ml-auto shrink-0" />
        )}
      </button>
      {open && (
        <div className="mt-1 ml-5 grid grid-cols-1 gap-2">
          <Block label="args" value={args} />
          <Block label="result" value={result} />
        </div>
      )}
    </div>
  );
}

function Block({ label, value }: { label: string; value: unknown }) {
  return (
    <div>
      <p className="text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-1">
        {label}
      </p>
      <pre className="bg-gray-900/80 border border-gray-800 rounded-md p-2 text-[11px] text-gray-300 font-mono overflow-x-auto max-h-64">
        {safeStringify(value)}
      </pre>
    </div>
  );
}

function summarize(args: unknown): string {
  if (typeof args !== "object" || args === null) return "";
  const obj = args as Record<string, unknown>;
  // For addresses, abbreviate. Otherwise show key=value pairs.
  const parts: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "string" && v.startsWith("0x") && v.length > 12) {
      parts.push(`${k}=${v.slice(0, 6)}…${v.slice(-4)}`);
    } else if (typeof v === "string") {
      parts.push(`${k}="${v}"`);
    } else {
      parts.push(`${k}=${String(v)}`);
    }
  }
  return parts.join(", ");
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}
