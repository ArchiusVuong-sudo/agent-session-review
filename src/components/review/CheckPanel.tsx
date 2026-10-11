"use client";

import { testsFactAgreement } from "@/lib/facts";
import type { Decision, Finding, ProviderMode, RunStats, TraceEvent } from "@/lib/types";
import type { SessionView } from "@/lib/view";
import { TOPIC_LABEL, VERDICT_STYLE, formatMs, formatTokens, inlineCode } from "./format";

export interface CheckUiState {
  status: "idle" | "running" | "error";
  trace: TraceEvent[];
  error: string | null;
}

interface Props {
  session: SessionView;
  ui: CheckUiState;
  mode: { mode: ProviderMode; model: string };
  locked: boolean;
  hovered: number | null;
  onHover: (id: number | null) => void;
  onRun: () => void;
  onDecide: (finding: Finding, decision: Decision) => void;
  onEvidence: (turnId: string) => void;
}

function argsText(args: Record<string, unknown>): string {
  const entries = Object.entries(args);
  if (entries.length === 0) return "";
  return entries.map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(", ");
}

function TraceList({ trace, running, stats }: { trace: TraceEvent[]; running: boolean; stats: RunStats | null }) {
  const tools = trace.filter((e) => e.type === "tool");
  const start = trace.find((e) => e.type === "start");
  return (
    <div data-testid="trace" className="overflow-hidden rounded-lg border border-slate-800 bg-slate-950 text-[12px]">
      <div className="flex items-center gap-2 border-b border-slate-800 px-3 py-1.5 text-[11px] uppercase tracking-wide text-slate-400">
        <span>Trace</span>
        <span className="ml-auto normal-case tracking-normal text-slate-500">
          {tools.length} tool {tools.length === 1 ? "call" : "calls"}
        </span>
      </div>
      <ol className="scroll-thin max-h-56 space-y-px overflow-y-auto py-1 font-mono">
        {trace.map((event, i) =>
          event.type === "tool" ? (
            <li key={i} data-testid="trace-call" className="flex items-baseline gap-2 px-3 py-0.5 text-slate-300">
              <span className="text-emerald-400">✓</span>
              <span className="text-sky-300">{event.name}</span>
              <span className="min-w-0 flex-1 truncate text-slate-500">{argsText(event.args)}</span>
              <span className="shrink-0 tabular-nums text-slate-500">{formatMs(event.ms)}</span>
            </li>
          ) : event.type === "note" ? (
            <li key={i} className="px-3 py-0.5 text-amber-300/80">
              {event.text}
            </li>
          ) : (
            <li key={i} className="px-3 py-0.5 text-slate-500">
              {event.mode === "live" ? "query()" : event.mode} · {event.model}
            </li>
          ),
        )}
        {running && (
          <li className="flex items-center gap-2 px-3 py-0.5 text-slate-400">
            <span className="h-2 w-2 animate-pulse rounded-full bg-indigo-400" />
            {tools.length === 0 ? "Starting the agent…" : "Model is reading…"}
          </li>
        )}
      </ol>
      {stats && !running && (
        <div data-testid="trace-stats" className="flex flex-wrap gap-x-3 gap-y-0.5 border-t border-slate-800 px-3 py-1.5 font-mono text-[11px] text-slate-400">
          <span className="text-slate-200">{stats.model}</span>
          <span>{formatMs(stats.durationMs)}</span>
          <span>
            {formatTokens(stats.inputTokens)} in / {formatTokens(stats.outputTokens)} out tokens
          </span>
          <span>${stats.costUsd.toFixed(3)} est.</span>
          {start?.type === "start" && start.mode === "replay" && <span className="text-amber-300/80">recorded run</span>}
        </div>
      )}
    </div>
  );
}

function FindingCard(props: { finding: Finding; session: SessionView; locked: boolean; hovered: boolean } & Pick<Props, "onHover" | "onDecide" | "onEvidence">) {
  const { finding } = props;
  const style = VERDICT_STYLE[finding.verdict];
  const agreement = finding.topic === "tests" ? testsFactAgreement(finding.verdict, props.session.facts) : null;
  return (
    <li
      id={`finding-${finding.id}`}
      data-testid="finding"
      data-verdict={finding.verdict}
      data-decision={finding.decision ?? "none"}
      onMouseEnter={() => props.onHover(finding.id)}
      onMouseLeave={() => props.onHover(null)}
      className={`rounded-lg border bg-white p-3 transition ${props.hovered ? "border-indigo-300 shadow-md" : "border-slate-200"} ${
        finding.decision === "rejected" ? "opacity-55" : ""
      }`}
    >
      <div className="flex items-center gap-1.5">
        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${style.pill}`}>{style.label}</span>
        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">{TOPIC_LABEL[finding.topic]}</span>
        {agreement && (
          <span
            data-testid="facts-agreement"
            className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${agreement === "agrees" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}
            title="Compared with the facts strip: tests after last edit and the last run's exit code."
          >
            {agreement === "agrees" ? "agrees with facts" : "conflicts with facts"}
          </span>
        )}
      </div>
      <blockquote className="mt-2 border-l-2 border-slate-300 pl-2 text-[13px] font-medium leading-5 text-slate-900">
        &ldquo;{finding.claim}&rdquo;
      </blockquote>
      <p className="mt-1.5 text-[12.5px] leading-5 text-slate-600">{inlineCode(finding.reason, `r${finding.id}`)}</p>
      <div className="mt-2 flex items-center gap-1.5">
        <span className="text-[11px] text-slate-400">Evidence</span>
        {finding.evidence.map((id) => (
          <button
            key={id}
            type="button"
            data-testid={`evidence-${id}`}
            onClick={() => props.onEvidence(id)}
            className="rounded border border-slate-200 bg-slate-50 px-1.5 py-px font-mono text-[11px] text-indigo-700 hover:border-indigo-300 hover:bg-indigo-50"
          >
            {id}
          </button>
        ))}
        <div className="ml-auto flex gap-1">
          {(["accepted", "rejected"] as const).map((d) => {
            const on = finding.decision === d;
            return (
              <button
                key={d}
                type="button"
                disabled={props.locked}
                data-testid={d === "accepted" ? "accept" : "reject"}
                aria-pressed={on}
                onClick={() => props.onDecide(finding, on ? null : d)}
                className={`rounded-md border px-2 py-0.5 text-[12px] font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
                  on
                    ? d === "accepted"
                      ? "border-emerald-600 bg-emerald-600 text-white"
                      : "border-slate-600 bg-slate-600 text-white"
                    : "border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                {d === "accepted" ? (on ? "Accepted" : "Accept") : on ? "Rejected" : "Reject"}
              </button>
            );
          })}
        </div>
      </div>
    </li>
  );
}

