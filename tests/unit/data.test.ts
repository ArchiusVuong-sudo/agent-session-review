import { describe, expect, it } from "vitest";
import { loadRubric, loadSeedReviews, loadTasks } from "@/lib/data/load";
import { lintFeedback } from "@/lib/lint";

describe("seed data", () => {
  const tasks = loadTasks();

  it("loads three tasks, each with sessions A and B ending on a final message", () => {
    expect(tasks.map((t) => t.slug)).toEqual(["ci-fails-scale-recipe", "watering-shift-reminder", "list-rerenders-keystroke"]);
    for (const task of tasks) {
      expect(task.sessions.map((s) => s.label)).toEqual(["A", "B"]);
      for (const s of task.sessions) expect(s.turns.at(-1)?.kind).toBe("final");
    }
  });

  it("fills Task 1 commands from the recorded fixture-repo run", () => {
    const [a, b] = tasks[0]!.sessions;
    const t3 = a.turns[2]!;
    expect(t3).toMatchObject({ kind: "command", command: "npx vitest run --sequence.shuffle --sequence.seed=4817", exitCode: 1 });
    expect(t3.kind === "command" && t3.output).toContain("expected 8 to be 4");
    expect(b.turns[2]).toMatchObject({ kind: "command", command: "npx vitest run -t scaleRecipe", exitCode: 0 });
  });

  it("has six rubric dimensions with written anchors and a 7-point preference", () => {
    const rubric = loadRubric();
    expect(rubric.dimensions.map((d) => d.id)).toEqual(["makes_sense", "reasoning", "judgment", "guiding", "trust", "overall"]);
    expect(rubric.dimensions.find((d) => d.id === "trust")!.anchors["2"]).toBe(
      "Claims results the session does not show, or hides a skipped step.",
    );
    expect(rubric.preference[0]).toBe("A much better");
    expect(rubric.preference[6]).toBe("B much better");
  });

  it("ships a complete Task 2 example review whose feedback passes the lint and cites turns", () => {
    const [seed] = loadSeedReviews();
    expect(seed!.taskSlug).toBe("watering-shift-reminder");
    expect(Object.keys(seed!.scores.A)).toHaveLength(6);
    expect(Object.keys(seed!.scores.B)).toHaveLength(6);
    expect(lintFeedback(seed!.feedback.A).pass).toBe(true);
    expect(lintFeedback(seed!.feedback.B).pass).toBe(true);
    expect(seed!.rationale).toMatch(/\bt\d+\b/);
  });
});
