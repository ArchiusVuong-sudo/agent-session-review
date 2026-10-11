import { z } from "zod";

export const TurnId = z.string().regex(/^t\d{1,3}$/, "turn ids look like t1, t2, ...");

const base = { id: TurnId };

export const FileChange = z.object({ path: z.string().min(1), diff: z.string() });

export const Turn = z.discriminatedUnion("kind", [
  z.object({ ...base, kind: z.literal("user"), text: z.string().min(1) }),
  z.object({ ...base, kind: z.literal("preamble"), text: z.string().min(1) }),
  z.object({ ...base, kind: z.literal("reasoning"), text: z.string().min(1) }),
  z.object({
    ...base,
    kind: z.literal("command"),
    command: z.string().min(1),
    exitCode: z.number().int(),
    output: z.string(),
  }),
  z.object({ ...base, kind: z.literal("read"), path: z.string().min(1), excerpt: z.string() }),
  z.object({ ...base, kind: z.literal("edit"), files: z.array(FileChange).min(1) }),
  z.object({ ...base, kind: z.literal("final"), text: z.string().min(1) }),
]);
export type Turn = z.infer<typeof Turn>;
export type TurnKind = Turn["kind"];

export const SessionLabel = z.enum(["A", "B"]);
export type SessionLabel = z.infer<typeof SessionLabel>;

export const Session = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  label: SessionLabel,
  turns: z.array(Turn).min(2),
});
export type Session = z.infer<typeof Session>;

export const Task = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string().min(1),
  repo: z.string().min(1),
  stack: z.string().min(1),
  summary: z.string().min(1),
  sessions: z.tuple([Session, Session]),
});
export type Task = z.infer<typeof Task>;

export const DimensionId = z.enum(["makes_sense", "reasoning", "judgment", "guiding", "trust", "overall"]);
export type DimensionId = z.infer<typeof DimensionId>;
export const DIMENSIONS = DimensionId.options;

export const Score = z.number().int().min(1).max(5);
export const SessionScores = z.partialRecord(DimensionId, Score);
export type SessionScores = z.infer<typeof SessionScores>;

/** 1 = A much better ... 4 = about the same ... 7 = B much better. */
export const Preference = z.number().int().min(1).max(7);

export const ReviewDraft = z.object({
  scores: z.object({ A: SessionScores, B: SessionScores }),
  preference: Preference.nullable(),
  rationale: z.string().max(4000),
  feedback: z.object({ A: z.string().max(4000), B: z.string().max(4000) }),
});
export type ReviewDraft = z.infer<typeof ReviewDraft>;

export type ReviewStatus = "not_started" | "draft" | "submitted";

export interface Review extends ReviewDraft {
  taskSlug: string;
  status: ReviewStatus;
  submittedAt: string | null;
  seeded: boolean;
}

export interface Interrupt {
  sessionId: string;
  turnId: string;
  note: string;
  createdAt: string;
}

export const Verdict = z.enum(["supported", "unsupported", "contradicted"]);
export type Verdict = z.infer<typeof Verdict>;

export const Topic = z.enum(["tests", "root_cause", "change", "performance", "reliability", "dependency", "other"]);
export type Topic = z.infer<typeof Topic>;

export type Decision = "accepted" | "rejected" | null;

export interface Finding {
  id: number;
  checkId: number;
  sessionId: string;
  claim: string;
  topic: Topic;
  verdict: Verdict;
  evidence: string[];
  reason: string;
  decision: Decision;
}

export interface DroppedFinding {
  claim: string;
  evidence: string[];
  reason: string;
}

export type TraceEvent =
  | { type: "start"; mode: ProviderMode; model: string; at: number }
  | { type: "tool"; name: string; args: Record<string, unknown>; ms: number; at: number }
  | { type: "note"; text: string; at: number };

/** live: the SDK agent. replay: a recorded live run. fake: a scripted runner for tests (CHECKER=fake). */
export type ProviderMode = "live" | "replay" | "fake";

export interface RunStats {
  model: string;
  durationMs: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  numTurns: number;
}

export interface CheckRecord {
  id: number;
  sessionId: string;
  mode: ProviderMode;
  status: "running" | "done" | "error";
  startedAt: string;
  stats: RunStats | null;
  trace: TraceEvent[];
  dropped: DroppedFinding[];
  error: string | null;
}
