import type { Turn } from "./types";

const TEST_COMMAND = /\b(vitest|jest|mocha|pytest|playwright test|(npm|pnpm|yarn|bun)( run)? test)\b/;

export function isTestCommand(command: string): boolean {
  return TEST_COMMAND.test(command);
}

export interface TestRun {
  turnId: string;
  exitCode: number;
}

export type TestsAfterLastEdit =
  | { state: "yes"; lastEdit: string; lastRun: string }
  | { state: "no"; lastEdit: string; lastRun: string | null }
  | { state: "n/a" };

export interface SessionFacts {
  commands: number;
  testRuns: TestRun[];
  filesChanged: string[];
  filesRead: string[];
  testsAfterLastEdit: TestsAfterLastEdit;
}

const turnNumber = (id: string) => Number(id.slice(1));

/** Facts computed from the turns alone: what the session did, not what it says it did. */
export function computeFacts(turns: readonly Turn[]): SessionFacts {
  let commands = 0;
  const testRuns: TestRun[] = [];
  const changed = new Set<string>();
  const read = new Set<string>();
  let lastEdit: string | null = null;

  for (const turn of turns) {
    if (turn.kind === "command") {
      commands++;
      if (isTestCommand(turn.command)) testRuns.push({ turnId: turn.id, exitCode: turn.exitCode });
    } else if (turn.kind === "edit") {
      for (const file of turn.files) changed.add(file.path);
      lastEdit = turn.id;
    } else if (turn.kind === "read") {
      read.add(turn.path);
    }
  }

  const lastRun = testRuns.at(-1)?.turnId ?? null;
  let testsAfterLastEdit: TestsAfterLastEdit;
  if (lastEdit === null) testsAfterLastEdit = { state: "n/a" };
  else if (lastRun !== null && turnNumber(lastRun) > turnNumber(lastEdit)) {
    testsAfterLastEdit = { state: "yes", lastEdit, lastRun };
  } else testsAfterLastEdit = { state: "no", lastEdit, lastRun };

  return { commands, testRuns, filesChanged: [...changed], filesRead: [...read], testsAfterLastEdit };
}

export function plural(n: number, word: string, many = `${word}s`): string {
  return `${n} ${n === 1 ? word : many}`;
}

export function describeTestRuns(runs: readonly TestRun[]): string {
  if (runs.length === 0) return "0 test runs";
  const list = runs.map((r) => `${r.turnId}, exit ${r.exitCode}`).join("; ");
  return `${plural(runs.length, "test run")} (${list})`;
}

export function describeTestsAfterLastEdit(value: TestsAfterLastEdit): string {
  switch (value.state) {
    case "yes":
      return `yes (last edit ${value.lastEdit}, last run ${value.lastRun})`;
    case "no":
      return value.lastRun
        ? `no (last run ${value.lastRun}, last edit ${value.lastEdit})`
        : `no (no test run, last edit ${value.lastEdit})`;
    case "n/a":
      return "n/a (no edits)";
  }
}

/** Does a verdict on a claim about tests line up with the facts strip? */
export function testsFactAgreement(
  verdict: "supported" | "unsupported" | "contradicted",
  facts: SessionFacts,
): "agrees" | "conflicts" | null {
  const state = facts.testsAfterLastEdit.state;
  if (state === "n/a" && facts.testRuns.length === 0) return verdict === "supported" ? "conflicts" : "agrees";
  if (state === "n/a") return null;
  const backed = state === "yes" && facts.testRuns.at(-1)?.exitCode === 0;
  return (verdict === "supported") === backed ? "agrees" : "conflicts";
}
