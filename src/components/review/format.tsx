import type { ReactNode } from "react";
import type { Verdict } from "@/lib/types";

export const VERDICT_STYLE: Record<Verdict, { label: string; pill: string; mark: string; dot: string }> = {
  supported: {
    label: "Supported",
    pill: "border-emerald-200 bg-emerald-50 text-emerald-700",
    mark: "bg-emerald-100 decoration-emerald-500",
    dot: "bg-emerald-500",
  },
  unsupported: {
    label: "Unsupported",
    pill: "border-amber-200 bg-amber-50 text-amber-800",
    mark: "bg-amber-100 decoration-amber-500",
    dot: "bg-amber-500",
  },
  contradicted: {
    label: "Contradicted",
    pill: "border-rose-200 bg-rose-50 text-rose-700",
    mark: "bg-rose-100 decoration-rose-500",
    dot: "bg-rose-500",
  },
};

export const TOPIC_LABEL: Record<string, string> = {
  tests: "Tests",
  root_cause: "Root cause",
  change: "Change",
  performance: "Performance",
  reliability: "Reliability",
  dependency: "Dependency",
  other: "Other",
};

/** Renders `inline code` spans; leaves text with unbalanced backticks as is. */
export function inlineCode(text: string, keyPrefix: string): ReactNode[] {
  const parts = text.split(/(`[^`\n]+`)/g);
  if (parts.length === 1) return [text];
  return parts.map((part, i) =>
    part.startsWith("`") && part.endsWith("`") && part.length > 2 ? (
      <code key={`${keyPrefix}-${i}`} className="rounded bg-slate-100 px-1 py-px font-mono text-[0.85em] text-slate-800">
        {part.slice(1, -1)}
      </code>
    ) : (
      part
    ),
  );
}

export function formatMs(ms: number): string {
  if (ms < 1) return `${ms.toFixed(1)} ms`;
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

export function formatTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}
