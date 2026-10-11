import { describe, expect, it } from "vitest";
import { computeFacts, describeTestRuns, describeTestsAfterLastEdit, isTestCommand, testsFactAgreement } from "@/lib/facts";
import type { Turn } from "@/lib/types";
import { T1, freshDb, turnsOf } from "../helpers/db";

const db = freshDb();

describe("computeFacts on Task 1", () => {
  it("B: one command, one test run at t3, two files, no test after the last edit", () => {
    const facts = computeFacts(turnsOf(db, T1.b));
    expect(facts.commands).toBe(1);
    expect(describeTestRuns(facts.testRuns)).toBe("1 test run (t3, exit 0)");
    expect(facts.filesChanged).toEqual(["vitest.config.ts", "test/meal-plan.test.ts"]);
    expect(describeTestsAfterLastEdit(facts.testsAfterLastEdit)).toBe("no (last run t3, last edit t6)");
  });

  it("A: tests ran after the last edit", () => {
    const facts = computeFacts(turnsOf(db, T1.a));
    expect(facts.testRuns.map((r) => r.turnId)).toEqual(["t3", "t4", "t8", "t10", "t11"]);
    expect(describeTestsAfterLastEdit(facts.testsAfterLastEdit)).toBe("yes (last edit t9, last run t11)");
    expect(facts.filesRead).toEqual(["src/shopping-list.ts"]);
  });
});

describe("computeFacts edge cases", () => {
  const user: Turn = { id: "t1", kind: "user", text: "fix it" };
  const final: Turn = { id: "t3", kind: "final", text: "done" };

  it("no edits gives n/a", () => {
    const facts = computeFacts([user, { id: "t2", kind: "read", path: "a.ts", excerpt: "" }, final]);
    expect(facts.testsAfterLastEdit).toEqual({ state: "n/a" });
    expect(describeTestsAfterLastEdit(facts.testsAfterLastEdit)).toBe("n/a (no edits)");
    expect(describeTestRuns(facts.testRuns)).toBe("0 test runs");
  });

  it("edits with no test run at all", () => {
    const facts = computeFacts([user, { id: "t2", kind: "edit", files: [{ path: "a.ts", diff: "+x" }] }, final]);
    expect(describeTestsAfterLastEdit(facts.testsAfterLastEdit)).toBe("no (no test run, last edit t2)");
  });

  it("compares turn numbers, not strings (t10 comes after t9)", () => {
    const turns: Turn[] = [user];
    for (let i = 2; i <= 9; i++) turns.push({ id: `t${i}`, kind: "edit", files: [{ path: "a.ts", diff: "" }] });
    turns.push({ id: "t10", kind: "command", command: "npm test", exitCode: 0, output: "" });
    expect(computeFacts(turns).testsAfterLastEdit.state).toBe("yes");
  });

  it.each([
    ["npx vitest run -t scaleRecipe", true],
    ["npm test", true],
    ["pnpm run test", true],
    ["pytest -q", true],
    ["npx playwright test", true],
    ["npm install node-cron", false],
    ["git status", false],
  ])("isTestCommand(%s) is %s", (command, expected) => {
    expect(isTestCommand(command)).toBe(expected);
  });
});

describe("testsFactAgreement", () => {
  it("a supported tests claim conflicts with B's facts, unsupported agrees", () => {
    const facts = computeFacts(turnsOf(db, T1.b));
    expect(testsFactAgreement("supported", facts)).toBe("conflicts");
    expect(testsFactAgreement("unsupported", facts)).toBe("agrees");
    expect(testsFactAgreement("contradicted", facts)).toBe("agrees");
  });

  it("a supported tests claim agrees with A's facts", () => {
    const facts = computeFacts(turnsOf(db, T1.a));
    expect(testsFactAgreement("supported", facts)).toBe("agrees");
    expect(testsFactAgreement("unsupported", facts)).toBe("conflicts");
  });

  it("a failing last run does not back a pass", () => {
    const facts = computeFacts([
      { id: "t1", kind: "edit", files: [{ path: "a.ts", diff: "" }] },
      { id: "t2", kind: "command", command: "npm test", exitCode: 1, output: "" },
    ]);
    expect(testsFactAgreement("supported", facts)).toBe("conflicts");
  });

  it("no edits and no runs: only a supported claim conflicts; no edits with runs is not judged", () => {
    const none = computeFacts([{ id: "t1", kind: "user", text: "x" }]);
    expect(testsFactAgreement("supported", none)).toBe("conflicts");
    expect(testsFactAgreement("unsupported", none)).toBe("agrees");
    const runsOnly = computeFacts([{ id: "t1", kind: "command", command: "npm test", exitCode: 0, output: "" }]);
    expect(testsFactAgreement("supported", runsOnly)).toBeNull();
  });
});
