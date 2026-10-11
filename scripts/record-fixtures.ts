/**
 * Records live check runs into fixtures/checks/<session>.json for replay mode.
 *
 *   npm run record                      # every session
 *   npm run record -- <session-id> ...  # only these
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { openDb } from "../src/lib/db";
import { LiveProvider } from "../src/lib/checker/live";
import { FIXTURE_DIR, fixturePath } from "../src/lib/checker/replay";
import type { Fixture } from "../src/lib/checker/provider";
import { groundFindings } from "../src/lib/checker/validator";
import { getSession } from "../src/lib/repo";
import type { TraceEvent } from "../src/lib/types";

async function record(sessionId: string, db: ReturnType<typeof openDb>): Promise<void> {
  const session = getSession(db, sessionId);
  const events: Fixture["events"] = [];
  const onTrace = (event: TraceEvent) => {
    if (event.type === "tool") events.push({ atMs: event.at, name: event.name, args: event.args, ms: event.ms });
    if (event.type === "note") console.log(`  ${event.text}`);
  };
  const output = await new LiveProvider().run(
    { sessionId, sessionLabel: session.label, loadTurns: () => getSession(db, sessionId).turns },
    onTrace,
  );
  const fixture: Fixture = {
    sessionId,
    recordedAt: new Date().toISOString(),
    model: output.stats.model,
    events,
    raw: output.raw,
    stats: output.stats,
  };
  writeFileSync(fixturePath(sessionId), `${JSON.stringify(fixture, null, 2)}\n`);
  const grounded = groundFindings(output.raw, session.turns);
  console.log(
    `${sessionId}: ${events.length} tool calls, ${(output.stats.durationMs / 1000).toFixed(1)} s, ` +
      `${grounded.kept.length} kept, ${grounded.dropped.length} dropped`,
  );
  for (const f of grounded.kept) console.log(`  [${f.verdict}] "${f.claim}" ${f.evidence.join(",")}`);
  for (const d of grounded.dropped) console.log(`  [dropped] "${d.claim}": ${d.reason}`);
}

async function main(): Promise<void> {
  mkdirSync(FIXTURE_DIR, { recursive: true });
  const db = openDb(":memory:");
  const all = (db.prepare("SELECT id FROM sessions ORDER BY task_slug, label").all() as { id: string }[]).map((r) => r.id);
  const wanted = process.argv.slice(2);
  const ids = wanted.length > 0 ? wanted : all;
  for (const id of ids) {
    if (!all.includes(id)) throw new Error(`Unknown session ${id}. Known: ${all.join(", ")}`);
    await record(id, db);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
