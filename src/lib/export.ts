import type { Rubric } from "./data/load";
import { loadRubric } from "./data/load";
import type { Db } from "./db";
import { AppError, acceptedFindings, getInterrupt, getReview, getTask, getTaskSessions, type TaskMeta } from "./repo";
import type { Finding, Interrupt, Review, SessionLabel } from "./types";

import { SYNTHETIC_LABEL } from "./labels";

export { SYNTHETIC_LABEL };

export interface ExportData {
  task: TaskMeta;
  review: Review;
  rubric: Rubric;
  interrupts: Partial<Record<SessionLabel, Interrupt>>;
  findings: Record<SessionLabel, Finding[]>;
}

const VERDICT_WORD = { supported: "Supported", unsupported: "Unsupported", contradicted: "Contradicted" } as const;

const oneLine = (text: string) => text.replace(/\s+/g, " ").trim();
const cell = (text: string) => oneLine(text).replaceAll("|", "\\|");

export function exportFileName(slug: string): string {
  return `review-${slug}.md`;
}

/** The written review as Markdown. Pure: everything it prints is in `data`. */
export function renderExport(data: ExportData): string {
  const { task, review, rubric } = data;
  const lines: string[] = [];
  lines.push(`# Review: ${task.title}`, "");
  lines.push(`> ${SYNTHETIC_LABEL}.`, "");
  lines.push(`- Repo: ${task.repo} (${task.stack})`);
  lines.push(`- Status: ${review.status === "submitted" ? `submitted ${review.submittedAt?.slice(0, 10) ?? ""}`.trim() : review.status}`);
  lines.push("- Scores and feedback are the reviewer's own. The claim check only collected evidence.", "");

  lines.push("## Scores", "", "| Dimension | A | B |", "| --- | --- | --- |");
  for (const dim of rubric.dimensions) {
    const a = review.scores.A[dim.id] ?? "-";
    const b = review.scores.B[dim.id] ?? "-";
    lines.push(`| ${cell(dim.name)} | ${a} | ${b} |`);
  }
  lines.push("");

  lines.push("## Preference", "");
  lines.push(`**${review.preference ? rubric.preference[review.preference - 1] : "Not set"}**`, "");
  if (review.rationale.trim()) lines.push(review.rationale.trim(), "");

  lines.push("## Interrupts", "");
  const interrupts = (["A", "B"] as const).filter((l) => data.interrupts[l]);
  if (interrupts.length === 0) lines.push("None.", "");
  for (const label of interrupts) {
    const pin = data.interrupts[label]!;
    lines.push(`- Agent ${label}, ${pin.turnId}: ${oneLine(pin.note)}`);
  }
  if (interrupts.length > 0) lines.push("");

  lines.push("## Accepted findings", "");
  const any = data.findings.A.length + data.findings.B.length > 0;
  if (!any) lines.push("None.", "");
  for (const label of ["A", "B"] as const) {
    for (const f of data.findings[label]) {
      lines.push(`- Agent ${label}: "${oneLine(f.claim)}" - ${VERDICT_WORD[f.verdict]} (${f.evidence.join(", ")}). ${oneLine(f.reason)}`);
    }
  }
  if (any) lines.push("");

  lines.push("## Feedback", "");
  for (const label of ["A", "B"] as const) {
    lines.push(`### Agent ${label}`, "", review.feedback[label].trim() || "No feedback written.", "");
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

export function gatherExport(db: Db, slug: string): ExportData {
  const task = getTask(db, slug);
  const review = getReview(db, slug);
  if (review.status !== "submitted") throw new AppError(409, "Submit the review before exporting it.");
  const sessions = getTaskSessions(db, slug);
  const interrupts: ExportData["interrupts"] = {};
  const findings: ExportData["findings"] = { A: [], B: [] };
  for (const s of sessions) {
    const pin = getInterrupt(db, s.id);
    if (pin) interrupts[s.label] = pin;
    findings[s.label] = acceptedFindings(db, s.id);
  }
  return { task, review, rubric: loadRubric(), interrupts, findings };
}
