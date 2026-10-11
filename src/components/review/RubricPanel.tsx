"use client";

import { useState } from "react";
import type { Rubric } from "@/lib/data/load";
import { lintFeedback } from "@/lib/lint";
import type { DimensionId, ReviewDraft, SessionLabel } from "@/lib/types";

type Level = 1 | 2 | 3 | 4 | 5;
const LEVELS: Level[] = [1, 2, 3, 4, 5];
const LABELS: SessionLabel[] = ["A", "B"];
/** Two short lines per preference button; the full label shows below the row. */
const PREF_SHORT: [string, string][] = [
  ["A", "much"],
  ["A", "better"],
  ["A", "slightly"],
  ["About", "same"],
  ["B", "slightly"],
  ["B", "better"],
  ["B", "much"],
];

interface Props {
  rubric: Rubric;
  draft: ReviewDraft;
  locked: boolean;
  missing: string[];
  saving: "idle" | "saving" | "saved" | "error";
  submitting: boolean;
  /** A claim check is running: Submit waits for it, as the server would refuse. */
  checking: boolean;
  onScore: (label: SessionLabel, dim: DimensionId, score: number) => void;
  onPreference: (value: number) => void;
  onRationale: (text: string) => void;
  onFeedback: (label: SessionLabel, text: string) => void;
  onSubmit: () => void;
}

function scoreTone(level: number): string {
  if (level <= 2) return "border-rose-500 bg-rose-500 text-white";
  if (level === 3) return "border-amber-500 bg-amber-500 text-white";
  return "border-emerald-600 bg-emerald-600 text-white";
}

