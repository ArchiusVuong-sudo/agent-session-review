import type { EnvSource } from "./env-source";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Variables the agent child process may see. Everything else is dropped. */
export const CHILD_ENV_ALLOWLIST = ["PATH", "HOME", "USER", "LANG", "TMPDIR", "ANTHROPIC_API_KEY"] as const;

/**
 * Builds the environment for the agent child process from an allowlist.
 * The SDK replaces (not merges) the child env when `env` is passed, so this
 * is the whole environment the child sees.
 */
export function buildChildEnv(source: EnvSource = process.env): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of CHILD_ENV_ALLOWLIST) {
    const value = source[key];
    if (typeof value === "string" && value.length > 0) env[key] = value;
  }
  // Belt and braces: the allowlist already excludes these, keep it explicit.
  for (const key of Object.keys(env)) {
    if (key === "CLAUDECODE" || key.startsWith("CLAUDE_CODE_")) delete env[key];
  }
  return env;
}

/** A fresh, empty working directory for one agent run. */
export function makeRunDir(): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "session-check-"));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

export const DEFAULT_CHECK_MODEL = "claude-opus-5-5";

export function checkModel(source: EnvSource = process.env): string {
  return source.CHECK_MODEL?.trim() || DEFAULT_CHECK_MODEL;
}
