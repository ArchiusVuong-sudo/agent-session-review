import { z } from "zod";
import { getDb } from "@/lib/db";
import { handle, readJson } from "@/lib/http";
import { clearInterrupt, setInterrupt } from "@/lib/repo";
import { TurnId } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ turnId: TurnId, note: z.string().trim().min(1, "Write the line you would say.").max(600) });

export async function PUT(request: Request, ctx: RouteContext<"/api/sessions/[id]/interrupt">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const body = await readJson(request, Body);
    return Response.json(setInterrupt(getDb(), id, body.turnId, body.note), { status: 201 });
  });
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/sessions/[id]/interrupt">) {
  return handle(async () => {
    const { id } = await ctx.params;
    clearInterrupt(getDb(), id);
    return new Response(null, { status: 204 });
  });
}
