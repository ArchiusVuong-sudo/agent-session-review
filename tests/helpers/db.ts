import { openDb, type Db } from "@/lib/db";
import { getSession } from "@/lib/repo";
import type { Turn } from "@/lib/types";

/** A fresh in-memory database seeded from data/. */
export function freshDb(): Db {
  return openDb(":memory:");
}

export const T1 = { slug: "ci-fails-scale-recipe", a: "ci-fails-scale-recipe-a", b: "ci-fails-scale-recipe-b" } as const;
export const T2 = { slug: "watering-shift-reminder", a: "watering-shift-reminder-a", b: "watering-shift-reminder-b" } as const;

export function turnsOf(db: Db, sessionId: string): Turn[] {
  return getSession(db, sessionId).turns;
}

export const FULL_DRAFT = {
  scores: {
    A: { makes_sense: 5, reasoning: 5, judgment: 5, guiding: 4, trust: 4, overall: 5 },
    B: { makes_sense: 2, reasoning: 1, judgment: 1, guiding: 2, trust: 1, overall: 1 },
  },
  preference: 1,
  rationale: "A finds the real cause and proves it with CI's seed (t10). B claims a pass it never ran (t7).",
  feedback: { A: "A reproduces first (t3).", B: "B adds retries (t5)." },
};
