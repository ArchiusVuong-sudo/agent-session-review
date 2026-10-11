import { getDb } from "@/lib/db";
import { handle, readJson } from "@/lib/http";
import { getReview, getTask, saveDraft } from "@/lib/repo";
import { ReviewDraft } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, ctx: RouteContext<"/api/reviews/[slug]">) {
  return handle(async () => {
    const { slug } = await ctx.params;
    const db = getDb();
    getTask(db, slug);
    return Response.json(getReview(db, slug));
  });
}

/** Saves the reviewer's draft. Refused with 409 once the review is submitted. */
export async function PUT(request: Request, ctx: RouteContext<"/api/reviews/[slug]">) {
  return handle(async () => {
    const { slug } = await ctx.params;
    const draft = await readJson(request, ReviewDraft);
    return Response.json(saveDraft(getDb(), slug, draft));
  });
}
