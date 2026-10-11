"use client";

import type { ReactNode } from "react";
import type { Finding } from "@/lib/types";
import { VERDICT_STYLE, inlineCode } from "./format";

interface Range {
  start: number;
  end: number;
  finding: Finding;
}

/** Where each finding's quote sits in the text; overlapping quotes keep the first. */
export function claimRanges(text: string, findings: readonly Finding[]): Range[] {
  const ranges: Range[] = [];
  for (const finding of findings) {
    if (finding.decision === "rejected") continue;
    const start = text.indexOf(finding.claim);
    if (start >= 0) ranges.push({ start, end: start + finding.claim.length, finding });
  }
  ranges.sort((a, b) => a.start - b.start);
  const kept: Range[] = [];
  for (const r of ranges) if (!kept.length || r.start >= kept[kept.length - 1]!.end) kept.push(r);
  return kept;
}

interface Props {
  text: string;
  findings: readonly Finding[];
  hovered: number | null;
  onHover: (id: number | null) => void;
}

function renderSegment(text: string, offset: number, ranges: Range[], props: Props, inCode: boolean): ReactNode[] {
  const out: ReactNode[] = [];
  let pos = 0;
  const end = text.length;
  for (const r of ranges) {
    const s = Math.max(r.start - offset, 0);
    const e = Math.min(r.end - offset, end);
    if (e <= 0 || s >= end) continue;
    if (s > pos) out.push(...(inCode ? [text.slice(pos, s)] : inlineCode(text.slice(pos, s), `p${offset}-${pos}`)));
    const style = VERDICT_STYLE[r.finding.verdict];
    const active = props.hovered === r.finding.id;
    out.push(
      <mark
        key={`m${r.finding.id}-${offset}`}
        data-testid={`claim-${r.finding.id}`}
        data-verdict={r.finding.verdict}
        onMouseEnter={() => props.onHover(r.finding.id)}
        onMouseLeave={() => props.onHover(null)}
        className={`rounded-sm px-0.5 text-inherit underline decoration-2 underline-offset-4 transition ${style.mark} ${
          active ? "ring-2 ring-offset-1 ring-indigo-400" : ""
        } ${r.finding.decision === "accepted" ? "font-medium" : ""}`}
        title={`${style.label}: ${r.finding.reason}`}
      >
        {text.slice(s, e)}
      </mark>,
    );
    pos = e;
  }
  if (pos < end) out.push(...(inCode ? [text.slice(pos)] : inlineCode(text.slice(pos), `p${offset}-${pos}`)));
  return out;
}

/** The final message with each checked claim highlighted in its verdict color. */
export function FinalMessage(props: Props) {
  const { text } = props;
  const ranges = claimRanges(text, props.findings);
  const blocks: { code: boolean; lang: string; body: string; offset: number }[] = [];
  const fence = /```([a-z]*)\n([\s\S]*?)```/g;
  let last = 0;
  for (const m of text.matchAll(fence)) {
    const idx = m.index ?? 0;
    if (idx > last) blocks.push({ code: false, lang: "", body: text.slice(last, idx), offset: last });
    const bodyOffset = idx + 3 + (m[1]?.length ?? 0) + 1;
    blocks.push({ code: true, lang: m[1] ?? "", body: m[2] ?? "", offset: bodyOffset });
    last = idx + m[0].length;
  }
  if (last < text.length) blocks.push({ code: false, lang: "", body: text.slice(last), offset: last });

  return (
    <div className="space-y-3 text-[14px] leading-6 text-slate-800">
      {blocks.map((block, i) =>
        block.code ? (
          <pre
            key={i}
            className="scroll-thin max-h-80 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-[12px] leading-5 text-slate-700"
          >
            {block.lang === "diff"
              ? block.body.split("\n").map((line, j) => (
                  <span
                    key={j}
                    className={`block ${line.startsWith("+") ? "text-emerald-700" : line.startsWith("-") ? "text-rose-700" : ""}`}
                  >
                    {line || " "}
                  </span>
                ))
              : renderSegment(block.body, block.offset, ranges, props, true)}
          </pre>
        ) : (
          block.body
            .split(/\n{2,}/)
            .reduce<{ nodes: ReactNode[]; offset: number }>(
              (acc, para) => {
                const at = text.indexOf(para, acc.offset);
                if (para.trim())
                  acc.nodes.push(
                    <p key={`${i}-${at}`} className="whitespace-pre-wrap">
                      {renderSegment(para, at, ranges, props, false)}
                    </p>,
                  );
                return { nodes: acc.nodes, offset: at + para.length };
              },
              { nodes: [], offset: block.offset },
            ).nodes
        ),
      )}
    </div>
  );
}
