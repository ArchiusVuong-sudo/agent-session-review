import { describe, expect, it } from "vitest";
import { MAX_TURNS, buildQueryOptions } from "@/lib/checker/live";
import { ALLOWED_TOOLS, buildSessionServer } from "@/lib/checker/mcp";
import { checkOutputJsonSchema } from "@/lib/checker/schema";
import { CHILD_ENV_ALLOWLIST, buildChildEnv, checkModel } from "@/lib/checker/sdk-env";

describe("live query options", () => {
  const options = buildQueryOptions({ model: "claude-opus-5-5", cwd: "/tmp/x", server: buildSessionServer(() => [], () => undefined) });

  it("turn off every built-in tool, setting file and saved session", () => {
    expect(options.tools).toEqual([]);
    expect(options.settingSources).toEqual([]);
    expect(options.strictMcpConfig).toBe(true);
    expect(options.persistSession).toBe(false);
    expect(options.permissionMode).toBe("dontAsk");
  });

  it("allow only the in-process session tools, with a bounded number of turns", () => {
    expect(options.allowedTools).toEqual(ALLOWED_TOOLS);
    expect(Object.keys(options.mcpServers ?? {})).toEqual(["session"]);
    expect(options.maxTurns).toBe(MAX_TURNS);
    expect(MAX_TURNS).toBeLessThanOrEqual(30);
    expect(options.cwd).toBe("/tmp/x");
  });

  it("ask for json_schema output that matches the findings schema", () => {
    expect(options.outputFormat).toEqual({ type: "json_schema", schema: checkOutputJsonSchema() });
    const schema = checkOutputJsonSchema() as { properties: { findings: { items: { required: string[] } } } };
    expect(schema.properties.findings.items.required).toEqual(["claim", "topic", "verdict", "evidence", "reason"]);
  });
});

describe("child env", () => {
  it("keeps only the allowlist and drops Claude Code session variables", () => {
    const env = buildChildEnv({
      PATH: "/usr/bin",
      HOME: "/home/u",
      USER: "u",
      LANG: "en_US.UTF-8",
      TMPDIR: "/tmp",
      CLAUDECODE: "1",
      CLAUDE_CODE_ENTRYPOINT: "cli",
      CLAUDE_CODE_OAUTH_TOKEN: "placeholder",
      AWS_SECRET_ACCESS_KEY: "placeholder",
      DATABASE_URL: "postgres://x",
    });
    expect(Object.keys(env).sort()).toEqual(["HOME", "LANG", "PATH", "TMPDIR", "USER"]);
    expect(CHILD_ENV_ALLOWLIST).not.toContain("CLAUDECODE");
  });

  it("passes ANTHROPIC_API_KEY only when set", () => {
    expect(buildChildEnv({ PATH: "/bin", ANTHROPIC_API_KEY: "placeholder" })).toEqual({ PATH: "/bin", ANTHROPIC_API_KEY: "placeholder" });
    expect(buildChildEnv({ PATH: "/bin", ANTHROPIC_API_KEY: "" })).toEqual({ PATH: "/bin" });
  });

  it("chooses the model by env var", () => {
    expect(checkModel({})).toBe("claude-opus-5-5");
    expect(checkModel({ CHECK_MODEL: " claude-sonnet-5-5 " })).toBe("claude-sonnet-5-5");
  });
});
