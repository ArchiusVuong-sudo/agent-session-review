/**
 * Live lint for written feedback. It checks the shape of the feedback, never
 * its opinion: the judgment stays with the reviewer.
 */

export const MIN_WORDS = 25;
export const MAX_WORDS = 180;
export const MAX_HEDGES = 1;

const TURN_REF = /\bt\d{1,3}\b/;

const BETTER_MOVE = [
  /\binstead\b/i,
  /\bshould\b/i,
  /\brather than\b/i,
  /\bwould have\b/i,
  /\bthe (better|right|real) (fix|move|step)\b/i,
  /\bbetter (to|would be)\b/i,
];

const HEDGES = [
  "maybe",
  "perhaps",
  "possibly",
  "probably",
  "might",
  "seems",
  "seem",
  "somewhat",
  "arguably",
  "kind of",
  "sort of",
  "i think",
  "i guess",
  "i feel",
];

export interface LintCheck {
  id: "cites_turn" | "better_move" | "hedges" | "length";
  label: string;
  pass: boolean;
  detail: string;
}

export interface LintResult {
  pass: boolean;
  words: number;
  checks: LintCheck[];
}

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function findHedges(text: string): string[] {
  const lower = text.toLowerCase();
  const found: string[] = [];
  for (const hedge of HEDGES) {
    const re = new RegExp(`\\b${hedge.replace(" ", "\\s+")}\\b`, "g");
    for (const _ of lower.matchAll(re)) found.push(hedge);
  }
  return found;
}

export function lintFeedback(text: string): LintResult {
  const words = countWords(text);
  const hedges = findHedges(text);
  const checks: LintCheck[] = [
    {
      id: "cites_turn",
      label: "Cites a turn id",
      pass: TURN_REF.test(text),
      detail: TURN_REF.test(text) ? "Points at the evidence." : "Name the turn you mean, like t3.",
    },
    {
      id: "better_move",
      label: "Names the better move",
      pass: BETTER_MOVE.some((re) => re.test(text)),
      detail: BETTER_MOVE.some((re) => re.test(text))
        ? "Says what a strong engineer would do."
        : "Say what it should have done instead.",
    },
    {
      id: "hedges",
      label: `At most ${MAX_HEDGES} hedge word`,
      pass: hedges.length <= MAX_HEDGES,
      detail: hedges.length === 0 ? "No hedging." : `Found: ${hedges.join(", ")}.`,
    },
    {
      id: "length",
      label: `${MIN_WORDS}-${MAX_WORDS} words`,
      pass: words >= MIN_WORDS && words <= MAX_WORDS,
      detail: words < MIN_WORDS ? `Too short (${words}).` : words > MAX_WORDS ? `Too long (${words}).` : `${words} words.`,
    },
  ];
  return { pass: checks.every((c) => c.pass), words, checks };
}
