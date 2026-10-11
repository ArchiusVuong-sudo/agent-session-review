/**
 * Replays the Task 1 sessions on a temp copy of fixture-repos/meal-planner
 * and records the real command output and diffs into data/captured/task1.json.
 * The session text is written by hand; these outputs come from real runs.
 *
 *   npx tsx scripts/capture-task1.ts
 */
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const FIXTURE = join(ROOT, "fixture-repos/meal-planner");
const VITEST = join(ROOT, "node_modules/vitest/vitest.mjs");
const SHOWN_ROOT = "~/meal-planner";

interface Captured {
  command?: string;
  exitCode?: number;
  output?: string;
  diff?: string;
  path?: string;
}

function sh(cwd: string, cmd: string, args: string[]): { code: number; out: string } {
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8", env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0", CI: "" } });
  return { code: r.status ?? 1, out: `${r.stdout}${r.stderr}` };
}

function setup(): { dir: string; cleanup: () => void } {
  const base = mkdtempSync(join(tmpdir(), "capture-"));
  const dir = join(base, "meal-planner");
  cpSync(FIXTURE, dir, { recursive: true });
  symlinkSync(join(ROOT, "node_modules"), join(dir, "node_modules"));
  sh(dir, "git", ["init", "-q", "-b", "main"]);
  // Staged, never committed: each edit's diff is the working tree against the index.
  sh(dir, "git", ["add", "-A"]);
  return { dir, cleanup: () => rmSync(base, { recursive: true, force: true }) };
}

function normalize(text: string, dir: string): string {
  return text
    .replaceAll(`/private${dir}`, SHOWN_ROOT)
    .replaceAll(dir, SHOWN_ROOT)
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();
}

function run(dir: string, shown: string, args: string[]): Captured {
  // One pipe for stdout and stderr keeps the order a terminal would show.
  const r = sh(dir, "/bin/sh", ["-c", 'exec "$@" 2>&1', "sh", process.execPath, VITEST, ...args]);
  return { command: shown, exitCode: r.code, output: normalize(r.out, dir) };
}

function edit(dir: string, path: string, change: (src: string) => string): Captured {
  const file = join(dir, path);
  const before = readFileSync(file, "utf8");
  const after = change(before);
  if (after === before) throw new Error(`edit on ${path} changed nothing`);
  writeFileSync(file, after);
  const diff = sh(dir, "git", ["diff", "--no-color", "-U2", "--", path]).out;
  sh(dir, "git", ["add", "-A"]);
  return { path, diff: diff.split("\n").slice(4).join("\n").trimEnd() };
}

function replaceOnce(src: string, from: string, to: string): string {
  if (!src.includes(from)) throw new Error(`missing text: ${from.slice(0, 40)}`);
  return src.replace(from, to);
}

const SEED = "4817";

function sessionA(): Record<string, Captured> {
  const { dir, cleanup } = setup();
  try {
    const out: Record<string, Captured> = {};
    out.t3 = run(dir, `npx vitest run --sequence.shuffle --sequence.seed=${SEED}`, ["run", "--sequence.shuffle", `--sequence.seed=${SEED}`]);
    out.t4 = run(dir, "npx vitest run", ["run"]);
    out.t7 = edit(dir, "test/meal-plan.test.ts", (src) =>
      replaceOnce(
        src,
        `  it("keeps ingredients that appear once", () => {`,
        `  it("does not change its input", () => {
    const toast = { name: "toast", servings: 1, ingredients: [{ name: "bread", qty: 2, unit: "slice" }] };
    buildShoppingList([toast, toast]);
    expect(toast.ingredients[0]?.qty).toBe(2);
  });

  it("keeps ingredients that appear once", () => {`,
      ),
    );
    out.t8 = run(dir, `npx vitest run -t "does not change its input"`, ["run", "-t", "does not change its input"]);
    out.t9 = edit(dir, "src/shopping-list.ts", (src) =>
      replaceOnce(src, "byName.set(item.name, item);", "byName.set(item.name, { ...item });"),
    );
    out.t10 = run(dir, `npx vitest run --sequence.shuffle --sequence.seed=${SEED}`, ["run", "--sequence.shuffle", `--sequence.seed=${SEED}`]);
    out.t11 = run(dir, "npx vitest run", ["run"]);
    return out;
  } finally {
    cleanup();
  }
}

function sessionB(): Record<string, Captured> {
  const { dir, cleanup } = setup();
  try {
    const out: Record<string, Captured> = {};
    out.t3 = run(dir, "npx vitest run -t scaleRecipe", ["run", "-t", "scaleRecipe"]);
    out.t5 = edit(dir, "vitest.config.ts", (src) =>
      replaceOnce(src, `    include: ["test/**/*.test.ts"],`, `    include: ["test/**/*.test.ts"],\n    retry: 3,\n    testTimeout: 20000,`),
    );
    out.t6 = edit(dir, "test/meal-plan.test.ts", (src) =>
      replaceOnce(
        src,
        `describe("scaleRecipe", () => {
  it("scales pancakes to 4 servings", () => {
    const scaled = scaleRecipe(pancakes, 4);
    expect(qtyOf(scaled.ingredients, "eggs")).toBe(4);
    expect(qtyOf(scaled.ingredients, "flour")).toBe(400);
  });

  it("keeps the recipe name", () => {
    expect(scaleRecipe(pancakes, 6).name).toBe("pancakes");
  });
});`,
        `describe("scaleRecipe", () => {
  const recipe = () => ({
    name: "pancakes",
    servings: 2,
    ingredients: [
      { name: "flour", qty: 200, unit: "g" },
      { name: "eggs", qty: 2, unit: "" },
    ],
  });

  it("scales pancakes to 4 servings", () => {
    const scaled = scaleRecipe(recipe(), 4);
    expect(qtyOf(scaled.ingredients, "eggs")).toBe(4);
    expect(qtyOf(scaled.ingredients, "flour")).toBe(400);
  });

  it("keeps the recipe name", () => {
    expect(scaleRecipe(recipe(), 6).name).toBe("pancakes");
  });
});`,
      ),
    );
    return out;
  } finally {
    cleanup();
  }
}

const captured = { note: "Real output from scripts/capture-task1.ts on fixture-repos/meal-planner.", seed: SEED, a: sessionA(), b: sessionB() };
mkdirSync(join(ROOT, "data/captured"), { recursive: true });
writeFileSync(join(ROOT, "data/captured/task1.json"), `${JSON.stringify(captured, null, 2)}\n`);
for (const [session, turns] of [["a", captured.a], ["b", captured.b]] as const) {
  for (const [id, c] of Object.entries(turns)) {
    console.log(`${session}.${id}`, c.command ? `exit ${c.exitCode}` : `diff ${c.path}`);
  }
}
