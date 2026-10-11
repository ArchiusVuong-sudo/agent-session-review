import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ProviderMode } from "../types";

export interface ModeProbe {
  env: NodeJS.ProcessEnv;
  platform: NodeJS.Platform;
  /** True when the macOS keychain holds a Claude Code login. Never reads the secret. */
  keychainHasLogin: () => Promise<boolean>;
  fileExists: (path: string) => boolean;
  home: string;
}

function keychainHasLogin(): Promise<boolean> {
  // No -w flag: this asks only whether the item exists; the secret is never read.
  return new Promise((resolve) => {
    execFile("security", ["find-generic-password", "-s", "Claude Code-credentials"], { timeout: 3000 }, (error) =>
      resolve(!error),
    );
  });
}

export const defaultProbe = (): ModeProbe => ({
  env: process.env,
  platform: process.platform,
  keychainHasLogin,
  fileExists: existsSync,
  home: homedir(),
});

export interface ModeDecision {
  mode: ProviderMode;
  reason: string;
}

/** Fake when CHECKER=fake; otherwise live when the SDK can log in, replay when DEMO_REPLAY=1 or no login or key is found. */
export async function detectMode(probe: ModeProbe = defaultProbe()): Promise<ModeDecision> {
  if (probe.env.CHECKER === "fake") return { mode: "fake", reason: "CHECKER=fake" };
  if (probe.env.DEMO_REPLAY === "1") return { mode: "replay", reason: "DEMO_REPLAY=1" };
  if (probe.env.ANTHROPIC_API_KEY) return { mode: "live", reason: "ANTHROPIC_API_KEY is set" };
  if (probe.platform === "darwin" && (await probe.keychainHasLogin())) return { mode: "live", reason: "local login" };
  if (probe.fileExists(join(probe.home, ".claude", ".credentials.json"))) return { mode: "live", reason: "local login" };
  return { mode: "replay", reason: "no login or key found" };
}

const cache = globalThis as unknown as { __checkMode?: Promise<ModeDecision> };

export function currentMode(): Promise<ModeDecision> {
  cache.__checkMode ??= detectMode();
  return cache.__checkMode;
}

/** After a live run fails on auth, the rest of this process uses replay. */
export function fallBackToReplay(reason: string): void {
  cache.__checkMode = Promise.resolve({ mode: "replay", reason });
}
