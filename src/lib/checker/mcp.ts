import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import type { Turn } from "../types";
import {
  GetTurnInput,
  ListTurnsInput,
  SearchSessionInput,
  TOOL_DESCRIPTIONS,
  TOOL_NAMES,
  getTurn,
  listTurns,
  searchSession,
  type ToolName,
} from "./tools";

export const MCP_SERVER_NAME = "session";

/** Tool names as the SDK sees them; the only tools the agent may call. */
export const ALLOWED_TOOLS = TOOL_NAMES.map((name) => `mcp__${MCP_SERVER_NAME}__${name}`);

export interface ToolCall {
  name: ToolName;
  args: Record<string, unknown>;
  ms: number;
}

/**
 * An in-process MCP server over one session. `loadTurns` reads the session
 * from SQLite on every call; `onCall` reports each call with its timing.
 */
export function buildSessionServer(loadTurns: () => Turn[], onCall: (call: ToolCall) => void) {
  const timed = <A extends Record<string, unknown>>(name: ToolName, run: (turns: Turn[], args: A) => unknown) =>
    async (args: A) => {
      const started = performance.now();
      try {
        const result = run(loadTurns(), args);
        const isError = typeof result === "object" && result !== null && "error" in result;
        return { content: [{ type: "text" as const, text: JSON.stringify(result) }], ...(isError ? { isError: true } : {}) };
      } catch (error) {
        return { content: [{ type: "text" as const, text: `Tool failed: ${(error as Error).message}` }], isError: true };
      } finally {
        onCall({ name, args, ms: Math.round((performance.now() - started) * 10) / 10 });
      }
    };

  return createSdkMcpServer({
    name: MCP_SERVER_NAME,
    version: "0.1.0",
    alwaysLoad: true,
    tools: [
      tool("list_turns", TOOL_DESCRIPTIONS.list_turns, ListTurnsInput, timed("list_turns", (turns) => listTurns(turns))),
      tool("get_turn", TOOL_DESCRIPTIONS.get_turn, GetTurnInput, timed("get_turn", getTurn)),
      tool("search_session", TOOL_DESCRIPTIONS.search_session, SearchSessionInput, timed("search_session", searchSession)),
    ],
  });
}
