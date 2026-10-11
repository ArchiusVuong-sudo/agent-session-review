import { describe, expect, it } from "vitest";
import { exportFileName, gatherExport, renderExport, SYNTHETIC_LABEL } from "@/lib/export";
import { parseMarkdown } from "@/lib/md/render";
import { AppError, completeCheck, createCheck, findingsForCheck, saveDraft, setDecision, setInterrupt, submitReview } from "@/lib/repo";
import { FULL_DRAFT, T1, T2, freshDb } from "../helpers/db";

const stats = { model: "m", durationMs: 1, inputTokens: 1, outputTokens: 1, costUsd: 0, numTurns: 1 };

function submittedTask1() {
  const db = freshDb();
  setInterrupt(db, T1.b, "t4", "Stop. You haven't reproduced it yet.");
  const checkId = createCheck(db, T1.b, "replay");
  completeCheck(db, checkId, {
    mode: "replay",
    stats,
    trace: [],
    findings: [
      { claim: "All tests pass now.", topic: "tests", verdict: "unsupported", evidence: ["t3", "t6"], reason: "The last run is t3." },
      { claim: "I added retries", topic: "change", verdict: "supported", evidence: ["t5"], reason: "t5 adds retry: 3." },
    ],
    dropped: [],
  });
  const [pass, retries] = findingsForCheck(db, checkId);
  setDecision(db, pass!.id, "accepted");
  setDecision(db, retries!.id, "rejected");
  saveDraft(db, T1.slug, FULL_DRAFT);
  submitReview(db, T1.slug);
  return db;
}

describe("export", () => {
  it("renders task, scores table, preference, interrupt, accepted findings, feedback and the synthetic label", () => {
    const md = renderExport(gatherExport(submittedTask1(), T1.slug));
    expect(md).toContain("# Review: CI fails on scaleRecipe, passes locally");
    expect(md).toContain(`> ${SYNTHETIC_LABEL}.`);
    expect(md).toContain("| Dimension | A | B |");
    expect(md).toContain("| Trust | 4 | 1 |");
    expect(md).toContain("| Overall | 5 | 1 |");
    expect(md).toContain("**A much better**");
    expect(md).toContain(FULL_DRAFT.rationale);
    expect(md).toContain("- Agent B, t4: Stop. You haven't reproduced it yet.");
    expect(md).toContain('- Agent B: "All tests pass now." - Unsupported (t3, t6). The last run is t3.');
    expect(md).not.toContain("I added retries");
    expect(md).toContain("### Agent A\n\nA reproduces first (t3).");
    expect(md).toContain("### Agent B\n\nB adds retries (t5).");
  });

  it("exports the seeded Task 2 example the same way, with no findings", () => {
    const md = renderExport(gatherExport(freshDb(), T2.slug));
    expect(md).toContain("# Review: Reminder email the evening before a watering shift");
    expect(md).toContain("| Makes sense | 5 | 3 |");
    expect(md).toContain("## Accepted findings\n\nNone.");
    expect(md).toContain("## Interrupts\n\nNone.");
    expect(md).toContain(SYNTHETIC_LABEL);
  });

  it("refuses a review that is not submitted", () => {
    expect(() => gatherExport(freshDb(), T1.slug)).toThrow(AppError);
  });

  it("escapes pipes in table cells and names the file by slug", () => {
    const data = gatherExport(freshDb(), T2.slug);
    data.rubric = { ...data.rubric, dimensions: data.rubric.dimensions.map((d, i) => (i === 0 ? { ...d, name: "A | B" } : d)) };
    expect(renderExport(data)).toContain("| A \\| B | 5 | 3 |");
    expect(exportFileName("ci-fails-scale-recipe")).toBe("review-ci-fails-scale-recipe.md");
  });

  it("parses back into the blocks the preview shows", () => {
    const blocks = parseMarkdown(renderExport(gatherExport(submittedTask1(), T1.slug)));
    const table = blocks.find((b) => b.kind === "table");
    expect(table?.kind === "table" && table.head).toEqual(["Dimension", "A", "B"]);
    expect(table?.kind === "table" && table.rows).toHaveLength(6);
    expect(blocks.filter((b) => b.kind === "heading").map((b) => (b.kind === "heading" ? b.text : ""))).toEqual([
      "Review: CI fails on scaleRecipe, passes locally",
      "Scores",
      "Preference",
      "Interrupts",
      "Accepted findings",
      "Feedback",
      "Agent A",
      "Agent B",
    ]);
  });
});
