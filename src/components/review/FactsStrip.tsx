import { describeTestRuns, describeTestsAfterLastEdit, plural, type SessionFacts } from "@/lib/facts";

function Fact({ label, value, tone = "plain", title }: { label: string; value: string; tone?: "plain" | "good" | "bad"; title?: string }) {
  const toneClass =
    tone === "good" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : tone === "bad" ? "border-rose-200 bg-rose-50 text-rose-800" : "border-slate-200 bg-white text-slate-700";
  return (
    <div className={`rounded-lg border px-3 py-1.5 ${toneClass}`} title={title}>
      <div className="text-[10.5px] font-medium uppercase tracking-wide opacity-70">{label}</div>
      <div className="text-[13px] font-medium">{value}</div>
    </div>
  );
}

/** Computed from the turns, not from what the agent says. */
export function FactsStrip({ facts }: { facts: SessionFacts }) {
  const after = facts.testsAfterLastEdit;
  return (
    <div data-testid="facts-strip" className="flex flex-wrap items-stretch gap-2">
      <Fact label="Commands" value={plural(facts.commands, "command")} />
      <Fact label="Test runs" value={describeTestRuns(facts.testRuns)} />
      <Fact
        label="Files changed"
        value={plural(facts.filesChanged.length, "file") + " changed"}
        title={facts.filesChanged.join("\n") || "No edits"}
      />
      <Fact
        label="Tests after last edit"
        value={describeTestsAfterLastEdit(after)}
        tone={after.state === "yes" ? "good" : after.state === "no" ? "bad" : "plain"}
      />
    </div>
  );
}
