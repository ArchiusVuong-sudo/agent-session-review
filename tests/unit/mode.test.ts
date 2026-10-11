import { describe, expect, it } from "vitest";
import { detectMode, type ModeProbe } from "@/lib/checker/mode";

const probe = (over: Partial<ModeProbe> = {}): ModeProbe => ({
  env: {},
  platform: "linux",
  keychainHasLogin: async () => false,
  fileExists: () => false,
  home: "/home/u",
  ...over,
});

describe("detectMode", () => {
  it("CHECKER=fake wins", async () => {
    expect(await detectMode(probe({ env: { CHECKER: "fake", DEMO_REPLAY: "1" } }))).toEqual({ mode: "fake", reason: "CHECKER=fake" });
  });
  it("DEMO_REPLAY=1 forces replay even with a key", async () => {
    expect((await detectMode(probe({ env: { DEMO_REPLAY: "1", ANTHROPIC_API_KEY: "placeholder" } }))).mode).toBe("replay");
  });
  it("an API key means live", async () => {
    expect((await detectMode(probe({ env: { ANTHROPIC_API_KEY: "placeholder" } }))).mode).toBe("live");
  });
  it("a keychain login means live on macOS only", async () => {
    expect((await detectMode(probe({ platform: "darwin", keychainHasLogin: async () => true }))).mode).toBe("live");
    expect((await detectMode(probe({ platform: "linux", keychainHasLogin: async () => true }))).mode).toBe("replay");
  });
  it("a credentials file means live", async () => {
    const decision = await detectMode(probe({ fileExists: (p) => p === "/home/u/.claude/.credentials.json" }));
    expect(decision.mode).toBe("live");
  });
  it("nothing found means replay", async () => {
    expect(await detectMode(probe())).toEqual({ mode: "replay", reason: "no login or key found" });
  });
});
