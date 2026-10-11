import { z } from "zod";
import { Topic, TurnId, Verdict } from "../types";

/** One finding as the model must return it. */
export const RawFinding = z.object({
  claim: z.string().min(1).max(400).describe("The claim, copied verbatim from the final message."),
  topic: Topic.describe("What the claim is about."),
  verdict: Verdict.describe(
    "supported: a turn shows it. unsupported: no turn shows it. contradicted: a turn shows the opposite.",
  ),
  evidence: z.array(TurnId).min(1).max(8).describe("Turn ids that back or refute the claim, like t3."),
  reason: z.string().min(1).max(600).describe("One or two plain sentences on what the evidence shows."),
});
export type RawFinding = z.infer<typeof RawFinding>;

export const CheckOutput = z.object({ findings: z.array(RawFinding).max(20) });

/** The envelope is checked strictly; each finding is checked on its own so one bad item is dropped, not the run. */
export const CheckEnvelope = z.object({ findings: z.array(z.unknown()).max(40) });

/** JSON Schema passed to the SDK as the structured output format. */
export function checkOutputJsonSchema(): Record<string, unknown> {
  const schema = z.toJSONSchema(CheckOutput, { target: "draft-7" }) as Record<string, unknown>;
  delete schema.$schema;
  return schema;
}
