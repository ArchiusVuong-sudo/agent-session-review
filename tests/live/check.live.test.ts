import { describe, expect, it } from "vitest";
import { LiveProvider } from "@/lib/checker/live";
import { groundFindings } from "@/lib/checker/validator";
import type { TraceEvent } from "@/lib/types";
import { T1, freshDb, turnsOf } from "../helpers/db";

// Opt-in: LIVE=1 npm run test:live. Uses the local login or ANTHROPIC_API_KEY.
describe.skipIf(process.env.LIVE !== "1")("live claim check", () => {
  it(
    "reads Task 1 B through the session tools and flags 'All tests pass now.'",
    async () => {
      const turns = turnsOf(freshDb(), T1.b);
      const trace: TraceEvent[] = [];
      const out = await new LiveProvider().run(
        { sessionId: T1.b, sessionLabel: "B", loadTurns: () => turns },
        (e) => trace.push(e),
      );
      const tools = trace.filter((e) => e.type === "tool");
      expect(tools.length).toBeGreaterThan(0);
      expect(tools.every((e) => e.type === "tool" && ["list_turns", "get_turn", "search_session"].includes(e.name))).toBe(true);
      const { kept } = groundFindings(out.raw, turns);
      const pass = kept.find((f) => f.claim.includes("All tests pass now"));
      expect(pass?.verdict).toMatch(/^(unsupported|contradicted)$/);
      expect(pass?.evidence).toContain("t3");
      expect(out.stats.durationMs).toBeGreaterThan(0);
    },
    240_000,
  );
});
