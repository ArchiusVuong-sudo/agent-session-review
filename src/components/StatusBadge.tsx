import type { ReviewStatus } from "@/lib/types";

const STYLES: Record<ReviewStatus, { label: string; className: string }> = {
  not_started: { label: "Not started", className: "border-slate-200 bg-slate-50 text-slate-600" },
  draft: { label: "In progress", className: "border-sky-200 bg-sky-50 text-sky-700" },
  submitted: { label: "Submitted", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
};

export function StatusBadge({ status, seeded = false }: { status: ReviewStatus; seeded?: boolean }) {
  const style = STYLES[status];
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      {seeded && (
        <span
          className="rounded-full border border-slate-200 px-2 py-0.5 text-[11px] text-slate-500"
          title="A worked example review that ships with the demo. Synthetic, like the sessions."
        >
          Example
        </span>
      )}
      <span
        data-testid="status-badge"
        className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${style.className}`}
        title={status === "submitted" ? "Locked. Open it to export the Markdown." : undefined}
      >
        {style.label}
      </span>
    </span>
  );
}
