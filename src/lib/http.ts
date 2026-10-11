import { ZodError, z } from "zod";
import { AppError } from "./repo";

/** Runs a route body and turns known errors into JSON responses with the right status. */
export async function handle(fn: () => Promise<Response> | Response): Promise<Response> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof AppError) return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof ZodError) return Response.json({ error: z.prettifyError(error) }, { status: 400 });
    if (error instanceof SyntaxError) return Response.json({ error: "Body is not valid JSON." }, { status: 400 });
    console.error(error);
    return Response.json({ error: "Something went wrong on the server." }, { status: 500 });
  }
}

export async function readJson<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  return schema.parse(await request.json());
}
