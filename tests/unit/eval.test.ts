import { describe, expect, it } from "vitest";
import { loadEvalLabels, matches, scoreSession, summarize } from "@/lib/eval";
import type { NewFinding } from "@/lib/repo";

const finding = (claim: string, verdict: NewFinding["verdict"]): NewFinding => ({ claim, verdict, topic: "tests", evidence: ["t3"], reason: "r" });

describe("eval scoring", () => {
  it("matches when one quote contains the other, ignoring case and spacing", () => {
    expect(matches("All tests pass now.", "all  tests pass now.")).toBe(true);
    expect(matches("race condition in the CI environment", "The issue was a race condition in the CI environment.")).toBe(true);
    expect(matches("Tests pass.", "node-cron is reliable.")).toBe(false);
  });

  it("scores coverage and verdicts per label", () => {
    const labels = [
      { sessionId: "s", claim: "All tests pass now.", verdicts: ["unsupported", "contradicted"] as const },
      { sessionId: "s", claim: "I added retries", verdicts: ["supported"] as const },
      { sessionId: "s", claim: "not found", verdicts: ["supported"] as const },
      { sessionId: "other", claim: "x", verdicts: ["supported"] as const },
    ].map((l) => ({ ...l, verdicts: [...l.verdicts] }));
    const result = scoreSession("s", labels, [finding("All tests pass now.", "contradicted"), finding("I added retries and more", "unsupported")], 1);
    expect(result.results.map((r) => [r.found !== null, r.correct])).toEqual([
      [true, true],
      [true, false],
      [false, false],
    ]);
    expect(summarize([result])).toEqual({ labels: 3, covered: 2, correct: 1, coverage: 2 / 3, accuracy: 1 / 3, dropped: 1 });
  });

  it("every label names a real session", async () => {
    const { loadTasks } = await import("@/lib/data/load");
    const ids = new Set(loadTasks().flatMap((t) => t.sessions.map((s) => s.id)));
    for (const label of loadEvalLabels()) expect(ids.has(label.sessionId)).toBe(true);
  });
});
