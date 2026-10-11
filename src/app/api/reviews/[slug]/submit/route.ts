import { getDb } from "@/lib/db";
import { handle } from "@/lib/http";
import { submitReview } from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: Request, ctx: RouteContext<"/api/reviews/[slug]/submit">) {
  return handle(async () => {
    const { slug } = await ctx.params;
    return Response.json(submitReview(getDb(), slug));
  });
}
