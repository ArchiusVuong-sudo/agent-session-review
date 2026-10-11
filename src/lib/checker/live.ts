import { query, type Options, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { TraceEvent } from "../types";
import { ALLOWED_TOOLS, MCP_SERVER_NAME, buildSessionServer } from "./mcp";
import { SYSTEM_PROMPT, userPrompt } from "./prompt";
import type { CheckInput, CheckProvider, CheckRunOutput } from "./provider";
import { withRetry } from "./retry";
import { checkOutputJsonSchema } from "./schema";
import { buildChildEnv, checkModel, makeRunDir } from "./sdk-env";

export const MAX_TURNS = 24;

/**
 * Options for every live query. No built-in tools, only the session tools,
 * no filesystem settings or other MCP servers, no session files, an empty
 * temp cwd, and a permission mode that denies anything not pre-approved.
 */
export function buildQueryOptions(input: {
  model: string;
  cwd: string;
  server: ReturnType<typeof buildSessionServer>;
  abortController?: AbortController;
}): Options {
  return {
    model: input.model,
    systemPrompt: SYSTEM_PROMPT,
    tools: [],
    mcpServers: { [MCP_SERVER_NAME]: input.server },
    allowedTools: ALLOWED_TOOLS,
    settingSources: [],
    strictMcpConfig: true,
    persistSession: false,
    permissionMode: "dontAsk",
    cwd: input.cwd,
    maxTurns: MAX_TURNS,
    env: buildChildEnv(),
    outputFormat: { type: "json_schema", schema: checkOutputJsonSchema() },
    ...(input.abortController ? { abortController: input.abortController } : {}),
  };
}

/** Errors the API reports inside messages, turned into throwables the retry can read. */
function messageError(message: SDKMessage): Error | null {
  if (message.type === "assistant" && message.error && ["rate_limit", "overloaded", "server_error"].includes(message.error)) {
    return new Error(`API ${message.error}`);
  }
  if (message.type === "assistant" && message.error === "authentication_failed") {
    return new Error("authentication failed: not logged in");
  }
  return null;
}

export class LiveProvider implements CheckProvider {
  readonly mode = "live" as const;

  async run(input: CheckInput, emit: (event: TraceEvent) => void): Promise<CheckRunOutput> {
    const model = checkModel();
    const started = Date.now();
    emit({ type: "start", mode: "live", model, at: 0 });

    return withRetry(
      async () => {
        const run = makeRunDir();
        const abortController = new AbortController();
        const onAbort = () => abortController.abort();
        input.signal?.addEventListener("abort", onAbort, { once: true });
        const server = buildSessionServer(input.loadTurns, (call) => {
          emit({ type: "tool", name: call.name, args: call.args, ms: call.ms, at: Date.now() - started });
        });
        try {
          const stream = query({
            prompt: userPrompt(input.sessionLabel),
            options: buildQueryOptions({ model, cwd: run.dir, server, abortController }),
          });
          for await (const message of stream) {
            const error = messageError(message);
            if (error) throw error;
            if (message.type !== "result") continue;
            if (message.subtype !== "success" || message.is_error) {
              if (message.subtype === "success") {
                const status = message.api_error_status ? `${message.api_error_status} ` : "";
                throw new Error(`Check run failed: ${status}${message.result}`);
              }
              throw new Error(`Check run failed: ${message.subtype}${message.errors.length ? ` (${message.errors.join("; ")})` : ""}`);
            }
            if (message.structured_output === undefined) throw new Error("Check run returned no structured output.");
            const usage = Object.values(message.modelUsage);
            return {
              raw: message.structured_output,
              stats: {
                model,
                durationMs: message.duration_ms,
                inputTokens: usage.reduce((n, u) => n + u.inputTokens + u.cacheReadInputTokens + u.cacheCreationInputTokens, 0),
                outputTokens: usage.reduce((n, u) => n + u.outputTokens, 0),
                costUsd: message.total_cost_usd,
                numTurns: message.num_turns,
              },
            };
          }
          throw new Error("Check run ended without a result.");
        } finally {
          input.signal?.removeEventListener("abort", onAbort);
          run.cleanup();
        }
      },
      {
        onRetry: (attempt, delayMs, error) =>
          emit({
            type: "note",
            text: `Retrying in ${Math.round(delayMs / 1000)} s after: ${(error as Error).message} (attempt ${attempt + 1})`,
            at: Date.now() - started,
          }),
      },
    );
  }
}