function DimensionCard(props: {
  dim: Rubric["dimensions"][number];
  draft: ReviewDraft;
  locked: boolean;
  onScore: Props["onScore"];
}) {
  const { dim } = props;
  const [peek, setPeek] = useState<Level | null>(null);
  return (
    <section data-testid={`dim-${dim.id}`} className="relative rounded-xl border border-slate-200 bg-white p-3">
      <header className="flex items-baseline gap-2">
        <h3 className="shrink-0 whitespace-nowrap text-[13.5px] font-semibold text-slate-900">{dim.name}</h3>
        <p className="min-w-0 truncate text-[12px] text-slate-500" title={dim.question}>
          {dim.question}
        </p>
      </header>

      <div className="mt-2 grid grid-cols-2 gap-2">
        {([2, 4] as const).map((level) => (
          <div
            key={level}
            data-testid={`anchor-${dim.id}-${level}`}
            className={`rounded-md border px-2 py-1.5 text-[11.5px] leading-[1.45] ${
              level === 2 ? "border-rose-100 bg-rose-50/60 text-rose-900" : "border-emerald-100 bg-emerald-50/60 text-emerald-900"
            }`}
          >
            <span className="mr-1 font-semibold">{level}</span>
            {dim.anchors[String(level) as "2" | "4"]}
          </div>
        ))}
      </div>

      <div className="mt-2.5 flex items-center justify-between gap-3">
        {LABELS.map((label) => {
          const value = props.draft.scores[label][dim.id];
          return (
            <div key={label} className="flex items-center gap-1.5">
              <span className="w-4 text-[12px] font-semibold text-slate-500" title={`Agent ${label}`}>
                {label}
              </span>
              <div className="flex gap-1" role="radiogroup" aria-label={`${dim.name}, Agent ${label}`}>
                {LEVELS.map((level) => {
                  const on = value === level;
                  return (
                    <button
                      key={level}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      disabled={props.locked}
                      data-testid={`score-${label}-${dim.id}-${level}`}
                      title={`${level}: ${dim.anchors[String(level) as "1"]}`}
                      onMouseEnter={() => setPeek(level)}
                      onMouseLeave={() => setPeek(null)}
                      onFocus={() => setPeek(level)}
                      onBlur={() => setPeek(null)}
                      onClick={() => props.onScore(label, dim.id, level)}
                      className={`h-7 w-[30px] rounded-md border text-[12.5px] font-semibold tabular-nums transition disabled:cursor-not-allowed ${
                        on
                          ? scoreTone(level)
                          : "border-slate-200 bg-white text-slate-600 hover:border-slate-400 disabled:opacity-60"
                      }`}
                    >
                      {level}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      {peek && (
        <p
          data-testid={`anchor-peek-${dim.id}`}
          role="tooltip"
          className="pointer-events-none absolute inset-x-3 top-full z-20 -mt-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11.5px] leading-[1.45] text-slate-700 shadow-lg"
        >
          <span className="font-semibold">Level {peek}:</span> {dim.anchors[String(peek) as "1"]}
        </p>
      )}
    </section>
  );
}

function LintList({ text }: { text: string }) {
  const lint = lintFeedback(text);
  const empty = text.trim().length === 0;
  return (
    <ul className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5" data-testid="lint" data-pass={!empty && lint.pass}>
      {lint.checks.map((c) => {
        const tone = empty ? "text-slate-400" : c.pass ? "text-emerald-700" : "text-rose-700";
        return (
          <li key={c.id} data-testid={`lint-${c.id}`} data-pass={c.pass} className={`flex items-start gap-1.5 text-[11.5px] ${tone}`} title={c.detail}>
            <span aria-hidden className="mt-px font-bold">
              {empty ? "○" : c.pass ? "✓" : "✕"}
            </span>
            <span>
              {c.label}
              {!empty && !c.pass && <span className="text-slate-500">: {c.detail}</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function RubricPanel(props: Props) {
  const { rubric, draft, locked } = props;
  const scored = LABELS.reduce((n, l) => n + Object.keys(draft.scores[l]).length, 0);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[12.5px] leading-5 text-slate-600">
        Score each agent from 1 to 5. Levels 2 and 4 are written out; hover any score to read its anchor. Scores, preference
        and feedback are yours alone: the claim check never writes them.
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-slate-500">Scores</h2>
          <span className="text-[12px] tabular-nums text-slate-500" data-testid="scored-count">
            {scored} of 12 set
          </span>
        </div>
        <div className="space-y-2">
          {rubric.dimensions.map((dim) => (
            <DimensionCard key={dim.id} dim={dim} draft={draft} locked={locked} onScore={props.onScore} />
          ))}
        </div>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-3">
        <h2 className="text-[13.5px] font-semibold text-slate-900">Preference</h2>
        <div className="mt-2 grid grid-cols-7 gap-1" role="radiogroup" aria-label="Preference, A vs B">
          {rubric.preference.map((label, i) => {
            const value = i + 1;
            const on = draft.preference === value;
            return (
              <button
                key={label}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={label}
                title={label}
                disabled={locked}
                data-testid={`pref-${value}`}
                onClick={() => props.onPreference(value)}
                className={`flex flex-col items-center rounded-md border px-1 py-1.5 leading-tight transition disabled:cursor-not-allowed ${
                  on ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-200 text-slate-600 hover:border-slate-400 disabled:opacity-60"
                }`}
              >
                <span className="text-[12px] font-semibold">{PREF_SHORT[i]![0]}</span>
                <span className={`text-[10.5px] ${on ? "text-indigo-100" : "text-slate-400"}`}>{PREF_SHORT[i]![1]}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-[12px] text-slate-500" data-testid="pref-label">
          {draft.preference ? (
            <>
              Preference: <span className="font-semibold text-slate-800">{rubric.preference[draft.preference - 1]}</span>
            </>
          ) : (
            "From A much better to B much better."
          )}
        </p>
        <label className="mt-3 block text-[12px] font-medium text-slate-700" htmlFor="rationale">
          Rationale
        </label>
        <textarea
          id="rationale"
          data-testid="rationale"
          disabled={locked}
          value={draft.rationale}
          onChange={(e) => props.onRationale(e.target.value)}
          rows={3}
          placeholder="Why one is better, citing turns."
          className="mt-1 w-full resize-y rounded-md border border-slate-300 px-2.5 py-2 text-[13px] leading-5 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-50 disabled:text-slate-600"
        />
      </section>

      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-3">
        <div>
          <h2 className="text-[13.5px] font-semibold text-slate-900">Feedback</h2>
          <p className="text-[12px] text-slate-500">
            The lint checks the shape: a turn id, the better move, little hedging, 25 to 180 words. The opinion is yours.
          </p>
        </div>
        {LABELS.map((label) => (
          <div key={label}>
            <label className="block text-[12px] font-medium text-slate-700" htmlFor={`feedback-${label}`}>
              Agent {label}
            </label>
            <textarea
              id={`feedback-${label}`}
              data-testid={`feedback-${label}`}
              disabled={locked}
              value={draft.feedback[label]}
              onChange={(e) => props.onFeedback(label, e.target.value)}
              rows={5}
              placeholder={`What worked, what did not, and what a strong engineer would have done instead (cite turns like t3).`}
              className="mt-1 w-full resize-y rounded-md border border-slate-300 px-2.5 py-2 text-[13px] leading-5 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-50 disabled:text-slate-600"
            />
            <LintList text={draft.feedback[label]} />
          </div>
        ))}
      </section>

      <div className="sticky bottom-0 -mx-4 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
        {locked ? (
          <p className="text-[13px] font-medium text-emerald-700" data-testid="locked-note">
            Submitted and locked.
          </p>
        ) : (
          <div className="flex items-center gap-3">
            <button
              type="button"
              data-testid="submit"
              disabled={props.missing.length > 0 || props.submitting || props.checking}
              onClick={props.onSubmit}
              className="inline-flex h-9 items-center rounded-md bg-slate-900 px-4 text-[13px] font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {props.submitting ? "Submitting…" : "Submit review"}
            </button>
            <span className="min-w-0 flex-1 text-[12px] text-slate-500" data-testid="submit-missing">
              {props.missing.length > 0
                ? `Still needed: ${props.missing.join(", ")}.`
                : props.checking
                  ? "A claim check is running. Submit when it finishes."
                  : "Ready to submit. It locks the review."}
            </span>
            <span className="shrink-0 text-[11.5px] text-slate-400" data-testid="save-state">
              {props.saving === "saving" ? "Saving…" : props.saving === "saved" ? "Draft saved" : props.saving === "error" ? "Not saved" : ""}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
