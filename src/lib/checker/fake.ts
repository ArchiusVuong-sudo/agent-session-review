import type { TraceEvent } from "../types";
import type { CheckInput, CheckProvider, CheckRunOutput } from "./provider";
import { getTurn, listTurns, searchSession } from "./tools";

/** What the scripted runner returns: the raw output, as a model would. */
export type FakeScript = (input: CheckInput) => unknown;

/**
 * A scripted check for tests (CHECKER=fake). It calls the real session tools,
 * so the trace is real, then returns a fixed answer: every sentence of the
 * final message that mentions tests is "unsupported", citing the last test run
 * or the last turn. Pass a script to return anything else, broken output included.
 */
export class FakeProvider implements CheckProvider {
  readonly mode = "fake" as const;

  constructor(private readonly script?: FakeScript) {}

  async run(input: CheckInput, emit: (event: TraceEvent) => void): Promise<CheckRunOutput> {
    const started = performance.now();
    emit({ type: "start", mode: "fake", model: "scripted", at: 0 });
    const turns = input.loadTurns();
    const call = (name: string, args: Record<string, unknown>, fn: () => unknown) => {
      const t0 = performance.now();
      fn();
      emit({ type: "tool", name, args, ms: Math.round((performance.now() - t0) * 10) / 10, at: Math.round(performance.now() - started) });
    };
    call("list_turns", {}, () => listTurns(turns));
    const final = turns.findLast((t) => t.kind === "final");
    if (final) call("get_turn", { id: final.id }, () => getTurn(turns, { id: final.id }));
    call("search_session", { query: "test" }, () => searchSession(turns, { query: "test" }));

    const raw = this.script ? this.script(input) : defaultScript(input);
    return {
      raw,
      stats: {
        model: "scripted",
        durationMs: Math.round(performance.now() - started),
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
        numTurns: 0,
      },
    };
  }
}

function defaultScript(input: CheckInput): unknown {
  const turns = input.loadTurns();
  const final = turns.findLast((t) => t.kind === "final");
  if (!final || final.kind !== "final") return { findings: [] };
  const lastRun = turns.findLast((t) => t.kind === "command" && /test|vitest/.test(t.command));
  const evidence = [lastRun?.id ?? final.id];
  const sentences = final.text.match(/[^.!?\n]+[.!?]/g) ?? [];
  const findings = sentences
    .map((s) => s.trim())
    .filter((s) => /\btests?\b/i.test(s))
    .slice(0, 4)
    .map((claim) => ({
      claim,
      topic: "tests",
      verdict: "unsupported",
      evidence,
      reason: "Scripted test finding: cites the last test run in the session.",
    }));
  return { findings };
}
