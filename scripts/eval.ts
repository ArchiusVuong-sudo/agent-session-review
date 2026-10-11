/**
 * Scores the claim check against hand-labelled verdicts in data/evals/claims.json.
 *
 *   npm run eval            # the recorded live runs in fixtures/checks (no network)
 *   LIVE=1 npm run eval     # fresh live runs on the local login
 */
import { LiveProvider } from "../src/lib/checker/live";
import { loadFixture } from "../src/lib/checker/replay";
import { groundFindings } from "../src/lib/checker/validator";
import { openDb } from "../src/lib/db";
import { loadEvalLabels, scoreSession, summarize, type SessionEval } from "../src/lib/eval";
import { getSession } from "../src/lib/repo";
import type { RunStats } from "../src/lib/types";

const pct = (x: number) => `${Math.round(x * 100)}%`;

async function main(): Promise<void> {
  const live = process.env.LIVE === "1";
  const db = openDb(":memory:");
  const labels = loadEvalLabels();
  const ids = [...new Set(labels.map((l) => l.sessionId))];
  const evals: SessionEval[] = [];
  const stats: RunStats[] = [];

  for (const id of ids) {
    const session = getSession(db, id);
    const run = live
      ? await new LiveProvider().run({ sessionId: id, sessionLabel: session.label, loadTurns: () => session.turns }, () => undefined)
      : (() => {
          const f = loadFixture(id);
          return { raw: f.raw, stats: f.stats };
        })();
    stats.push(run.stats);
    const grounded = groundFindings(run.raw, session.turns);
    evals.push(scoreSession(id, labels, grounded.kept, grounded.dropped.length));
  }

  console.log(`Claim check eval (${live ? "live runs" : "recorded live runs"})\n`);
  console.log("| Session | Labelled claims | Found | Right verdict | Findings kept | Dropped | Time | Cost |");
  console.log("| --- | --- | --- | --- | --- | --- | --- | --- |");
  evals.forEach((e, i) => {
    const found = e.results.filter((r) => r.found).length;
    const right = e.results.filter((r) => r.correct).length;
    const s = stats[i]!;
    console.log(
      `| ${e.sessionId} | ${e.results.length} | ${found} | ${right} | ${e.kept} | ${e.dropped} | ${(s.durationMs / 1000).toFixed(1)} s | $${s.costUsd.toFixed(3)} |`,
    );
  });
  const sum = summarize(evals);
  const totalMs = stats.reduce((n, s) => n + s.durationMs, 0);
  const totalCost = stats.reduce((n, s) => n + s.costUsd, 0);
  console.log(
    `\nCoverage ${sum.covered}/${sum.labels} (${pct(sum.coverage)}), right verdict ${sum.correct}/${sum.labels} (${pct(sum.accuracy)}), ` +
      `${sum.dropped} dropped by grounding, ${(totalMs / 1000).toFixed(1)} s and $${totalCost.toFixed(2)} for ${ids.length} runs (${stats[0]?.model}).`,
  );
  for (const e of evals) {
    for (const r of e.results.filter((x) => !x.correct)) {
      console.log(`  miss ${e.sessionId}: "${r.label.claim}" expected ${r.label.verdicts.join("|")}, got ${r.found?.verdict ?? "no finding"}`);
    }
  }
  if (process.env.EVAL_MIN && sum.accuracy < Number(process.env.EVAL_MIN)) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
