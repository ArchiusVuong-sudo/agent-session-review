import { runCheck, type CheckStreamEvent } from "@/lib/checker/service";
import { getDb } from "@/lib/db";
import { handle } from "@/lib/http";
import { getSession } from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Runs the claim check and streams it as NDJSON: one trace event per tool
 * call, then a done (findings) or error line. Writes only checks and findings.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/sessions/[id]/check">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const db = getDb();
    getSession(db, id);
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: CheckStreamEvent) => {
          try {
            controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
          } catch {
            // The client went away; the run still finishes and is saved.
          }
        };
        try {
          await runCheck(db, id, send, { signal: request.signal });
        } catch (error) {
          send({ type: "error", message: (error as Error).message });
        } finally {
          try {
            controller.close();
          } catch {
            // already closed
          }
        }
      },
    });
    return new Response(stream, {
      headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
    });
  });
}
