import { describe, expect, it } from "vitest";
import { ALLOWED_TOOLS } from "@/lib/checker/mcp";
import { GetTurnInput, SearchSessionInput, getTurn, listTurns, searchSession, summarizeTurn } from "@/lib/checker/tools";
import type { Turn } from "@/lib/types";
import { z } from "zod";
import { T1, freshDb, turnsOf } from "../helpers/db";

const turns = turnsOf(freshDb(), T1.b);

describe("session tools", () => {
  it("only the three session tools are allowed", () => {
    expect(ALLOWED_TOOLS).toEqual(["mcp__session__list_turns", "mcp__session__get_turn", "mcp__session__search_session"]);
  });

  it("list_turns gives id, kind and a one-line summary", () => {
    const list = listTurns(turns);
    expect(list).toHaveLength(7);
    expect(list[2]).toEqual({ id: "t3", kind: "command", summary: "$ npx vitest run -t scaleRecipe (exit 0)" });
    expect(list[4]).toEqual({ id: "t5", kind: "edit", summary: "edited vitest.config.ts" });
    expect(list.every((t) => t.summary.length <= 110)).toBe(true);
  });

  it("get_turn returns the turn, or an error naming the range", () => {
    expect(getTurn(turns, { id: "t7" })).toMatchObject({ id: "t7", kind: "final" });
    expect(getTurn(turns, { id: "t99" })).toEqual({ error: "No turn t99. This session has t1 to t7." });
  });

  it("get_turn clips long command output", () => {
    const long: Turn[] = [{ id: "t1", kind: "command", command: "npm test", exitCode: 0, output: "x".repeat(7000) }];
    const out = getTurn(long, { id: "t1" }) as Extract<Turn, { kind: "command" }>;
    expect(out.output.length).toBeLessThan(6100);
    expect(out.output).toMatch(/1000 more chars\)$/);
  });

  it("search_session finds lines case-insensitively across turn kinds", () => {
    const result = searchSession(turns, { query: "RETR" });
    expect(result.matches.map((m) => m.id)).toEqual(["t4", "t5", "t7"]);
    expect(result.truncated).toBe(false);
    expect(searchSession(turns, { query: "4817" }).matches.map((m) => m.id)).toEqual(["t1"]);
  });

  it("search_session stops at 12 matches", () => {
    const many: Turn[] = [{ id: "t1", kind: "user", text: Array.from({ length: 20 }, () => "needle").join("\n") }];
    const result = searchSession(many, { query: "needle" });
    expect(result.matches).toHaveLength(12);
    expect(result.truncated).toBe(true);
  });

  it("validates tool inputs", () => {
    expect(z.object(GetTurnInput).safeParse({ id: "t3" }).success).toBe(true);
    expect(z.object(GetTurnInput).safeParse({ id: "3" }).success).toBe(false);
    expect(z.object(GetTurnInput).safeParse({ id: "t3; rm -rf" }).success).toBe(false);
    expect(z.object(SearchSessionInput).safeParse({ query: "a" }).success).toBe(false);
    expect(z.object(SearchSessionInput).safeParse({ query: "x".repeat(81) }).success).toBe(false);
  });

  it("summarizes reads and prose", () => {
    expect(summarizeTurn({ id: "t1", kind: "read", path: "src/a.ts", excerpt: "" })).toBe("read src/a.ts");
    expect(summarizeTurn({ id: "t1", kind: "user", text: "a\n\nb" })).toBe("a b");
  });
});
