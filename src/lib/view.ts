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
  /** The newest done check and its findings. A failed run never replaces them. */
  check: CheckRecord | null;
  findings: Finding[];
  /** The newest run, when it failed after `check`: its error shows next to the old findings. */
  failed: CheckRecord | null;
}

export interface ReviewPageData {
  task: { slug: string; title: string; repo: string; stack: string; summary: string };
  sessions: SessionView[];
  review: Review;
  rubric: Rubric;
  mode: { mode: ProviderMode; model: string };
}
