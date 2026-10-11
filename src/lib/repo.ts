import type { Db } from "./db";
import { missingForSubmit } from "./review-rules";
import {
  Turn,
  type CheckRecord,
  type Decision,
  type DroppedFinding,
  type Finding,
  type Interrupt,
  type ProviderMode,
  type Review,
  type ReviewDraft,
  type RunStats,
  type SessionLabel,
  type Topic,
  type TraceEvent,
  type Verdict,
} from "./types";

export class AppError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface TaskMeta {
  slug: string;
  title: string;
  repo: string;
  stack: string;
  summary: string;
}

export interface SessionData {
  id: string;
  taskSlug: string;
  label: SessionLabel;
  turns: Turn[];
}

export interface QueueItem extends TaskMeta {
  status: Review["status"];
  seeded: boolean;
  sessions: { id: string; label: SessionLabel; turns: number }[];
}

const json = <T>(text: string | null): T => JSON.parse(text ?? "null") as T;

// ---------- tasks and sessions ----------

export function listQueue(db: Db): QueueItem[] {
  const tasks = db.prepare("SELECT slug, title, repo, stack, summary FROM tasks ORDER BY position").all() as TaskMeta[];
  const sessions = db
    .prepare(
      `SELECT s.id, s.task_slug AS taskSlug, s.label, COUNT(t.turn_id) AS turns
         FROM sessions s LEFT JOIN turns t ON t.session_id = s.id
        GROUP BY s.id ORDER BY s.label`,
    )
    .all() as { id: string; taskSlug: string; label: SessionLabel; turns: number }[];
  return tasks.map((task) => {
    const review = getReview(db, task.slug);
    return {
      ...task,
      status: review.status,
      seeded: review.seeded,
      sessions: sessions.filter((s) => s.taskSlug === task.slug).map(({ id, label, turns }) => ({ id, label, turns })),
    };
  });
}

export function getTask(db: Db, slug: string): TaskMeta {
  const task = db.prepare("SELECT slug, title, repo, stack, summary FROM tasks WHERE slug = ?").get(slug) as
    | TaskMeta
    | undefined;
  if (!task) throw new AppError(404, `No task ${slug}`);
  return task;
}

export function getSession(db: Db, id: string): SessionData {
  const row = db.prepare("SELECT id, task_slug AS taskSlug, label FROM sessions WHERE id = ?").get(id) as
    | Omit<SessionData, "turns">
    | undefined;
  if (!row) throw new AppError(404, `No session ${id}`);
  const turns = (
    db.prepare("SELECT body FROM turns WHERE session_id = ? ORDER BY position").all(id) as { body: string }[]
  ).map((r) => Turn.parse(JSON.parse(r.body)));
  return { ...row, turns };
}

export function getTaskSessions(db: Db, slug: string): SessionData[] {
  const ids = db.prepare("SELECT id FROM sessions WHERE task_slug = ? ORDER BY label").all(slug) as { id: string }[];
  return ids.map(({ id }) => getSession(db, id));
}

// ---------- interrupts ----------

export function getInterrupt(db: Db, sessionId: string): Interrupt | null {
  const row = db
    .prepare("SELECT session_id AS sessionId, turn_id AS turnId, note, created_at AS createdAt FROM interrupts WHERE session_id = ?")
    .get(sessionId) as Interrupt | undefined;
  return row ?? null;
}

export function setInterrupt(db: Db, sessionId: string, turnId: string, note: string): Interrupt {
  const session = getSession(db, sessionId);
  assertUnlocked(db, session.taskSlug);
  if (!session.turns.some((t) => t.id === turnId)) throw new AppError(400, `${sessionId} has no turn ${turnId}`);
  const existing = getInterrupt(db, sessionId);
  if (existing) throw new AppError(409, `This session already has an interrupt on ${existing.turnId}. Clear it first.`);
  const createdAt = new Date().toISOString();
  db.prepare("INSERT INTO interrupts (session_id, turn_id, note, created_at) VALUES (?, ?, ?, ?)").run(
    sessionId,
    turnId,
    note,
    createdAt,
  );
  return { sessionId, turnId, note, createdAt };
}

export function clearInterrupt(db: Db, sessionId: string): void {
  const session = getSession(db, sessionId);
  assertUnlocked(db, session.taskSlug);
  db.prepare("DELETE FROM interrupts WHERE session_id = ?").run(sessionId);
}

// ---------- checks and findings ----------

interface CheckRow {
  id: number;
  sessionId: string;
  mode: ProviderMode;
  status: CheckRecord["status"];
  startedAt: string;
  stats: string | null;
  trace: string;
  dropped: string;
  error: string | null;
}

const CHECK_COLUMNS =
  "id, session_id AS sessionId, mode, status, started_at AS startedAt, stats, trace, dropped, error";

function toCheck(row: CheckRow): CheckRecord {
  return {
    ...row,
    stats: json<RunStats | null>(row.stats),
    trace: json<TraceEvent[]>(row.trace),
    dropped: json<DroppedFinding[]>(row.dropped),
  };
}

export function createCheck(db: Db, sessionId: string, mode: ProviderMode): number {
  getSession(db, sessionId);
  const info = db
    .prepare("INSERT INTO checks (session_id, mode, status, started_at) VALUES (?, ?, 'running', ?)")
    .run(sessionId, mode, new Date().toISOString());
  return Number(info.lastInsertRowid);
}

export interface NewFinding {
  claim: string;
  topic: Topic;
  verdict: Verdict;
  evidence: string[];
  reason: string;
}

