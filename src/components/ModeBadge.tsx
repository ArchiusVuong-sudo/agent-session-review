import type { ProviderMode } from "@/lib/types";

export function ModeBadge({ mode, model, reason }: { mode: ProviderMode; model: string; reason: string }) {
  if (mode === "fake") {
    return (
      <span
        data-testid="mode-badge"
        title={`Claim checks use a scripted runner (${reason}). For tests only.`}
        className="inline-flex items-center gap-1.5 rounded-full border border-violet-300 bg-violet-50 px-2.5 py-0.5 text-xs font-medium text-violet-800"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-violet-500" />
        Test mode
      </span>
    );
  }
  if (mode === "replay") {
    return (
      <span
        data-testid="mode-badge"
        title={`Claim checks replay recorded live runs (${reason}).`}
        className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
        Replay mode
      </span>
    );
  }
  return (
    <span
      data-testid="mode-badge"
      title={`Claim checks run live (${reason}).`}
      className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-800"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
      Live checks · <span className="font-mono">{model}</span>
    </span>
  );
}
