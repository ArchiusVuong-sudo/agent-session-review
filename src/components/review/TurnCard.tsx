"use client";

import { useState, type ReactNode } from "react";
import type { Finding, Interrupt, Turn } from "@/lib/types";
import { FinalMessage } from "./FinalMessage";
import { VERDICT_STYLE, inlineCode } from "./format";

const KIND_LABEL: Record<Turn["kind"], string> = {
  user: "User",
  preamble: "Preamble",
  reasoning: "Reasoning",
  command: "Command",
  read: "Read",
  edit: "Edit",
  final: "Final message",
};

const KIND_STYLE: Record<Turn["kind"], string> = {
  user: "bg-slate-800 text-white",
  preamble: "bg-indigo-50 text-indigo-700",
  reasoning: "bg-violet-50 text-violet-700",
  command: "bg-slate-100 text-slate-700",
  read: "bg-sky-50 text-sky-700",
  edit: "bg-amber-50 text-amber-800",
  final: "bg-emerald-50 text-emerald-700",
};

function Prose({ text }: { text: string }) {
  return (
    <div className="space-y-2 text-[14px] leading-6 text-slate-700">
      {text.split(/\n{2,}/).map((para, i) => (
        <p key={i} className="whitespace-pre-wrap">
          {inlineCode(para, `p${i}`)}
        </p>
      ))}
    </div>
  );
}

function Collapsible({
  lines,
  limit,
  dark = false,
  children,
}: {
  lines: number;
  limit: number;
  dark?: boolean;
  children: (open: boolean) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const long = lines > limit;
  return (
    <div>
      {children(open || !long)}
      {long && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={`mt-1 text-xs font-medium ${dark ? "text-sky-300 hover:text-sky-200" : "px-3 pb-1 text-indigo-600 hover:text-indigo-800"}`}
        >
          {open ? "Show less" : `Show all ${lines} lines`}
        </button>
      )}
    </div>
  );
}

function CommandBody({ turn }: { turn: Extract<Turn, { kind: "command" }> }) {
  const lines = turn.output.replace(/^\s*\n/, "").split("\n");
  const ok = turn.exitCode === 0;
  return (
    <div className="overflow-hidden rounded-lg border border-slate-800 bg-slate-900">
      <div className="flex items-center gap-2 border-b border-slate-800 px-3 py-2">
        <span className="font-mono text-[12.5px] text-slate-100">
          <span className="select-none text-slate-500">$ </span>
          {turn.command}
        </span>
        <span
          data-testid="exit-code"
          className={`ml-auto rounded px-1.5 py-0.5 font-mono text-[11px] font-medium ${
            ok ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/20 text-rose-300"
          }`}
        >
          exit {turn.exitCode}
        </span>
      </div>
      {turn.output && (
        <div className="px-3 py-2">
          <Collapsible lines={lines.length} limit={14} dark>
            {(open) => (
              <pre className="scroll-thin overflow-x-auto font-mono text-[11.5px] leading-[1.55] text-slate-300">
                {(open ? lines : lines.slice(0, 14)).join("\n")}
              </pre>
            )}
          </Collapsible>
        </div>
      )}
    </div>
  );
}

function DiffBody({ path, diff }: { path: string; diff: string }) {
  const lines = diff.split("\n");
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200">
      <div className="border-b border-slate-200 bg-slate-50 px-3 py-1.5 font-mono text-[12px] text-slate-700">{path}</div>
      <Collapsible lines={lines.length} limit={22}>
        {(open) => (
          <pre className="scroll-thin overflow-x-auto bg-white py-1 font-mono text-[11.5px] leading-[1.6]">
            {(open ? lines : lines.slice(0, 22)).map((line, i) => {
              const cls = line.startsWith("@@")
                ? "bg-sky-50 text-sky-700"
                : line.startsWith("+")
                  ? "bg-emerald-50 text-emerald-800"
                  : line.startsWith("-")
                    ? "bg-rose-50 text-rose-800"
                    : "text-slate-600";
              return (
                <span key={i} className={`block px-3 ${cls}`}>
                  {line || " "}
                </span>
              );
            })}
          </pre>
        )}
      </Collapsible>
    </div>
  );
}

function ReadBody({ turn }: { turn: Extract<Turn, { kind: "read" }> }) {
  const lines = turn.excerpt.split("\n");
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200">
      <div className="border-b border-slate-200 bg-slate-50 px-3 py-1.5 font-mono text-[12px] text-slate-700">{turn.path}</div>
      <Collapsible lines={lines.length} limit={16}>
        {(open) => (
          <pre className="scroll-thin overflow-x-auto bg-white px-3 py-2 font-mono text-[11.5px] leading-[1.6] text-slate-700">
            {(open ? lines : lines.slice(0, 16)).map((line, i) => (
              <span key={i} className="block">
                <span className="mr-3 inline-block w-5 select-none text-right text-slate-300">{i + 1}</span>
                {line}
              </span>
            ))}
          </pre>
        )}
      </Collapsible>
    </div>
  );
}

