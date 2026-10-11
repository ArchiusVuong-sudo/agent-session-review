import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const dir = mkdtempSync(join(tmpdir(), "asr-route-"));

beforeAll(() => {
  process.env.DATA_DIR = dir;
  process.env.CHECKER = "fake";
});
afterAll(() => {
  delete process.env.CHECKER;
  rmSync(dir, { recursive: true, force: true });
});

const ctx = (params: Record<string, string>) => ({ params: Promise.resolve(params) }) as never;

describe("check route", () => {
  it("streams NDJSON trace lines then the findings, and leaves the review untouched", async () => {
    const { POST } = await import("@/app/api/sessions/[id]/check/route");
    const { PUT } = await import("@/app/api/reviews/[slug]/route");
    const { getDb } = await import("@/lib/db");
    const draft = {
      scores: { A: { trust: 4 }, B: { trust: 1 } },
      preference: 2,
      rationale: "A backs its claims (t10).",
      feedback: { A: "Good.", B: "Weak." },
    };
    const saved = await PUT(new Request("http://x/api/reviews/ci-fails-scale-recipe", { method: "PUT", body: JSON.stringify(draft) }), ctx({ slug: "ci-fails-scale-recipe" }));
    expect(saved.status).toBe(200);
    const before = getDb().prepare("SELECT * FROM reviews").all();

    const res = await POST(new Request("http://x", { method: "POST" }), ctx({ id: "ci-fails-scale-recipe-b" }));
    expect(res.headers.get("content-type")).toMatch(/ndjson/);
    const lines = (await res.text()).trim().split("\n").map((l) => JSON.parse(l));
    expect(lines[0]).toMatchObject({ type: "trace", event: { type: "start", mode: "fake" } });
    expect(lines.filter((l) => l.type === "trace" && l.event.type === "tool")).toHaveLength(3);
    expect(lines.at(-1)).toMatchObject({ type: "done", check: { mode: "fake", status: "done" } });

    expect(getDb().prepare("SELECT * FROM reviews").all()).toEqual(before);
  });

  it("answers 404 for an unknown session and 400 for a bad draft", async () => {
    const { POST } = await import("@/app/api/sessions/[id]/check/route");
    const { PUT } = await import("@/app/api/reviews/[slug]/route");
    expect((await POST(new Request("http://x", { method: "POST" }), ctx({ id: "nope" }))).status).toBe(404);
    const bad = await PUT(
      new Request("http://x", { method: "PUT", body: JSON.stringify({ scores: { A: { trust: 9 }, B: {} } }) }),
      ctx({ slug: "ci-fails-scale-recipe" }),
    );
    expect(bad.status).toBe(400);
    const notJson = await PUT(new Request("http://x", { method: "PUT", body: "{" }), ctx({ slug: "ci-fails-scale-recipe" }));
    expect(notJson.status).toBe(400);
  });

  it("export answers 409 before submit", async () => {
    const { GET } = await import("@/app/api/reviews/[slug]/export/route");
    const res = await GET(new Request("http://x/api/reviews/list-rerenders-keystroke/export"), ctx({ slug: "list-rerenders-keystroke" }));
    expect(res.status).toBe(409);
  });
});
