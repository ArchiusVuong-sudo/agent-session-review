import { DIMENSIONS, type ReviewDraft } from "./types";

/** What still blocks Submit, in plain words. Empty means ready. */
export function missingForSubmit(draft: ReviewDraft): string[] {
  const missing: string[] = [];
  for (const label of ["A", "B"] as const) {
    const unscored = DIMENSIONS.filter((d) => draft.scores[label][d] === undefined).length;
    if (unscored > 0) missing.push(`${unscored} ${unscored === 1 ? "score" : "scores"} for ${label}`);
  }
  if (draft.preference === null) missing.push("a preference");
  if (draft.rationale.trim().length === 0) missing.push("a rationale");
  return missing;
}