export function completeCheck(
  db: Db,
  checkId: number,
  result: { mode: ProviderMode; stats: RunStats; trace: TraceEvent[]; findings: NewFinding[]; dropped: DroppedFinding[] },
): void {
  const check = db.prepare("SELECT session_id AS sessionId FROM checks WHERE id = ?").get(checkId) as
    | { sessionId: string }
    | undefined;
  if (!check) throw new AppError(404, `No check ${checkId}`);
  const insert = db.prepare(
    `INSERT INTO findings (check_id, session_id, position, claim, topic, verdict, evidence, reason)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  db.transaction(() => {
    result.findings.forEach((f, i) => {
      insert.run(checkId, check.sessionId, i, f.claim, f.topic, f.verdict, JSON.stringify(f.evidence), f.reason);
    });
    db.prepare("UPDATE checks SET status = 'done', mode = ?, stats = ?, trace = ?, dropped = ? WHERE id = ?").run(
      result.mode,
      JSON.stringify(result.stats),
      JSON.stringify(result.trace),
      JSON.stringify(result.dropped),
      checkId,
    );
  })();
}

export function failCheck(db: Db, checkId: number, error: string, trace: TraceEvent[]): void {
  db.prepare("UPDATE checks SET status = 'error', error = ?, trace = ? WHERE id = ?").run(error, JSON.stringify(trace), checkId);
}

/** The newest finished check for a session, if any. */
export function latestCheck(db: Db, sessionId: string): CheckRecord | null {
  const row = db
    .prepare(`SELECT ${CHECK_COLUMNS} FROM checks WHERE session_id = ? AND status != 'running' ORDER BY id DESC LIMIT 1`)
    .get(sessionId) as CheckRow | undefined;
  return row ? toCheck(row) : null;
}

interface FindingRow {
  id: number;
  checkId: number;
  sessionId: string;
  claim: string;
  topic: Topic;
  verdict: Verdict;
  evidence: string;
  reason: string;
  decision: Decision;
}

const FINDING_COLUMNS =
  "id, check_id AS checkId, session_id AS sessionId, claim, topic, verdict, evidence, reason, decision";

const toFinding = (row: FindingRow): Finding => ({ ...row, evidence: json<string[]>(row.evidence) });

export function findingsForCheck(db: Db, checkId: number): Finding[] {
  return (db.prepare(`SELECT ${FINDING_COLUMNS} FROM findings WHERE check_id = ? ORDER BY position`).all(checkId) as FindingRow[]).map(
    toFinding,
  );
}

export function setDecision(db: Db, findingId: number, decision: Decision): Finding {
  const row = db.prepare(`SELECT ${FINDING_COLUMNS} FROM findings WHERE id = ?`).get(findingId) as FindingRow | undefined;
  if (!row) throw new AppError(404, `No finding ${findingId}`);
  assertUnlocked(db, getSession(db, row.sessionId).taskSlug);
  db.prepare("UPDATE findings SET decision = ? WHERE id = ?").run(decision, findingId);
  return { ...toFinding(row), decision };
}

/** Accepted findings from the latest check of a session. */
export function acceptedFindings(db: Db, sessionId: string): Finding[] {
  const check = latestCheck(db, sessionId);
  return check ? findingsForCheck(db, check.id).filter((f) => f.decision === "accepted") : [];
}

// ---------- reviews ----------

const EMPTY_DRAFT: ReviewDraft = { scores: { A: {}, B: {} }, preference: null, rationale: "", feedback: { A: "", B: "" } };

interface ReviewRow {
  scores: string;
  preference: number | null;
  rationale: string;
  feedback: string;
  status: "draft" | "submitted";
  submittedAt: string | null;
  seeded: number;
}

export function getReview(db: Db, slug: string): Review {
  const row = db
    .prepare(
      "SELECT scores, preference, rationale, feedback, status, submitted_at AS submittedAt, seeded FROM reviews WHERE task_slug = ?",
    )
    .get(slug) as ReviewRow | undefined;
  if (!row) return { ...structuredClone(EMPTY_DRAFT), taskSlug: slug, status: "not_started", submittedAt: null, seeded: false };
  return {
    taskSlug: slug,
    scores: json(row.scores),
    preference: row.preference,
    rationale: row.rationale,
    feedback: json(row.feedback),
    status: row.status,
    submittedAt: row.submittedAt,
    seeded: row.seeded === 1,
  };
}

function assertUnlocked(db: Db, slug: string): void {
  if (getReview(db, slug).status === "submitted") throw new AppError(409, "This review is submitted and locked.");
}

export function saveDraft(db: Db, slug: string, draft: ReviewDraft): Review {
  getTask(db, slug);
  assertUnlocked(db, slug);
  db.prepare(
    `INSERT INTO reviews (task_slug, scores, preference, rationale, feedback, status)
     VALUES (?, ?, ?, ?, ?, 'draft')
     ON CONFLICT (task_slug) DO UPDATE SET scores = excluded.scores, preference = excluded.preference,
       rationale = excluded.rationale, feedback = excluded.feedback`,
  ).run(slug, JSON.stringify(draft.scores), draft.preference, draft.rationale, JSON.stringify(draft.feedback));
  return getReview(db, slug);
}

export function submitReview(db: Db, slug: string): Review {
  getTask(db, slug);
  assertUnlocked(db, slug);
  const review = getReview(db, slug);
  const missing = missingForSubmit(review);
  if (missing.length > 0) throw new AppError(422, `Still needed: ${missing.join(", ")}.`);
  db.prepare("UPDATE reviews SET status = 'submitted', submitted_at = ? WHERE task_slug = ?").run(new Date().toISOString(), slug);
  return getReview(db, slug);
}

export { missingForSubmit };
