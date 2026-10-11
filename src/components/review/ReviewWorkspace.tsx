"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import { SyntheticLabel } from "@/components/SyntheticLabel";
import { missingForSubmit } from "@/lib/review-rules";
import type { Decision, DimensionId, Finding, Review, ReviewDraft, SessionLabel } from "@/lib/types";
import type { ReviewPageData, SessionView } from "@/lib/view";
import { ApiError, api, streamCheck } from "./api";
import { CheckPanel, type CheckUiState } from "./CheckPanel";
import { FactsStrip } from "./FactsStrip";
import { RubricPanel } from "./RubricPanel";
import { TurnCard } from "./TurnCard";
import { WatchBar, type Speed, type WatchState } from "./WatchBar";

const STEP_MS = 1700;
const LABELS: SessionLabel[] = ["A", "B"];

const toDraft = (r: Review): ReviewDraft => ({
  scores: { A: { ...r.scores.A }, B: { ...r.scores.B } },
  preference: r.preference,
  rationale: r.rationale,
  feedback: { ...r.feedback },
});

const idleWatch: WatchState = { on: false, playing: false, speed: 2, visible: 0 };
const idleCheck: CheckUiState = { status: "idle", trace: [], error: null };

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

export function ReviewWorkspace({ data }: { data: ReviewPageData }) {
  const slug = data.task.slug;
  const [sessions, setSessions] = useState<SessionView[]>(data.sessions);
  const [active, setActive] = useState<SessionLabel>("A");
  const [tab, setTab] = useState<"check" | "rubric">("check");
  const [review, setReview] = useState<Review>(data.review);
  const [draft, setDraft] = useState<ReviewDraft>(() => toDraft(data.review));
  const [watch, setWatch] = useState<Record<SessionLabel, WatchState>>({ A: idleWatch, B: idleWatch });
  const [checkUi, setCheckUi] = useState<Record<SessionLabel, CheckUiState>>({ A: idleCheck, B: idleCheck });
  const [editor, setEditor] = useState<{ turnId: string; note: string; saving: boolean } | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [saving, setSaving] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [submitting, setSubmitting] = useState(false);

  const locked = review.status === "submitted";
  const session = sessions.find((s) => s.label === active)!;
  const w = watch[active];
  const total = session.turns.length;
  const visibleTurns = w.on ? session.turns.slice(0, w.visible) : session.turns;
  const currentTurnId = w.on ? (session.turns[w.visible - 1]?.id ?? null) : null;
  const missing = missingForSubmit(draft);

  const showError = useCallback((error: unknown) => {
    setToast(error instanceof ApiError ? error.message : "Something went wrong. Try again.");
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  // ---------- session updates ----------

  const patchSession = useCallback((label: SessionLabel, patch: (s: SessionView) => SessionView) => {
    setSessions((all) => all.map((s) => (s.label === label ? patch(s) : s)));
  }, []);

  // ---------- watch ----------

  const setW = useCallback(
    (label: SessionLabel, next: (w: WatchState) => WatchState) => setWatch((all) => ({ ...all, [label]: next(all[label]) })),
    [],
  );

  useEffect(() => {
    if (!w.on || !w.playing) return;
    if (w.visible >= total) {
      setW(active, (x) => ({ ...x, playing: false }));
      return;
    }
    const t = setTimeout(() => setW(active, (x) => ({ ...x, visible: Math.min(total, x.visible + 1) })), STEP_MS / w.speed);
    return () => clearTimeout(t);
  }, [active, setW, total, w.on, w.playing, w.speed, w.visible]);

  useEffect(() => {
    if (!currentTurnId) return;
    document.getElementById(`turn-${session.id}-${currentTurnId}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [currentTurnId, session.id]);

  const openInterrupt = useCallback(
    (turnId: string | null) => {
      if (!turnId || locked) return;
      if (session.interrupt) {
        setToast("One interrupt per session. Clear the pin first.");
        return;
      }
      setW(active, (x) => ({ ...x, playing: false }));
      setEditor({ turnId, note: "", saving: false });
    },
    [active, locked, session.interrupt, setW],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setEditor(null);
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (!w.on) return;
      if (e.key === "i" || e.key === "I") {
        e.preventDefault();
        openInterrupt(currentTurnId);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setW(active, (x) => ({ ...x, playing: false, visible: Math.min(total, x.visible + 1) }));
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setW(active, (x) => ({ ...x, playing: false, visible: Math.max(1, x.visible - 1) }));
      } else if (e.key === " ") {
        e.preventDefault();
        setW(active, (x) => ({ ...x, playing: !x.playing && x.visible < total }));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, currentTurnId, openInterrupt, setW, total, w.on]);

  async function saveInterrupt() {
    if (!editor || !editor.note.trim()) return;
    setEditor({ ...editor, saving: true });
    try {
      const pin = await api.setInterrupt(session.id, editor.turnId, editor.note.trim());
      patchSession(active, (s) => ({ ...s, interrupt: pin }));
      setEditor(null);
    } catch (error) {
      setEditor({ ...editor, saving: false });
      showError(error);
    }
  }

  async function clearInterrupt() {
    try {
      await api.clearInterrupt(session.id);
      patchSession(active, (s) => ({ ...s, interrupt: null }));
    } catch (error) {
      showError(error);
    }
  }

  // ---------- evidence ----------

  function goToTurn(turnId: string) {
    if (w.on) setW(active, (x) => ({ ...x, playing: false, visible: total }));
    requestAnimationFrame(() => {
      const el = document.getElementById(`turn-${session.id}-${turnId}`);
      if (!el) return;
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      el.classList.remove("flash");
      void el.offsetWidth;
      el.classList.add("flash");
    });
  }

  // ---------- check ----------

  async function runCheck() {
    const label = active;
    const sessionId = session.id;
    setTab("check");
    setCheckUi((all) => ({ ...all, [label]: { status: "running", trace: [], error: null } }));
    try {
      await streamCheck(sessionId, (event) => {
        if (event.type === "trace") {
          setCheckUi((all) => ({ ...all, [label]: { ...all[label], trace: [...all[label].trace, event.event] } }));
        } else if (event.type === "done") {
          patchSession(label, (s) => ({ ...s, check: event.check, findings: event.findings }));
          setCheckUi((all) => ({ ...all, [label]: idleCheck }));
        } else {
          setCheckUi((all) => ({ ...all, [label]: { ...all[label], status: "error", error: event.message } }));
        }
      });
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "Lost the connection to the server.";
      setCheckUi((all) => ({ ...all, [label]: { ...all[label], status: "error", error: message } }));
    }
  }

  async function decide(finding: Finding, decision: Decision) {
    const label = active;
    patchSession(label, (s) => ({ ...s, findings: s.findings.map((f) => (f.id === finding.id ? { ...f, decision } : f)) }));
    try {
      await api.decide(finding.id, decision);
    } catch (error) {
      patchSession(label, (s) => ({ ...s, findings: s.findings.map((f) => (f.id === finding.id ? finding : f)) }));
      showError(error);
    }
  }

  // ---------- draft ----------

  const draftRef = useRef(draft);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushSave = useCallback(async () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = null;
    setSaving("saving");
    try {
      const saved = await api.saveDraft(slug, draftRef.current);
      setReview(saved);
      setSaving("saved");
    } catch (error) {
      setSaving("error");
      showError(error);
      throw error;
    }
  }, [showError, slug]);

  const updateDraft = useCallback(
    (next: (d: ReviewDraft) => ReviewDraft) => {
      setDraft((d) => {
        const value = next(d);
        draftRef.current = value;
        return value;
      });
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => void flushSave().catch(() => undefined), 500);
    },
    [flushSave],
  );

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
  }, []);

  async function submit() {
    setSubmitting(true);
    try {
      await flushSave();
      const done = await api.submit(slug);
      setReview(done);
      setDraft(toDraft(done));
      setEditor(null);
      setWatch({ A: { ...watch.A, playing: false }, B: { ...watch.B, playing: false } });
    } catch (error) {
      showError(error);
    } finally {
      setSubmitting(false);
    }
  }

  // ---------- render ----------

  const pinsByTurn = useMemo(() => {
    const map = new Map<string, Finding[]>();
    for (const f of session.findings) {
      if (f.decision !== "accepted") continue;
      for (const id of f.evidence) map.set(id, [...(map.get(id) ?? []), f]);
    }
    return map;
  }, [session.findings]);

  return (
    <div className="flex h-[calc(100vh-3rem)] flex-col">
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1440px] items-center gap-4 px-5 py-2.5">
          <Link href="/" className="shrink-0 whitespace-nowrap text-[13px] font-medium text-slate-500 hover:text-slate-900">
            ← Queue
          </Link>
          <div className="min-w-0">
            <h1 className="truncate text-[15px] font-semibold tracking-tight text-slate-900" data-testid="task-title">
              {data.task.title}
            </h1>
            <p className="truncate text-[12px] text-slate-500">
              <span className="font-mono text-slate-600">{data.task.repo}</span> · {data.task.stack} · {data.task.summary}
            </p>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-2.5">
            <SyntheticLabel />
            <StatusBadge status={review.status} seeded={review.seeded} />
            {locked ? (
              <Link
                href={`/review/${slug}/export`}
                data-testid="export"
                className="inline-flex h-8 items-center rounded-md bg-slate-900 px-3 text-[13px] font-medium text-white hover:bg-slate-800"
              >
                Export
              </Link>
            ) : (
              <span
                className="inline-flex h-8 cursor-not-allowed items-center rounded-md border border-slate-200 px-3 text-[13px] font-medium text-slate-400"
                title="Submit the review to export it."
              >
                Export
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto flex min-h-0 w-full max-w-[1440px] flex-1">
        <section className="flex min-w-0 flex-1 flex-col border-r border-slate-200">
          <div className="space-y-2.5 border-b border-slate-200 bg-slate-50/80 px-5 pb-3 pt-3">
            <div className="flex items-center gap-3">
              <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5" role="tablist" aria-label="Sessions">
                {sessions.map((s) => {
                  const on = s.label === active;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      role="tab"
                      aria-selected={on}
                      data-testid={`tab-${s.label}`}
                      onClick={() => {
                        setActive(s.label);
                        setEditor(null);
                        setW(active, (x) => ({ ...x, playing: false }));
                      }}
                      className={`flex items-center gap-2 rounded-md px-3 py-1 text-[13px] font-medium transition ${
                        on ? "bg-slate-900 text-white shadow-sm" : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      Agent {s.label}
                      <span className={`text-[11px] ${on ? "text-slate-300" : "text-slate-400"}`}>{s.turns.length} turns</span>
                      {s.interrupt && <span className="h-1.5 w-1.5 rounded-full bg-fuchsia-500" title={`Interrupt at ${s.interrupt.turnId}`} />}
                    </button>
                  );
                })}
              </div>
              <div className="ml-auto">
                <WatchBar
                  state={w}
                  total={total}
                  currentTurnId={currentTurnId}
                  hasInterrupt={Boolean(session.interrupt)}
                  locked={locked}
                  onStart={(speed: Speed) => {
                    setEditor(null);
                    setW(active, () => ({ on: true, playing: true, speed, visible: 1 }));
                    document.getElementById("transcript")?.scrollTo({ top: 0 });
                  }}
                  onToggle={() =>
                    setW(active, (x) => (x.visible >= total ? { ...x, visible: 1, playing: true } : { ...x, playing: !x.playing }))
                  }
                  onStep={(d) => setW(active, (x) => ({ ...x, playing: false, visible: Math.min(total, Math.max(1, x.visible + d)) }))}
                  onSpeed={(speed) => setW(active, (x) => ({ ...x, speed }))}
                  onInterrupt={() => openInterrupt(currentTurnId)}
                  onExit={() => setW(active, (x) => ({ ...idleWatch, speed: x.speed }))}
                />
              </div>
            </div>
            <FactsStrip facts={session.facts} />
          </div>

          <div id="transcript" className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 py-4" data-testid="transcript">
            <ol className="mx-auto max-w-[860px] space-y-3">
              {visibleTurns.map((turn) => (
                <li key={`${session.id}-${turn.id}`}>
                  <TurnCard
                    sessionId={session.id}
                    turn={turn}
                    findings={turn.kind === "final" ? session.findings : []}
                    pinnedFindings={pinsByTurn.get(turn.id) ?? []}
                    interrupt={session.interrupt?.turnId === turn.id ? session.interrupt : null}
                    hoveredFinding={hovered}
                    onHoverFinding={setHovered}
                    onClearInterrupt={locked ? undefined : clearInterrupt}
                    onInterruptHere={locked || session.interrupt ? undefined : () => openInterrupt(turn.id)}
                    isCurrent={turn.id === currentTurnId}
                    animate={w.on}
                    editor={
                      editor?.turnId === turn.id ? (
                        <InterruptEditor
                          turnId={turn.id}
                          note={editor.note}
                          saving={editor.saving}
                          onChange={(note) => setEditor({ ...editor, note })}
                          onSave={saveInterrupt}
                          onCancel={() => setEditor(null)}
                        />
                      ) : null
                    }
                  />
                </li>
              ))}
              {w.on && w.visible < total && (
                <li className="flex items-center gap-2 px-1 text-[12px] text-slate-400">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-400" />
                  {w.playing ? "Next turn coming…" : `Paused at ${currentTurnId}. Press → for the next turn.`}
                </li>
              )}
            </ol>
          </div>
        </section>

        <aside className="flex w-[480px] shrink-0 flex-col bg-slate-50/60">
          <div className="flex gap-1 border-b border-slate-200 px-4 pt-2.5" role="tablist" aria-label="Review panel">
            {(
              [
                ["check", "Check claims"],
                ["rubric", "Rubric"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                data-testid={`panel-${id}`}
                onClick={() => setTab(id)}
                className={`-mb-px border-b-2 px-3 pb-2 text-[13px] font-medium transition ${
                  tab === id ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                {label}
                {id === "check" && <span className="ml-1.5 text-[11px] text-slate-400">Agent {active}</span>}
              </button>
            ))}
          </div>
          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-4 pt-4" data-testid="side-panel">
            {tab === "check" ? (
              <div className="pb-4">
                <CheckPanel
                  session={session}
                  ui={checkUi[active]}
                  mode={data.mode}
                  locked={locked}
                  hovered={hovered}
                  onHover={setHovered}
                  onRun={runCheck}
                  onDecide={decide}
                  onEvidence={goToTurn}
                />
              </div>
            ) : (
              <RubricPanel
                rubric={data.rubric}
                draft={draft}
                locked={locked}
                missing={missing}
                saving={saving}
                submitting={submitting}
                onScore={(label: SessionLabel, dim: DimensionId, score: number) =>
                  updateDraft((d) => ({ ...d, scores: { ...d.scores, [label]: { ...d.scores[label], [dim]: score } } }))
                }
                onPreference={(value) => updateDraft((d) => ({ ...d, preference: value }))}
                onRationale={(text) => updateDraft((d) => ({ ...d, rationale: text }))}
                onFeedback={(label, text) => updateDraft((d) => ({ ...d, feedback: { ...d.feedback, [label]: text } }))}
                onSubmit={submit}
              />
            )}
          </div>
        </aside>
      </div>

      {toast && (
        <div
          role="status"
          data-testid="toast"
          className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-slate-900 px-4 py-2 text-[13px] text-white shadow-lg"
        >
          {toast}
        </div>
      )}
    </div>
  );
}

function InterruptEditor(props: {
  turnId: string;
  note: string;
  saving: boolean;
  onChange: (note: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div data-testid="interrupt-editor" className="mt-3 rounded-lg border border-fuchsia-300 bg-fuchsia-50/70 p-3">
      <label htmlFor="interrupt-note" className="text-[12px] font-semibold text-fuchsia-800">
        Interrupt at {props.turnId}: what would you say to the agent?
      </label>
      <textarea
        id="interrupt-note"
        data-testid="interrupt-note"
        autoFocus
        rows={2}
        value={props.note}
        onChange={(e) => props.onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) props.onSave();
        }}
        placeholder="Stop. You have not reproduced it yet..."
        className="mt-1.5 w-full resize-y rounded-md border border-fuchsia-200 bg-white px-2.5 py-2 text-[13px] leading-5 outline-none focus:border-fuchsia-500 focus:ring-2 focus:ring-fuchsia-100"
      />
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          data-testid="interrupt-save"
          onClick={props.onSave}
          disabled={!props.note.trim() || props.saving}
          className="inline-flex h-7 items-center rounded-md bg-fuchsia-600 px-3 text-[12.5px] font-medium text-white hover:bg-fuchsia-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {props.saving ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={props.onCancel} className="h-7 px-2 text-[12.5px] text-slate-600 hover:text-slate-900">
          Cancel
        </button>
        <span className="ml-auto text-[11px] text-fuchsia-700/70">One interrupt per session</span>
      </div>
    </div>
  );
}
