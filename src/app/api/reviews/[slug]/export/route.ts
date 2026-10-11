import { getDb } from "@/lib/db";
import { exportFileName, gatherExport, renderExport } from "@/lib/export";
import { handle } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The submitted review as Markdown; ?download=1 serves it as a file. */
export async function GET(request: Request, ctx: RouteContext<"/api/reviews/[slug]/export">) {
  return handle(async () => {
    const { slug } = await ctx.params;
    const markdown = renderExport(gatherExport(getDb(), slug));
    const download = new URL(request.url).searchParams.get("download") === "1";
    return new Response(markdown, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Cache-Control": "no-store",
        ...(download ? { "Content-Disposition": `attachment; filename="${exportFileName(slug)}"` } : {}),
      },
    });
  });
}
