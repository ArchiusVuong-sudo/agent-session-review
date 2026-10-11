/**
 * One SDK query on the local login: no built-in tools, one in-process MCP
 * tool, no settings, no session files, a temp cwd. Passes when the model
 * calls the tool and returns schema-shaped output.
 */
import { createSdkMcpServer, query, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { buildChildEnv, checkModel, makeRunDir } from "../src/lib/checker/sdk-env";

async function main(): Promise<void> {
  const calls: string[] = [];
  const server = createSdkMcpServer({
    name: "smoke",
    version: "0.1.0",
    tools: [
      tool("count_turns", "Returns how many turns the demo session has.", { session: z.string().min(1) }, async (args) => {
        calls.push(`count_turns(${args.session})`);
        return { content: [{ type: "text", text: JSON.stringify({ session: args.session, turns: 7 }) }] };
      }),
    ],
  });

  const run = makeRunDir();
  const started = Date.now();
  try {
    const stream = query({
      prompt: "Call count_turns with session 'b'. Then answer with the number of turns it reported.",
      options: {
        model: checkModel(),
        tools: [],
        mcpServers: { smoke: server },
        allowedTools: ["mcp__smoke__count_turns"],
        settingSources: [],
        strictMcpConfig: true,
        persistSession: false,
        permissionMode: "dontAsk",
        cwd: run.dir,
        maxTurns: 4,
        env: buildChildEnv(),
        outputFormat: {
          type: "json_schema",
          schema: {
            type: "object",
            properties: { turns: { type: "integer" } },
            required: ["turns"],
            additionalProperties: false,
          },
        },
      },
    });
    for await (const message of stream) {
      if (message.type === "result") {
        const ok = message.subtype === "success" && !message.is_error;
        const output = message.subtype === "success" ? message.structured_output : undefined;
        console.log(
          JSON.stringify(
            {
              ok,
              subtype: message.subtype,
              toolCalls: calls,
              structured_output: output,
              models: Object.keys(message.modelUsage),
              duration_ms: message.duration_ms,
              wall_ms: Date.now() - started,
            },
            null,
            2,
          ),
        );
        if (!ok || calls.length === 0) process.exitCode = 1;
      }
    }
  } finally {
    run.cleanup();
  }
}

main().catch((error: unknown) => {
  console.error("smoke failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
