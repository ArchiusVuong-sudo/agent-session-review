import { z } from "zod";
import type { ProviderMode, RunStats, TraceEvent, Turn } from "../types";

export interface CheckInput {
  sessionId: string;
  sessionLabel: string;
  /** Reads the session's turns (from SQLite in the app). Called by the tools on every call. */
  loadTurns: () => Turn[];
  signal?: AbortSignal;
}

export interface CheckRunOutput {
  /** The structured output exactly as the model returned it. The caller validates it. */
  raw: unknown;
  stats: RunStats;
}

/** One interface, two implementations: the live SDK agent and recorded replays. */
export interface CheckProvider {
  readonly mode: ProviderMode;
  run(input: CheckInput, emit: (event: TraceEvent) => void): Promise<CheckRunOutput>;
}

/** A recorded live run, saved by scripts/record-fixtures.ts. */
export const Fixture = z.object({
  sessionId: z.string(),
  recordedAt: z.string(),
  model: z.string(),
  events: z.array(
    z.object({
      atMs: z.number().nonnegative(),
      name: z.string(),
      args: z.record(z.string(), z.unknown()),
      ms: z.number().nonnegative(),
    }),
  ),
  raw: z.unknown(),
  stats: z.object({
    model: z.string(),
    durationMs: z.number(),
    inputTokens: z.number(),
    outputTokens: z.number(),
    costUsd: z.number(),
    numTurns: z.number(),
  }),
});
export type Fixture = z.infer<typeof Fixture>;
