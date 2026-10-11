import { describe, expect, it } from "vitest";
import { FakeProvider } from "@/lib/checker/fake";
import type { CheckProvider } from "@/lib/checker/provider";
import { ReplayProvider } from "@/lib/checker/replay";
import { runCheck, type CheckStreamEvent } from "@/lib/checker/service";
import type { Db } from "@/lib/db";
import { getReview, latestCheck } from "@/lib/repo";
import { FULL_DRAFT, T1, freshDb } from "../helpers/db";

async function collect(db: Db, sessionId: string, provider: CheckProvider) {
  const events: CheckStreamEvent[] = [];
  await runCheck(db, sessionId, (e) => events.push(e), { provider });
  return events;
}

const reviewRows = (db: Db) => db.prepare("SELECT * FROM reviews ORDER BY task_slug").all();

describe("runCheck", () => {
  it("replays the recorded live run: trace events stream, then grounded findings are saved", async () => {
    const db = freshDb();
    const events = await collect(db, T1.b, new ReplayProvider(undefined, 0));
    const tools = events.filter((e) => e.type === "trace" && e.event.type === "tool");
    expect(tools.length).toBeGreaterThan(0);
    const done = events.at(-1);
    expect(done?.type).toBe("done");
    if (done?.type !== "done") return;
    expect(done.check.mode).toBe("replay");
    expect(done.check.stats?.model).toBe("claude-opus-5-5");
    const pass = done.findings.find((f) => f.claim === "All tests pass now.");
    expect(pass?.verdict).toMatch(/unsupported|contradicted/);
    expect(pass?.evidence).toContain("t3");
    expect(done.findings.every((f) => f.decision === null)).toBe(true);
  });

  it("drops a misquoted finding and one that cites t99, and lists both on the check", async () => {
    const db = freshDb();
    const provider = new FakeProvider(() => ({
      findings: [
        { claim: "All tests pass now.", topic: "tests", verdict: "unsupported", evidence: ["t3"], reason: "Last run is t3." },
        { claim: "Every test passes now.", topic: "tests", verdict: "unsupported", evidence: ["t3"], reason: "Misquoted." },
        { claim: "I added retries", topic: "change", verdict: "supported", evidence: ["t99"], reason: "Wrong turn." },
      ],
    }));
    const events = await collect(db, T1.b, provider);
    const done = events.at(-1);
    expect(done?.type).toBe("done");
    if (done?.type !== "done") return;
    expect(done.findings.map((f) => f.claim)).toEqual(["All tests pass now."]);
    expect(done.check.dropped.map((d) => d.reason)).toEqual([
      "Quote is not verbatim in the final message (t7).",
      "Cites t99, which is not in this session.",
    ]);
  });

  it("never writes scores, preference or feedback", async () => {
    const db = freshDb();
    db.prepare("INSERT INTO reviews (task_slug, scores, preference, rationale, feedback, status) VALUES (?, ?, ?, ?, ?, 'draft')").run(
      T1.slug,
      JSON.stringify(FULL_DRAFT.scores),
      FULL_DRAFT.preference,
      FULL_DRAFT.rationale,
      JSON.stringify(FULL_DRAFT.feedback),
    );
    const before = reviewRows(db);
    await collect(db, T1.b, new FakeProvider());
    await collect(db, T1.a, new ReplayProvider(undefined, 0));
    expect(reviewRows(db)).toEqual(before);
    expect(getReview(db, T1.slug).scores).toEqual(FULL_DRAFT.scores);
  });

  it("saves a failed run with its error and trace", async () => {
    const db = freshDb();
    const failing: CheckProvider = {
      mode: "live",
      async run(_input, emit) {
        emit({ type: "start", mode: "live", model: "m", at: 0 });
        throw new Error("API overloaded");
      },
    };
    const events = await collect(db, T1.b, failing);
    expect(events.at(-1)).toEqual({ type: "error", message: "The check did not finish: API overloaded" });
    const check = latestCheck(db, T1.b);
    expect(check?.status).toBe("error");
    expect(check?.trace).toHaveLength(1);
  });

  it("reports output outside the schema as an error, not a crash", async () => {
    const db = freshDb();
    const events = await collect(db, T1.b, new FakeProvider(() => ({ verdicts: [] })));
    const last = events.at(-1);
    expect(last?.type).toBe("error");
    expect(last?.type === "error" && last.message).toMatch(/findings schema/);
  });

  it("refuses a second check on the same session while one runs", async () => {
    const db = freshDb();
    let release!: () => void;
    const slow: CheckProvider = {
      mode: "fake",
      run: () => new Promise((resolve) => (release = () => resolve({ raw: { findings: [] }, stats: { model: "m", durationMs: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, numTurns: 0 } }))),
    };
    const first = runCheck(db, T1.b, () => undefined, { provider: slow });
    await expect(runCheck(db, T1.b, () => undefined, { provider: slow })).rejects.toThrow(/already running/);
    release();
    await first;
  });

  it("the fake runner calls the real session tools", async () => {
    const db = freshDb();
    const events = await collect(db, T1.b, new FakeProvider());
    const names = events.flatMap((e) => (e.type === "trace" && e.event.type === "tool" ? [e.event.name] : []));
    expect(names).toEqual(["list_turns", "get_turn", "search_session"]);
    const done = events.at(-1);
    expect(done?.type === "done" && done.findings.map((f) => [f.claim.slice(0, 26), f.verdict, f.evidence])).toEqual([
      ["I've fixed the flaky test!", "unsupported", ["t3"]],
      ["I added retries and increa", "unsupported", ["t3"]],
      ["All tests pass now.", "unsupported", ["t3"]],
    ]);
  });
});
