import { describe, expect, it } from "vitest";
import { openDb } from "@/lib/db";
import {
  AppError,
  clearInterrupt,
  completeCheck,
  createCheck,
  findingsForCheck,
  getInterrupt,
  getReview,
  listQueue,
  missingForSubmit,
  saveDraft,
  setDecision,
  setInterrupt,
  submitReview,
} from "@/lib/repo";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FULL_DRAFT, T1, T2, freshDb } from "../helpers/db";

const expectAppError = (fn: () => unknown, status: number) => {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).status).toBe(status);
    return;
  }
  throw new Error("expected an AppError");
};

describe("queue", () => {
  it("lists three tasks; the seeded Task 2 review is submitted", () => {
    const queue = listQueue(freshDb());
    expect(queue.map((t) => [t.slug, t.status, t.seeded])).toEqual([
      ["ci-fails-scale-recipe", "not_started", false],
      ["watering-shift-reminder", "submitted", true],
      ["list-rerenders-keystroke", "not_started", false],
    ]);
    expect(queue[0]!.sessions).toEqual([
      { id: T1.a, label: "A", turns: 12 },
      { id: T1.b, label: "B", turns: 7 },
    ]);
  });
});

describe("interrupts", () => {
  it("one per session, on a real turn, and it survives a reopen of the database file", () => {
    const dir = mkdtempSync(join(tmpdir(), "asr-test-"));
    try {
      const file = join(dir, "app.db");
      const db = openDb(file);
      setInterrupt(db, T1.b, "t4", "Stop. Reproduce with CI's seed first.");
      expectAppError(() => setInterrupt(db, T1.b, "t5", "again"), 409);
      expectAppError(() => setInterrupt(db, T1.a, "t99", "nope"), 400);
      db.close();
      const reopened = openDb(file);
      expect(getInterrupt(reopened, T1.b)).toMatchObject({ turnId: "t4", note: "Stop. Reproduce with CI's seed first." });
      clearInterrupt(reopened, T1.b);
      expect(getInterrupt(reopened, T1.b)).toBeNull();
      reopened.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("refuses unknown sessions", () => {
    expectAppError(() => setInterrupt(freshDb(), "nope", "t1", "x"), 404);
  });
});

describe("reviews", () => {
  it("lists what blocks Submit in plain words", () => {
    expect(missingForSubmit({ scores: { A: {}, B: { trust: 2 } }, preference: null, rationale: " ", feedback: { A: "", B: "" } })).toEqual([
      "6 scores for A",
      "5 scores for B",
      "a preference",
      "a rationale",
    ]);
    expect(missingForSubmit(FULL_DRAFT)).toEqual([]);
  });

  it("saves drafts, refuses an incomplete submit, then locks everything after submit", () => {
    const db = freshDb();
    saveDraft(db, T1.slug, { ...FULL_DRAFT, preference: null });
    expect(getReview(db, T1.slug).status).toBe("draft");
    expectAppError(() => submitReview(db, T1.slug), 422);

    saveDraft(db, T1.slug, FULL_DRAFT);
    const done = submitReview(db, T1.slug);
    expect(done.status).toBe("submitted");
    expect(done.submittedAt).not.toBeNull();

    expectAppError(() => saveDraft(db, T1.slug, FULL_DRAFT), 409);
    expectAppError(() => submitReview(db, T1.slug), 409);
    expectAppError(() => setInterrupt(db, T1.b, "t4", "late"), 409);
    expect(listQueue(db)[0]!.status).toBe("submitted");
  });

  it("the seeded review is locked", () => {
    expectAppError(() => saveDraft(freshDb(), T2.slug, FULL_DRAFT), 409);
  });
});

describe("findings", () => {
  it("stores findings in order and records decisions, locked after submit", () => {
    const db = freshDb();
    const checkId = createCheck(db, T1.b, "replay");
    completeCheck(db, checkId, {
      mode: "replay",
      stats: { model: "m", durationMs: 1, inputTokens: 1, outputTokens: 1, costUsd: 0, numTurns: 1 },
      trace: [],
      findings: [
        { claim: "All tests pass now.", topic: "tests", verdict: "unsupported", evidence: ["t3"], reason: "r" },
        { claim: "I added retries", topic: "change", verdict: "supported", evidence: ["t5"], reason: "r" },
      ],
      dropped: [],
    });
    const [first, second] = findingsForCheck(db, checkId);
    expect(first!.claim).toBe("All tests pass now.");
    expect(setDecision(db, first!.id, "accepted").decision).toBe("accepted");
    expect(setDecision(db, second!.id, "rejected").decision).toBe("rejected");
    expect(findingsForCheck(db, checkId).map((f) => f.decision)).toEqual(["accepted", "rejected"]);
    expectAppError(() => setDecision(db, 9999, "accepted"), 404);

    saveDraft(db, T1.slug, FULL_DRAFT);
    submitReview(db, T1.slug);
    expectAppError(() => setDecision(db, first!.id, null), 409);
  });
});
