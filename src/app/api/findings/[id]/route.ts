import { z } from "zod";
import { getDb } from "@/lib/db";
import { handle, readJson } from "@/lib/http";
import { setDecision } from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ decision: z.enum(["accepted", "rejected"]).nullable() });

export async function PATCH(request: Request, ctx: RouteContext<"/api/findings/[id]">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const findingId = z.coerce.number().int().positive().parse(id);
    const body = await readJson(request, Body);
    return Response.json(setDecision(getDb(), findingId, body.decision));
  });
}
