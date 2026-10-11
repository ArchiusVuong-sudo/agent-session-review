import { describe, expect, it } from "vitest";
import { countWords, findHedges, lintFeedback } from "@/lib/lint";

const SHORT = "B treats the symptom and claims a pass it never ran.";
const FULL = `${SHORT} It never reproduces the failure: t3 runs only the scale tests, t4 guesses timing and t5 adds retries, which hides the bug. The t6 rewrite stops the scale tests using the shared fixture, so CI can go green while buildShoppingList still changes saved recipes. 'All tests pass now' (t7) is not backed: the last run is t3, before both edits. Instead, rerun with CI's seed and fix the shared state.`;
const A_TEXT =
  "A reproduces with CI's seed before touching code (t3, t4), finds that buildShoppingList changes the caller's recipe (t6) and fixes the product bug, not just the test. The new test fails first (t8) and passes after (t10, t11). One miss: it says mergePantry uses the same pattern but never opened it. It should check first or say so.";

const check = (text: string, id: string) => lintFeedback(text).checks.find((c) => c.id === id)!;

describe("lintFeedback", () => {
  it("fails the short opening line on turn id, better move and length", () => {
    const result = lintFeedback(SHORT);
    expect(result.pass).toBe(false);
    expect(check(SHORT, "cites_turn").pass).toBe(false);
    expect(check(SHORT, "better_move").pass).toBe(false);
    expect(check(SHORT, "length").pass).toBe(false);
    expect(check(SHORT, "length").detail).toBe("Too short (11).");
    expect(check(SHORT, "hedges").pass).toBe(true);
  });

  it("passes the full recorded feedback for B and for A", () => {
    expect(lintFeedback(FULL).pass).toBe(true);
    expect(lintFeedback(A_TEXT).pass).toBe(true);
  });

  it("allows one hedge word, fails on two", () => {
    const base = "It should rerun the suite with the CI seed before any edit, as t3 shows the failure was never reproduced at all here.";
    expect(lintFeedback(`Maybe ${base}`).checks.find((c) => c.id === "hedges")!.pass).toBe(true);
    const two = lintFeedback(`Maybe ${base} It probably hides the bug.`);
    expect(two.checks.find((c) => c.id === "hedges")!.pass).toBe(false);
    expect(two.checks.find((c) => c.id === "hedges")!.detail).toBe("Found: maybe, probably.");
  });

  it("finds multi-word hedges and repeats", () => {
    expect(findHedges("I think it is kind of fine, I think.")).toEqual(["kind of", "i think", "i think"]);
    expect(findHedges("The mighty test")).toEqual([]);
  });

  it("enforces 25 to 180 words", () => {
    const words = (n: number) => Array.from({ length: n }, (_, i) => (i === 0 ? "t3" : i === 1 ? "instead" : "word")).join(" ");
    expect(lintFeedback(words(24)).checks.find((c) => c.id === "length")!.pass).toBe(false);
    expect(lintFeedback(words(25)).checks.find((c) => c.id === "length")!.pass).toBe(true);
    expect(lintFeedback(words(180)).checks.find((c) => c.id === "length")!.pass).toBe(true);
    const long = lintFeedback(words(181)).checks.find((c) => c.id === "length")!;
    expect(long.pass).toBe(false);
    expect(long.detail).toBe("Too long (181).");
  });

  it("does not take t3x or at3 as a turn id", () => {
    expect(check("see at3 and t3x", "cites_turn").pass).toBe(false);
    expect(check("see t12.", "cites_turn").pass).toBe(true);
  });

  it("counts words on any whitespace", () => {
    expect(countWords("  one\ttwo\nthree  ")).toBe(3);
    expect(countWords("")).toBe(0);
  });
});
