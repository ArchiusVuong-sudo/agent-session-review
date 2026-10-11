import Link from "next/link";
import { notFound } from "next/navigation";
import { ExportView } from "@/components/export/ExportView";
import { getDb } from "@/lib/db";
import { exportFileName, gatherExport, renderExport } from "@/lib/export";
import { AppError, getReview, getTask } from "@/lib/repo";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/review/[slug]/export">) {
  const { slug } = await params;
  try {
    return { title: `Export: ${getTask(getDb(), slug).title} · Agent Session Review` };
  } catch {
    return { title: "Agent Session Review" };
  }
}

export default async function ExportPage({ params }: PageProps<"/review/[slug]/export">) {
  const { slug } = await params;
  const db = getDb();
  let task;
  try {
    task = getTask(db, slug);
  } catch (error) {
    if (error instanceof AppError && error.status === 404) notFound();
    throw error;
  }
  if (getReview(db, slug).status !== "submitted") {
    return (
      <main className="mx-auto w-full max-w-[720px] px-6 py-16 text-center">
        <h1 className="text-lg font-semibold">Nothing to export yet</h1>
        <p className="mt-2 text-sm text-slate-600">Submit the review for &ldquo;{task.title}&rdquo; first. Export works on submitted reviews only.</p>
        <Link href={`/review/${slug}`} className="mt-6 inline-block text-sm font-medium text-indigo-600 hover:text-indigo-800">
          ← Back to the review
        </Link>
      </main>
    );
  }
  const markdown = renderExport(gatherExport(db, slug));
  return <ExportView slug={slug} title={task.title} markdown={markdown} fileName={exportFileName(slug)} />;
}
