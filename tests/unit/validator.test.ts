import { describe, expect, it } from "vitest";
import { loadFixture } from "@/lib/checker/replay";
import { CheckOutputError, groundFindings } from "@/lib/checker/validator";
import { T1, freshDb, turnsOf } from "../helpers/db";

const turns = turnsOf(freshDb(), T1.b);
const good = {
  claim: "All tests pass now.",
  topic: "tests",
  verdict: "unsupported",
  evidence: ["t3"],
  reason: "The last run is t3, before both edits.",
};

describe("groundFindings", () => {
  it("keeps a verbatim, well-cited finding", () => {
    const { kept, dropped } = groundFindings({ findings: [good] }, turns);
    expect(kept).toEqual([good]);
    expect(dropped).toEqual([]);
  });

  it("drops a misquoted claim and a finding that cites t99, with reasons", () => {
    const misquoted = { ...good, claim: "All the tests pass now." };
    const missingTurn = { ...good, claim: "I added retries", verdict: "supported", evidence: ["t5", "t99"] };
    const { kept, dropped } = groundFindings({ findings: [good, misquoted, missingTurn] }, turns);
    expect(kept.map((f) => f.claim)).toEqual(["All tests pass now."]);
    expect(dropped).toEqual([
      { claim: "All the tests pass now.", evidence: ["t3"], reason: "Quote is not verbatim in the final message (t7)." },
      { claim: "I added retries", evidence: ["t5", "t99"], reason: "Cites t99, which is not in this session." },
    ]);
  });

  it("names every missing turn", () => {
    const { dropped } = groundFindings({ findings: [{ ...good, evidence: ["t3", "t98", "t99"] }] }, turns);
    expect(dropped[0]!.reason).toBe("Cites t98, t99, which are not in this session.");
  });

  it("drops items outside the schema without failing the run", () => {
    const { kept, dropped } = groundFindings(
      { findings: [good, { claim: "I added retries", verdict: "maybe", evidence: ["t5"] }, null] },
      turns,
    );
    expect(kept).toHaveLength(1);
    expect(dropped).toHaveLength(2);
    expect(dropped[0]!.claim).toBe("I added retries");
    expect(dropped[0]!.reason).toMatch(/^Not in the findings schema: .*verdict/);
    expect(dropped[1]!.claim).toBe("(no claim)");
  });

  it("drops a repeated claim and de-duplicates evidence", () => {
    const { kept, dropped } = groundFindings({ findings: [{ ...good, evidence: ["t3", "t3"] }, good] }, turns);
    expect(kept[0]!.evidence).toEqual(["t3"]);
    expect(dropped[0]!.reason).toBe("Same claim as an earlier finding.");
  });

  it("trims whitespace around a quote before matching", () => {
    const { kept } = groundFindings({ findings: [{ ...good, claim: "  All tests pass now.  " }] }, turns);
    expect(kept[0]!.claim).toBe("All tests pass now.");
  });

  it("throws on output that is not a findings envelope", () => {
    expect(() => groundFindings({ results: [] }, turns)).toThrow(CheckOutputError);
    expect(() => groundFindings("All good", turns)).toThrow(/findings schema/);
  });

  it("keeps every finding of the recorded live run on Task 1 B", () => {
    const fixture = loadFixture(T1.b);
    const { kept, dropped } = groundFindings(fixture.raw, turns);
    expect(dropped).toEqual([]);
    const pass = kept.find((f) => f.claim === "All tests pass now.");
    expect(pass?.verdict).toMatch(/^(unsupported|contradicted)$/);
    expect(pass?.evidence).toContain("t3");
  });
});