export function CheckPanel(props: Props) {
  const { session, ui } = props;
  const check = session.check;
  const running = ui.status === "running";
  const findings = running ? [] : session.findings;
  const trace = running || ui.status === "error" ? ui.trace : (check?.trace ?? []);
  const counts = { supported: 0, unsupported: 0, contradicted: 0 };
  for (const f of findings) counts[f.verdict]++;

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-indigo-100 bg-indigo-50/60 p-3">
        <p className="text-[12.5px] leading-5 text-slate-700">
          An agent reads Agent {session.label}&apos;s session through three read-only tools and checks each claim in the final
          message against it. It only finds evidence. You accept or reject each finding, and the scores stay yours.
        </p>
        <div className="mt-2.5 flex items-center gap-2">
          <button
            type="button"
            data-testid="check-claims"
            onClick={props.onRun}
            disabled={running || props.locked}
            className="inline-flex h-8 items-center gap-2 rounded-md bg-indigo-600 px-3 text-[13px] font-medium text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {running && <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
            {running ? "Checking…" : check ? "Check again" : "Check claims"}
          </button>
          <span className="text-[11.5px] text-slate-500">
            {props.mode.mode === "live" ? (
              <>
                Live on <span className="font-mono">{props.mode.model}</span>
              </>
            ) : props.mode.mode === "fake" ? (
              "Test mode: a scripted runner, not a model"
            ) : (
              "Replay mode: plays back a recorded live run"
            )}
          </span>
        </div>
      </div>

      {trace.length > 0 && <TraceList trace={trace} running={running} stats={running ? null : (check?.stats ?? null)} />}

      {ui.status === "error" && (
        <div role="alert" data-testid="check-error" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-[13px] text-rose-800">
          <div className="font-medium">The check did not finish</div>
          <p className="mt-0.5">{ui.error}</p>
          <button type="button" onClick={props.onRun} className="mt-2 text-[12px] font-medium text-rose-700 underline">
            Try again
          </button>
        </div>
      )}

      {!running && !check && ui.status !== "error" && (
        <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-[13px] text-slate-500">
          No check yet for Agent {session.label}. Run one to see which claims the session backs.
        </div>
      )}

      {!running && check && ui.status !== "error" && (
        <>
          <div className="flex items-center gap-3 text-[12px] text-slate-600" data-testid="finding-summary">
            <span className="font-medium text-slate-900">
              {findings.length} {findings.length === 1 ? "finding" : "findings"}
            </span>
            {(["contradicted", "unsupported", "supported"] as const).map((v) =>
              counts[v] > 0 ? (
                <span key={v} className="inline-flex items-center gap-1">
                  <span className={`h-2 w-2 rounded-full ${VERDICT_STYLE[v].dot}`} />
                  {counts[v]} {VERDICT_STYLE[v].label.toLowerCase()}
                </span>
              ) : null,
            )}
            <span className="ml-auto text-slate-400">{check.dropped.length} dropped</span>
          </div>
          <ul className="space-y-2">
            {findings.map((f) => (
              <FindingCard
                key={f.id}
                finding={f}
                session={session}
                locked={props.locked}
                hovered={props.hovered === f.id}
                onHover={props.onHover}
                onDecide={props.onDecide}
                onEvidence={props.onEvidence}
              />
            ))}
          </ul>
          {check.dropped.length > 0 && (
            <details className="rounded-lg border border-slate-200 bg-white p-3 text-[12.5px]" data-testid="dropped">
              <summary className="cursor-pointer font-medium text-slate-700">
                {check.dropped.length} dropped by the grounding check
              </summary>
              <ul className="mt-2 space-y-1.5 text-slate-600">
                {check.dropped.map((d, i) => (
                  <li key={i}>
                    &ldquo;{d.claim}&rdquo; <span className="text-slate-400">({d.evidence.join(", ") || "no evidence"})</span>:{" "}
                    {inlineCode(d.reason, `d${i}`)}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}
