import type { Rubric } from "./data/load";
import type { SessionFacts } from "./facts";
import type { CheckRecord, Finding, Interrupt, ProviderMode, Review, SessionLabel, Turn } from "./types";

/** Everything the review page needs, loaded on the server in one go. */
export interface SessionView {
  id: string;
  label: SessionLabel;
  turns: Turn[];
  facts: SessionFacts;
  interrupt: Interrupt | null;
  check: CheckRecord | null;
  findings: Finding[];
}

export interface ReviewPageData {
  task: { slug: string; title: string; repo: string; stack: string; summary: string };
  sessions: SessionView[];
  review: Review;
  rubric: Rubric;
  mode: { mode: ProviderMode; model: string };
}
