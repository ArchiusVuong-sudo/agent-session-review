import { SYNTHETIC_LABEL } from "@/lib/labels";

export function SyntheticLabel({ compact = false }: { compact?: boolean }) {
  return (
    <span
      data-testid="synthetic-label"
      title={SYNTHETIC_LABEL}
      className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-2.5 py-0.5 text-xs font-medium text-slate-600"
    >
      <svg viewBox="0 0 16 16" className="h-3 w-3 text-slate-400" fill="currentColor" aria-hidden>
        <path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM7.25 5a.75.75 0 1 1 1.5 0 .75.75 0 0 1-1.5 0Zm.1 2.25h1.3v4.5h-1.3v-4.5Z" />
      </svg>
      {compact ? "Synthetic" : SYNTHETIC_LABEL}
    </span>
  );
}
