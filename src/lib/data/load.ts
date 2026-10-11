import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { DimensionId, Preference, ReviewDraft, Task, type Turn } from "../types";

export const DATA_SRC = join(process.cwd(), "data");

const Captured = z.object({
  command: z.string().optional(),
  exitCode: z.number().int().optional(),
  output: z.string().optional(),
  path: z.string().optional(),
  diff: z.string().optional(),
});
const CapturedFile = z.object({ a: z.record(z.string(), Captured), b: z.record(z.string(), Captured) });

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

/** Replaces `{ id, capture: "a.t3" }` turns with the real output recorded by scripts/capture-task1.ts. */
function resolveCaptures(raw: unknown, captured: z.infer<typeof CapturedFile> | null): unknown {
  if (!captured || typeof raw !== "object" || raw === null) return raw;
  const task = raw as { sessions: { turns: Array<Record<string, unknown>> }[] };
  for (const session of task.sessions) {
    session.turns = session.turns.map((turn): Record<string, unknown> => {
      const key = turn.capture;
      if (typeof key !== "string") return turn;
      const [side, id] = key.split(".") as ["a" | "b", string];
      const c = captured[side]?.[id];
      if (!c) throw new Error(`capture ${key} not found in data/captured/task1.json`);
      if (c.command !== undefined) {
        return { id: turn.id, kind: "command", command: c.command, exitCode: c.exitCode, output: c.output ?? "" };
      }
      return { id: turn.id, kind: "edit", files: [{ path: c.path, diff: c.diff ?? "" }] };
    });
  }
  return task;
}

export function loadTasks(dir = DATA_SRC): Task[] {
  const capturedPath = join(dir, "captured/task1.json");
  let captured: z.infer<typeof CapturedFile> | null = null;
  try {
    captured = CapturedFile.parse(readJson(capturedPath));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const files = readdirSync(join(dir, "tasks"))
    .filter((f) => f.endsWith(".json"))
    .sort();
  return files.map((file) => {
    const parsed = Task.safeParse(resolveCaptures(readJson(join(dir, "tasks", file)), captured));
    if (!parsed.success) throw new Error(`data/tasks/${file}: ${z.prettifyError(parsed.error)}`);
    assertTurnOrder(parsed.data);
    return parsed.data;
  });
}

function assertTurnOrder(task: Task): void {
  for (const session of task.sessions) {
    session.turns.forEach((turn: Turn, i) => {
      if (turn.id !== `t${i + 1}`) throw new Error(`${session.id}: turn ${i + 1} has id ${turn.id}`);
    });
    if (session.turns.at(-1)?.kind !== "final") throw new Error(`${session.id}: last turn must be the final message`);
  }
}

export const Anchors = z.object({ "1": z.string(), "2": z.string(), "3": z.string(), "4": z.string(), "5": z.string() });
export const Rubric = z.object({
  dimensions: z
    .array(z.object({ id: DimensionId, name: z.string(), question: z.string(), anchors: Anchors }))
    .length(DimensionId.options.length),
  preference: z.array(z.string()).length(7),
});
export type Rubric = z.infer<typeof Rubric>;

let rubricCache: Rubric | null = null;
export function loadRubric(dir = DATA_SRC): Rubric {
  rubricCache ??= Rubric.parse(readJson(join(dir, "rubric.json")));
  return rubricCache;
}

const SeedReviews = z.object({
  reviews: z.array(
    ReviewDraft.extend({ taskSlug: z.string(), preference: Preference }),
  ),
});
export type SeedReview = z.infer<typeof SeedReviews>["reviews"][number];

export function loadSeedReviews(dir = DATA_SRC): SeedReview[] {
  return SeedReviews.parse(readJson(join(dir, "seed-reviews.json"))).reviews;
}
