import { notFound } from "next/navigation";
import { ReviewWorkspace } from "@/components/review/ReviewWorkspace";
import { currentMode } from "@/lib/checker/mode";
import { checkModel } from "@/lib/checker/sdk-env";
import { loadRubric } from "@/lib/data/load";
import { getDb } from "@/lib/db";
import { computeFacts } from "@/lib/facts";
import { AppError, failedAfterDone, findingsForCheck, getInterrupt, getReview, getTask, getTaskSessions, latestDoneCheck } from "@/lib/repo";
import type { ReviewPageData } from "@/lib/view";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/review/[slug]">) {
  const { slug } = await params;
  try {
    return { title: `${getTask(getDb(), slug).title} · Agent Session Review` };
  } catch {
    return { title: "Agent Session Review" };
  }
}

export default async function ReviewPage({ params }: PageProps<"/review/[slug]">) {
  const { slug } = await params;
  const db = getDb();
  let task;
  try {
    task = getTask(db, slug);
  } catch (error) {
    if (error instanceof AppError && error.status === 404) notFound();
    throw error;
  }
  const mode = await currentMode();
  const data: ReviewPageData = {
    task,
    sessions: getTaskSessions(db, slug).map((s) => {
      const check = latestDoneCheck(db, s.id);
      return {
        id: s.id,
        label: s.label,
        turns: s.turns,
        facts: computeFacts(s.turns),
        interrupt: getInterrupt(db, s.id),
        check,
        findings: check ? findingsForCheck(db, check.id) : [],
        failed: failedAfterDone(db, s.id),
      };
    }),
    review: getReview(db, slug),
    rubric: loadRubric(),
    mode: { mode: mode.mode, model: checkModel() },
  };
  return <ReviewWorkspace data={data} />;
}
