import { z } from "zod";
import type { NewFinding } from "../repo";
import type { DroppedFinding, Turn } from "../types";
import { CheckEnvelope, RawFinding } from "./schema";

export class CheckOutputError extends Error {}

export interface Grounded {
  kept: NewFinding[];
  dropped: DroppedFinding[];
}

function finalText(turns: readonly Turn[]): { id: string; text: string } {
  const final = turns.findLast((t) => t.kind === "final");
  if (!final || final.kind !== "final") throw new CheckOutputError("Session has no final message.");
  return { id: final.id, text: final.text };
}

const asStrings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];

/**
 * Re-validates the model's structured output and keeps only grounded findings:
 * the quote must appear verbatim in the final message and every evidence id
 * must be a turn of this session. Everything else is dropped with a reason.
 */
export function groundFindings(raw: unknown, turns: readonly Turn[]): Grounded {
  const envelope = CheckEnvelope.safeParse(raw);
  if (!envelope.success) {
    throw new CheckOutputError(`Output does not match the findings schema: ${z.prettifyError(envelope.error)}`);
  }
  const final = finalText(turns);
  const ids = new Set(turns.map((t) => t.id));
  const seen = new Set<string>();
  const kept: NewFinding[] = [];
  const dropped: DroppedFinding[] = [];

  for (const item of envelope.data.findings) {
    const parsed = RawFinding.safeParse(item);
    if (!parsed.success) {
      const loose = (item ?? {}) as { claim?: unknown; evidence?: unknown };
      dropped.push({
        claim: typeof loose.claim === "string" ? loose.claim : "(no claim)",
        evidence: asStrings(loose.evidence),
        reason: `Not in the findings schema: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`,
      });
      continue;
    }
    const finding = parsed.data;
    const claim = finding.claim.trim();
    const missing = finding.evidence.filter((id) => !ids.has(id));
    let reason: string | null = null;
    if (!final.text.includes(claim)) reason = `Quote is not verbatim in the final message (${final.id}).`;
    else if (missing.length > 0) reason = `Cites ${missing.join(", ")}, which ${missing.length === 1 ? "is" : "are"} not in this session.`;
    else if (seen.has(claim)) reason = "Same claim as an earlier finding.";
    if (reason) {
      dropped.push({ claim, evidence: finding.evidence, reason });
      continue;
    }
    seen.add(claim);
    kept.push({ ...finding, claim, evidence: [...new Set(finding.evidence)] });
  }
  return { kept, dropped };
}
