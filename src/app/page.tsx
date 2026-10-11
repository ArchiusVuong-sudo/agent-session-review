import Link from "next/link";
import { StatusBadge } from "@/components/StatusBadge";
import { SyntheticLabel } from "@/components/SyntheticLabel";
import { getDb } from "@/lib/db";
import { listQueue } from "@/lib/repo";

export const dynamic = "force-dynamic";

export default function QueuePage() {
  const queue = listQueue(getDb());
  const submitted = queue.filter((t) => t.status === "submitted").length;

  return (
    <main className="mx-auto w-full max-w-[1100px] px-6 py-10">
      <div className="flex items-end justify-between gap-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">Review queue</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Coding tasks, two agent sessions each</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Read both sessions, mark where you would have stopped the agent, check its claims against the tool log, then
            score each one on the rubric and write the feedback. The claim check only finds evidence: every score and every
            word of feedback is yours.
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <SyntheticLabel />
          <span className="text-xs text-slate-500">
            {submitted} of {queue.length} submitted
          </span>
        </div>
      </div>

      <ol className="mt-8 space-y-3" data-testid="queue">
        {queue.map((task, i) => (
          <li key={task.slug}>
            <Link
              href={`/review/${task.slug}`}
              data-testid={`task-${task.slug}`}
              className="group flex items-center gap-5 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm transition hover:border-indigo-300 hover:shadow-md focus-visible:outline-2 focus-visible:outline-indigo-500"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-sm font-semibold text-slate-500 group-hover:bg-indigo-50 group-hover:text-indigo-700">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="truncate font-medium text-slate-900">{task.title}</h2>
                </div>
                <p className="mt-0.5 truncate text-sm text-slate-500">{task.summary}</p>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                  <span className="font-mono text-slate-600">{task.repo}</span>
                  <span>{task.stack}</span>
                  {task.sessions.map((s) => (
                    <span key={s.id}>
                      Agent {s.label}: {s.turns} turns
                    </span>
                  ))}
                </div>
              </div>
              <StatusBadge status={task.status} seeded={task.seeded} />
              <span className="text-sm font-medium text-indigo-600 opacity-0 transition group-hover:opacity-100" aria-hidden>
                Open →
              </span>
            </Link>
          </li>
        ))}
      </ol>

      <p className="mt-8 text-xs leading-5 text-slate-500">
        Sessions are written for this demo to show quality levels side by side; the agents are named A and B. Task 1&apos;s
        commands and outputs come from a real run of a small fixture repo.
      </p>
    </main>
  );
}
