import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FakeProvider } from "@/lib/checker/fake";
import type { CheckProvider } from "@/lib/checker/provider";
import { runCheck, type CheckStreamEvent } from "@/lib/checker/service";
import { openDb, type Db } from "@/lib/db";
import { gatherExport, renderExport } from "@/lib/export";
import {
  AppError,
  acceptedFindings,
  completeCheck,
  createCheck,
  failCheck,
  failedAfterDone,
  findingsForCheck,
  latestDoneCheck,
  saveDraft,
  setDecision,
  submitReview,
} from "@/lib/repo";
import { FULL_DRAFT, T1, T2, freshDb } from "../helpers/db";

const stats = { model: "m", durationMs: 1, inputTokens: 1, outputTokens: 1, costUsd: 0, numTurns: 1 };

const tableRows = (db: Db) => ({
  checks: db.prepare("SELECT * FROM checks ORDER BY id").all(),
  findings: db.prepare("SELECT * FROM findings ORDER BY id").all(),
});

async function collect(db: Db, sessionId: string, provider: CheckProvider) {
  const events: CheckStreamEvent[] = [];
  await runCheck(db, sessionId, (e) => events.push(e), { provider });
  return events;
}

async function rejectsWith(promise: Promise<unknown>, status: number) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(AppError);
  expect((error as AppError).status).toBe(status);
}

/** Task 1 as the reviewer's repro: check B, accept two findings, fill the rubric, submit. */
async function submittedTask1(db: Db) {
  const events = await collect(db, T1.b, new FakeProvider());
  const done = events.at(-1);
  if (done?.type !== "done") throw new Error("check did not finish");
  for (const f of done.findings) {
    if (f.claim.startsWith("I've fixed the flaky test!") || f.claim === "All tests pass now.") setDecision(db, f.id, "accepted");
  }
  saveDraft(db, T1.slug, FULL_DRAFT);
  submitReview(db, T1.slug);
}

describe("a submitted review locks claim checks", () => {
  it("runCheck on the seeded, submitted Task 2 is a 409 and writes nothing", async () => {
    const db = freshDb();
    const before = tableRows(db);
    await rejectsWith(collect(db, T2.b, new FakeProvider()), 409);
    expect(() => createCheck(db, T2.a, "fake")).toThrow("This review is submitted and locked.");
    expect(tableRows(db)).toEqual(before);
  });

  it("a refused check leaves no stuck run: the same session can check again once it is a draft", async () => {
    const db = freshDb();
    await submittedTask1(db);
    await rejectsWith(collect(db, T1.b, new FakeProvider()), 409);
    // Not "already running": the first refusal released the session.
    db.prepare("UPDATE reviews SET status = 'draft' WHERE task_slug = ?").run(T1.slug);
    const events = await collect(db, T1.b, new FakeProvider());
    expect(events.at(-1)?.type).toBe("done");
  });

  it("the Task 1 export is identical after a check is tried on the locked review", async () => {
    const db = freshDb();
    await submittedTask1(db);
    const first = renderExport(gatherExport(db, T1.slug));
    expect(gatherExport(db, T1.slug).findings.B).toHaveLength(2);
    const before = tableRows(db);
    await rejectsWith(collect(db, T1.b, new FakeProvider()), 409);
    expect(tableRows(db)).toEqual(before);
    expect(renderExport(gatherExport(db, T1.slug))).toBe(first);
  });

  it("completeCheck refuses to save findings once the review is submitted", () => {
    const db = freshDb();
    const checkId = createCheck(db, T1.a, "fake");
    saveDraft(db, T1.slug, FULL_DRAFT);
    db.prepare("UPDATE reviews SET status = 'submitted' WHERE task_slug = ?").run(T1.slug);
    expect(() =>
      completeCheck(db, checkId, {
        mode: "fake",
        stats,
        trace: [],
        findings: [{ claim: "x", topic: "tests", verdict: "supported", evidence: ["t1"], reason: "r" }],
        dropped: [],
      }),
    ).toThrow(AppError);
    expect(findingsForCheck(db, checkId)).toEqual([]);
  });
});

describe("submit waits for a running check", () => {
  it("answers 409 while a check of the task runs, then submits once it finishes", async () => {
    const db = freshDb();
    saveDraft(db, T1.slug, FULL_DRAFT);
    let release!: () => void;
    const slow: CheckProvider = {
      mode: "fake",
      run: () => new Promise((resolve) => (release = () => resolve({ raw: { findings: [] }, stats }))),
    };
    const run = runCheck(db, T1.a, () => undefined, { provider: slow });
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    try {
      submitReview(db, T1.slug);
      throw new Error("expected a 409");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).status).toBe(409);
      expect((error as AppError).message).toMatch(/still running/);
    }
    expect(db.prepare("SELECT status FROM reviews WHERE task_slug = ?").get(T1.slug)).toEqual({ status: "draft" });
    release();
    await run;
    expect(submitReview(db, T1.slug).status).toBe("submitted");
  });

  it("a check left running by a stopped server is marked failed on reopen, so Submit is not blocked", () => {
    const dir = mkdtempSync(join(tmpdir(), "asr-lock-"));
    try {
      const file = join(dir, "app.db");
      const db = openDb(file);
      createCheck(db, T1.a, "live");
      saveDraft(db, T1.slug, FULL_DRAFT);
      db.close();
      const reopened = openDb(file);
      expect(failedAfterDone(reopened, T1.a)?.error).toBe("The server stopped before this check finished.");
      expect(submitReview(reopened, T1.slug).status).toBe("submitted");
      reopened.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("a failed re-check keeps the last done check", () => {
  it("acceptedFindings and the export still list the reviewer's accepted finding", () => {
    const db = freshDb();
    const doneId = createCheck(db, T1.b, "replay");
    completeCheck(db, doneId, {
      mode: "replay",
      stats,
      trace: [],
      findings: [
        { claim: "All tests pass now.", topic: "tests", verdict: "unsupported", evidence: ["t3"], reason: "The last run is t3." },
        { claim: "I added retries", topic: "change", verdict: "supported", evidence: ["t5"], reason: "t5 adds retry: 3." },
      ],
      dropped: [],
    });
    const [pass] = findingsForCheck(db, doneId);
    setDecision(db, pass!.id, "accepted");

    const failedId = createCheck(db, T1.b, "live");
    failCheck(db, failedId, "The check did not finish: API overloaded", []);

    expect(latestDoneCheck(db, T1.b)?.id).toBe(doneId);
    expect(failedAfterDone(db, T1.b)?.id).toBe(failedId);
    expect(acceptedFindings(db, T1.b).map((f) => f.claim)).toEqual(["All tests pass now."]);

    saveDraft(db, T1.slug, FULL_DRAFT);
    submitReview(db, T1.slug);
    expect(renderExport(gatherExport(db, T1.slug))).toContain('- Agent B: "All tests pass now." - Unsupported (t3). The last run is t3.');
  });

  it("a later done check clears the failure", async () => {
    const db = freshDb();
    const failedId = createCheck(db, T1.b, "live");
    failCheck(db, failedId, "boom", []);
    expect(failedAfterDone(db, T1.b)?.id).toBe(failedId);
    expect(latestDoneCheck(db, T1.b)).toBeNull();
    await collect(db, T1.b, new FakeProvider());
    expect(failedAfterDone(db, T1.b)).toBeNull();
    expect(latestDoneCheck(db, T1.b)?.status).toBe("done");
  });
});
