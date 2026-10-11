import type { EnvSource } from "./env-source";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AppError } from "../repo";
import type { TraceEvent } from "../types";
import { Fixture, type CheckInput, type CheckProvider, type CheckRunOutput } from "./provider";

export const FIXTURE_DIR = join(process.cwd(), "fixtures", "checks");

export function fixturePath(sessionId: string, dir = FIXTURE_DIR): string {
  return join(dir, `${sessionId}.json`);
}

export function loadFixture(sessionId: string, dir = FIXTURE_DIR): Fixture {
  let text: string;
  try {
    text = readFileSync(fixturePath(sessionId, dir), "utf8");
  } catch {
    throw new AppError(503, `No recorded run for ${sessionId}. Run it live, or record one with npm run record.`);
  }
  return Fixture.parse(JSON.parse(text));
}

/** Pause between replayed tool calls. REPLAY_DELAY_MS=0 replays instantly (tests). */
export function replayDelayMs(source: EnvSource = process.env): number {
  const value = Number(source.REPLAY_DELAY_MS ?? 280);
  return Number.isFinite(value) && value >= 0 ? value : 280;
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (ms === 0) return resolve();
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new Error("aborted"));
    });
  });

/** Replays a recorded live run: the same tool calls in order, then the same raw output. */
export class ReplayProvider implements CheckProvider {
  readonly mode = "replay" as const;

  constructor(
    private readonly dir = FIXTURE_DIR,
    private readonly delayMs = replayDelayMs(),
  ) {}

  async run(input: CheckInput, emit: (event: TraceEvent) => void): Promise<CheckRunOutput> {
    const fixture = loadFixture(input.sessionId, this.dir);
    emit({ type: "start", mode: "replay", model: fixture.model, at: 0 });
    emit({ type: "note", text: `Replaying the live run recorded ${fixture.recordedAt.slice(0, 10)}.`, at: 0 });
    for (const event of fixture.events) {
      await sleep(this.delayMs, input.signal);
      emit({ type: "tool", name: event.name, args: event.args, ms: event.ms, at: event.atMs });
    }
    await sleep(this.delayMs, input.signal);
    return { raw: fixture.raw, stats: fixture.stats };
  }
}
