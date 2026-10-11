import type { Db } from "../db";
import { AppError, completeCheck, createCheck, failCheck, findingsForCheck, getSession, latestCheck } from "../repo";
import type { CheckRecord, Finding, ProviderMode, TraceEvent } from "../types";
import { FakeProvider } from "./fake";
import { LiveProvider } from "./live";
import { currentMode, fallBackToReplay } from "./mode";
import type { CheckProvider } from "./provider";
import { ReplayProvider } from "./replay";
import { isAuthError } from "./retry";
import { CheckOutputError, groundFindings } from "./validator";

export type CheckStreamEvent =
  | { type: "trace"; event: TraceEvent }
  | { type: "done"; check: CheckRecord; findings: Finding[] }
  | { type: "error"; message: string };

export function providerFor(mode: ProviderMode): CheckProvider {
  if (mode === "live") return new LiveProvider();
  if (mode === "fake") return new FakeProvider();
  return new ReplayProvider();
}

const running = new Set<string>();

/**
 * Runs the claim check on one session and stores its findings. It writes only
 * to the checks and findings tables: scores and feedback stay the reviewer's.
 */
export async function runCheck(
  db: Db,
  sessionId: string,
  emit: (event: CheckStreamEvent) => void,
  options: { provider?: CheckProvider; signal?: AbortSignal } = {},
): Promise<void> {
  const session = getSession(db, sessionId);
  if (running.has(sessionId)) throw new AppError(409, "A check is already running for this session.");
  running.add(sessionId);

  let provider = options.provider ?? providerFor((await currentMode()).mode);
  const checkId = createCheck(db, sessionId, provider.mode);
  const trace: TraceEvent[] = [];
  const onTrace = (event: TraceEvent) => {
    trace.push(event);
    emit({ type: "trace", event });
  };
  const input = {
    sessionId,
    sessionLabel: session.label,
    loadTurns: () => getSession(db, sessionId).turns,
    signal: options.signal,
  };

  try {
    let output;
    try {
      output = await provider.run(input, onTrace);
    } catch (error) {
      if (provider.mode !== "live" || options.provider || !isAuthError(error)) throw error;
      fallBackToReplay("live login failed");
      onTrace({ type: "note", text: "No working login for a live run. Using the recorded run instead.", at: 0 });
      provider = new ReplayProvider();
      output = await provider.run(input, onTrace);
    }
    const grounded = groundFindings(output.raw, session.turns);
    completeCheck(db, checkId, {
      mode: provider.mode,
      stats: output.stats,
      trace,
      findings: grounded.kept,
      dropped: grounded.dropped,
    });
    const check = latestCheck(db, sessionId);
    if (!check) throw new Error("Check was not saved.");
    emit({ type: "done", check, findings: findingsForCheck(db, check.id) });
  } catch (error) {
    const message =
      error instanceof CheckOutputError || error instanceof AppError
        ? error.message
        : `The check did not finish: ${(error as Error).message}`;
    failCheck(db, checkId, message, trace);
    emit({ type: "error", message });
  } finally {
    running.delete(sessionId);
  }
}
