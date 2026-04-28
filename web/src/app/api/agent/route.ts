/**
 * POST /api/agent
 *
 * The Sentinel agent's chat loop. The frontend posts the running
 * conversation here; this route runs Anthropic's tool-use loop until the
 * model produces a final assistant response, then returns the full updated
 * message list back to the client.
 *
 * Why server-side and non-streaming for v1:
 *   - Tool calls touch our env vars (ANTHROPIC_API_KEY) and the on-chain
 *     RPC; both must stay server-side.
 *   - Non-streaming keeps the frontend protocol dead simple. We can layer
 *     SSE / streaming on top later without changing the data shape.
 *   - The full agent trace (assistant text + tool calls + tool results)
 *     comes back in one shot, which is exactly what the chat UI renders.
 */

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

import { TOOL_DEFINITIONS, runTool } from "@/lib/agent/tools";
import { buildSystemPrompt } from "@/lib/agent/system-prompt";

// We rely on Node-only deps (viem RPC). Force the Node runtime so this
// doesn't accidentally end up on Edge.
export const runtime = "nodejs";
// Live data, never cache.
export const dynamic = "force-dynamic";

const MODEL = "claude-sonnet-4-5";
const MAX_TOOL_ITERATIONS = 6;

// --------------------------------------------------------------------------
// Wire shape
// --------------------------------------------------------------------------

/**
 * One message as the frontend stores it. Friendly to JSON, no SDK types.
 * The route accepts and returns lists of these.
 */
export type WireMessage =
  | { role: "user"; content: string }
  | {
      role: "assistant";
      // Anthropic's content blocks, but trimmed to just what we render:
      // text and tool_use. tool_result blocks live on user messages.
      content: Array<
        | { type: "text"; text: string }
        | {
            type: "tool_use";
            id: string;
            name: string;
            input: unknown;
          }
      >;
    }
  | {
      role: "tool";
      // We collapse tool results into their own role for simpler client
      // rendering; on the wire to Anthropic we expand them back into a
      // user message with `tool_result` blocks.
      results: Array<{
        tool_use_id: string;
        name: string;
        result: unknown;
      }>;
    };

interface PostBody {
  messages: WireMessage[];
  /** The address currently being viewed in the UI, if any. */
  activeAddress?: string;
}

// --------------------------------------------------------------------------
// Format conversion: WireMessage[] <-> Anthropic Messages.create payload
// --------------------------------------------------------------------------

function toAnthropicMessages(messages: WireMessage[]) {
  return messages.map((m): Anthropic.MessageParam => {
    if (m.role === "user") {
      return { role: "user", content: m.content };
    }
    if (m.role === "tool") {
      // tool_result blocks belong on a "user" message in Anthropic's API.
      return {
        role: "user",
        content: m.results.map((r) => ({
          type: "tool_result" as const,
          tool_use_id: r.tool_use_id,
          content: JSON.stringify(r.result),
        })),
      };
    }
    // assistant: pass content blocks through as-is
    return { role: "assistant", content: m.content };
  });
}

// --------------------------------------------------------------------------
// Handler
// --------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not configured on the server" },
      { status: 500 }
    );
  }

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return NextResponse.json(
      { error: "messages must be a non-empty array" },
      { status: 400 }
    );
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const system = buildSystemPrompt({ activeAddress: body.activeAddress });

  // Working copy of the conversation. We mutate this as we run the tool
  // loop, then return it whole at the end.
  const conversation: WireMessage[] = [...body.messages];

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system,
      tools: TOOL_DEFINITIONS as unknown as Anthropic.Tool[],
      messages: toAnthropicMessages(conversation),
    });

    // Append the assistant turn (text + any tool_use blocks) to the wire
    // conversation. Filter to the block types we care about.
    //
    // We annotate the flatMap return type explicitly because TS otherwise
    // picks one branch's element type instead of unifying them, which
    // breaks Vercel's stricter prod build.
    type AssistantBlock =
      | { type: "text"; text: string }
      | { type: "tool_use"; id: string; name: string; input: unknown };
    const blocks: AssistantBlock[] = response.content.flatMap(
      (b): AssistantBlock[] => {
        if (b.type === "text") {
          return [{ type: "text", text: b.text }];
        }
        if (b.type === "tool_use") {
          return [
            {
              type: "tool_use",
              id: b.id,
              name: b.name,
              input: b.input,
            },
          ];
        }
        return [];
      }
    );
    conversation.push({ role: "assistant", content: blocks });

    // If the model isn't asking for tools, we're done.
    if (response.stop_reason !== "tool_use") {
      break;
    }

    // Run every tool call in this turn (Anthropic can request several at
    // once). We run them sequentially — each is fast (one viem multicall)
    // and parallelizing complicates error reporting without much win.
    const toolUses = blocks.filter(
      (b): b is Extract<typeof b, { type: "tool_use" }> => b.type === "tool_use"
    );
    const results: Array<{
      tool_use_id: string;
      name: string;
      result: unknown;
    }> = [];
    for (const tu of toolUses) {
      const result = await runTool(tu.name, tu.input);
      results.push({ tool_use_id: tu.id, name: tu.name, result });
    }
    conversation.push({ role: "tool", results });
  }

  return NextResponse.json({ messages: conversation });
}
