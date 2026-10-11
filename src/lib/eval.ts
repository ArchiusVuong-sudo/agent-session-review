import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { NewFinding } from "./repo";
import { Verdict } from "./types";

export const EvalLabel = z.object({ sessionId: z.string(), claim: z.string().min(1), verdicts: z.array(Verdict).min(1) });
export type EvalLabel = z.infer<typeof EvalLabel>;

export function loadEvalLabels(dir = join(process.cwd(), "data")): EvalLabel[] {
  return z.object({ labels: z.array(EvalLabel) }).parse(JSON.parse(readFileSync(join(dir, "evals/claims.json"), "utf8"))).labels;
}

const norm = (text: string) => text.toLowerCase().replace(/\s+/g, " ").trim();

/** A finding covers a label when one quote contains the other. */
export function matches(label: string, claim: string): boolean {
  const a = norm(label);
  const b = norm(claim);
  return a.includes(b) || b.includes(a);
}

export interface LabelResult {
  label: EvalLabel;
  found: NewFinding | null;
  correct: boolean;
}

export interface SessionEval {
  sessionId: string;
  results: LabelResult[];
  kept: number;
  dropped: number;
}

export function scoreSession(sessionId: string, labels: readonly EvalLabel[], kept: readonly NewFinding[], dropped: number): SessionEval {
  const results = labels
    .filter((l) => l.sessionId === sessionId)
    .map((label) => {
      const found = kept.find((f) => matches(label.claim, f.claim)) ?? null;
      return { label, found, correct: found !== null && label.verdicts.includes(found.verdict) };
    });
  return { sessionId, results, kept: kept.length, dropped };
}

export interface EvalSummary {
  labels: number;
  covered: number;
  correct: number;
  /** Share of labelled claims the check found at all. */
  coverage: number;
  /** Share of labelled claims found with an accepted verdict. */
  accuracy: number;
  dropped: number;
}

export function summarize(sessions: readonly SessionEval[]): EvalSummary {
  const all = sessions.flatMap((s) => s.results);
  const covered = all.filter((r) => r.found).length;
  const correct = all.filter((r) => r.correct).length;
  return {
    labels: all.length,
    covered,
    correct,
    coverage: all.length ? covered / all.length : 0,
    accuracy: all.length ? correct / all.length : 0,
    dropped: sessions.reduce((n, s) => n + s.dropped, 0),
  };
}