export interface TurnCardProps {
  sessionId: string;
  turn: Turn;
  findings: readonly Finding[];
  pinnedFindings: readonly Finding[];
  interrupt: Interrupt | null;
  hoveredFinding: number | null;
  onHoverFinding: (id: number | null) => void;
  onClearInterrupt?: () => void;
  onInterruptHere?: () => void;
  isCurrent?: boolean;
  animate?: boolean;
  editor?: ReactNode;
}

export function TurnCard(props: TurnCardProps) {
  const { turn, interrupt } = props;
  return (
    <article
      id={`turn-${props.sessionId}-${turn.id}`}
      data-testid={`turn-${turn.id}`}
      className={`group relative rounded-xl border bg-white px-4 py-3 shadow-[0_1px_2px_rgb(15_23_42/0.04)] ${
        props.animate ? "turn-in" : ""
      } ${props.isCurrent ? "border-indigo-300 ring-2 ring-indigo-100" : "border-slate-200"} ${
        interrupt ? "border-l-4 border-l-fuchsia-500" : ""
      }`}
    >
      <header className="mb-2 flex items-center gap-2">
        <span className="font-mono text-[11px] font-semibold text-slate-400">{turn.id}</span>
        <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${KIND_STYLE[turn.kind]}`}>{KIND_LABEL[turn.kind]}</span>
        {turn.kind === "edit" && (
          <span className="text-[11px] text-slate-400">
            {turn.files.length} {turn.files.length === 1 ? "file" : "files"}
          </span>
        )}
        {props.onInterruptHere && !interrupt && (
          <button
            type="button"
            onClick={props.onInterruptHere}
            className="ml-auto rounded px-2 py-0.5 text-[11px] font-medium text-fuchsia-700 opacity-0 transition hover:bg-fuchsia-50 group-hover:opacity-100 focus:opacity-100"
          >
            Interrupt here
          </button>
        )}
      </header>

      {turn.kind === "user" && <Prose text={turn.text} />}
      {(turn.kind === "preamble" || turn.kind === "reasoning") && (
        <div className={turn.kind === "reasoning" ? "border-l-2 border-violet-200 pl-3 italic" : ""}>
          <Prose text={turn.text} />
        </div>
      )}
      {turn.kind === "command" && <CommandBody turn={turn} />}
      {turn.kind === "read" && <ReadBody turn={turn} />}
      {turn.kind === "edit" && (
        <div className="space-y-2">
          {turn.files.map((f) => (
            <DiffBody key={f.path} path={f.path} diff={f.diff} />
          ))}
        </div>
      )}
      {turn.kind === "final" && (
        <FinalMessage
          text={turn.text}
          findings={props.findings}
          hovered={props.hoveredFinding}
          onHover={props.onHoverFinding}
        />
      )}

      {interrupt && (
        <div
          data-testid="interrupt-pin"
          className="mt-3 flex items-start gap-2 rounded-lg border border-fuchsia-200 bg-fuchsia-50 px-3 py-2 text-sm text-fuchsia-900"
        >
          <svg viewBox="0 0 16 16" className="mt-0.5 h-4 w-4 shrink-0 text-fuchsia-600" fill="currentColor" aria-hidden>
            <path d="M3 1.75a.75.75 0 0 1 1.5 0V2h8.1a.5.5 0 0 1 .4.8L11.3 5.25 13 7.7a.5.5 0 0 1-.4.8H4.5v5.75a.75.75 0 0 1-1.5 0V1.75Z" />
          </svg>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-fuchsia-600">Interrupt at {interrupt.turnId}</div>
            <p className="mt-0.5 leading-5">{interrupt.note}</p>
          </div>
          {props.onClearInterrupt && (
            <button
              type="button"
              onClick={props.onClearInterrupt}
              className="rounded px-2 py-0.5 text-xs font-medium text-fuchsia-700 hover:bg-fuchsia-100"
            >
              Clear
            </button>
          )}
        </div>
      )}
      {props.editor}

      {props.pinnedFindings.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {props.pinnedFindings.map((f) => (
            <span
              key={f.id}
              data-testid="finding-pin"
              onMouseEnter={() => props.onHoverFinding(f.id)}
              onMouseLeave={() => props.onHoverFinding(null)}
              className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] ${VERDICT_STYLE[f.verdict].pill}`}
              title={f.reason}
            >
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${VERDICT_STYLE[f.verdict].dot}`} />
              <span className="truncate">
                Accepted: &ldquo;{f.claim.length > 48 ? `${f.claim.slice(0, 47)}…` : f.claim}&rdquo;
              </span>
            </span>
          ))}
        </div>
      )}
    </article>
  );
}
