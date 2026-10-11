import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadSeedReviews, loadTasks } from "./data/load";

export type Db = Database.Database;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS tasks (
  slug TEXT PRIMARY KEY,
  position INTEGER NOT NULL,
  title TEXT NOT NULL,
  repo TEXT NOT NULL,
  stack TEXT NOT NULL,
  summary TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  task_slug TEXT NOT NULL REFERENCES tasks(slug),
  label TEXT NOT NULL CHECK (label IN ('A', 'B')),
  UNIQUE (task_slug, label)
);
CREATE TABLE IF NOT EXISTS turns (
  session_id TEXT NOT NULL REFERENCES sessions(id),
  turn_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  kind TEXT NOT NULL,
  body TEXT NOT NULL,
  PRIMARY KEY (session_id, turn_id)
);
CREATE TABLE IF NOT EXISTS interrupts (
  session_id TEXT PRIMARY KEY REFERENCES sessions(id),
  turn_id TEXT NOT NULL,
  note TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  mode TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running', 'done', 'error')),
  started_at TEXT NOT NULL,
  stats TEXT,
  trace TEXT NOT NULL DEFAULT '[]',
  dropped TEXT NOT NULL DEFAULT '[]',
  error TEXT
);
CREATE TABLE IF NOT EXISTS findings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  check_id INTEGER NOT NULL REFERENCES checks(id),
  session_id TEXT NOT NULL REFERENCES sessions(id),
  position INTEGER NOT NULL,
  claim TEXT NOT NULL,
  topic TEXT NOT NULL,
  verdict TEXT NOT NULL CHECK (verdict IN ('supported', 'unsupported', 'contradicted')),
  evidence TEXT NOT NULL,
  reason TEXT NOT NULL,
  decision TEXT CHECK (decision IN ('accepted', 'rejected'))
);
CREATE TABLE IF NOT EXISTS reviews (
  task_slug TEXT PRIMARY KEY REFERENCES tasks(slug),
  scores TEXT NOT NULL,
  preference INTEGER,
  rationale TEXT NOT NULL DEFAULT '',
  feedback TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'submitted')),
  submitted_at TEXT,
  seeded INTEGER NOT NULL DEFAULT 0
);
`;

export function openDb(file: string): Db {
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  seedIfEmpty(db);
  return db;
}

/** Loads data/*.json into an empty database. Existing data is never touched. */
export function seedIfEmpty(db: Db): void {
  const { n } = db.prepare("SELECT COUNT(*) AS n FROM tasks").get() as { n: number };
  if (n > 0) return;
  const tasks = loadTasks();
  const seedReviews = loadSeedReviews();
  const insertTask = db.prepare(
    "INSERT INTO tasks (slug, position, title, repo, stack, summary) VALUES (?, ?, ?, ?, ?, ?)",
  );
  const insertSession = db.prepare("INSERT INTO sessions (id, task_slug, label) VALUES (?, ?, ?)");
  const insertTurn = db.prepare(
    "INSERT INTO turns (session_id, turn_id, position, kind, body) VALUES (?, ?, ?, ?, ?)",
  );
  const insertReview = db.prepare(
    `INSERT INTO reviews (task_slug, scores, preference, rationale, feedback, status, submitted_at, seeded)
     VALUES (?, ?, ?, ?, ?, 'submitted', ?, 1)`,
  );
  db.transaction(() => {
    tasks.forEach((task, i) => {
      insertTask.run(task.slug, i + 1, task.title, task.repo, task.stack, task.summary);
      for (const session of task.sessions) {
        insertSession.run(session.id, task.slug, session.label);
        session.turns.forEach((turn, position) => {
          insertTurn.run(session.id, turn.id, position, turn.kind, JSON.stringify(turn));
        });
      }
    });
    for (const review of seedReviews) {
      insertReview.run(
        review.taskSlug,
        JSON.stringify(review.scores),
        review.preference,
        review.rationale,
        JSON.stringify(review.feedback),
        "2026-10-11T09:00:00.000Z",
      );
    }
  })();
}

export function dataDir(): string {
  return resolve(/*turbopackIgnore: true*/ process.env.DATA_DIR ?? join(process.cwd(), ".data"));
}

const globalForDb = globalThis as unknown as { __sessionReviewDb?: Db };

/** The app's database, created and seeded under DATA_DIR (default .data/) on first use. */
export function getDb(): Db {
  if (!globalForDb.__sessionReviewDb) {
    const dir = dataDir();
    mkdirSync(dir, { recursive: true });
    globalForDb.__sessionReviewDb = openDb(join(dir, "app.db"));
  }
  return globalForDb.__sessionReviewDb;
}
