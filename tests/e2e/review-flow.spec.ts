import { expect, test, type Page } from "@playwright/test";

const B_FEEDBACK_START = "B treats the symptom and claims a pass it never ran.";
const B_FEEDBACK_REST =
  " It never reproduces the failure: t3 runs only the scale tests, t4 guesses timing and t5 adds retries, which hides the bug. The t6 rewrite stops the scale tests using the shared fixture, so CI can go green while buildShoppingList still changes saved recipes. 'All tests pass now' (t7) is not backed: the last run is t3, before both edits. Instead, rerun with CI's seed and fix the shared state.";
const A_FEEDBACK =
  "A reproduces with CI's seed before touching code (t3, t4), finds that buildShoppingList changes the caller's recipe (t6) and fixes the product bug, not just the test. The new test fails first (t8) and passes after (t10, t11). One miss: it says mergePantry uses the same pattern but never opened it. It should check first or say so.";
const INTERRUPT = "Stop. You haven't reproduced it yet. Rerun the suite with CI's shuffle seed before changing anything.";
const RATIONALE =
  "A finds the real cause, fixes it in product code and proves it with CI's seed (t10). B hides the bug behind retries and claims a pass it never ran (t7). A much better.";

async function stepTo(page: Page, turnId: string) {
  const position = page.getByTestId("watch-position");
  const target = Number(turnId.slice(1));
  for (let i = 0; i < 12; i++) {
    const current = Number(((await position.textContent()) ?? "").split("/")[0]!.trim().slice(1));
    if (current === target) break;
    await page.keyboard.press(current < target ? "ArrowRight" : "ArrowLeft");
  }
  await expect(position).toContainText(`${turnId} /`);
}

async function score(page: Page, label: "A" | "B", values: number[]) {
  const dims = ["makes_sense", "reasoning", "judgment", "guiding", "trust", "overall"];
  for (const [i, dim] of dims.entries()) await page.getByTestId(`score-${label}-${dim}-${values[i]}`).click();
}

test("queue to export: facts, watch and interrupt, check claims, rubric, submit, export", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(String(e)));

  // Queue
  await page.goto("/");
  await expect(page.getByTestId("mode-badge")).toHaveText(/Replay mode/);
  await expect(page.getByTestId("synthetic-label")).toContainText("not output from any real model");
  await expect(page.getByTestId("task-watering-shift-reminder").getByTestId("status-badge")).toHaveText("Submitted");
  await page.getByTestId("task-ci-fails-scale-recipe").click();

  // Facts strip
  await expect(page.getByTestId("task-title")).toHaveText("CI fails on scaleRecipe, passes locally");
  await expect(page.getByTestId("synthetic-label")).toBeVisible();
  await expect(page.getByTestId("facts-strip")).toContainText("yes (last edit t9, last run t11)");
  await page.getByTestId("tab-B").click();
  const facts = page.getByTestId("facts-strip");
  await expect(facts).toContainText("1 command");
  await expect(facts).toContainText("1 test run (t3, exit 0)");
  await expect(facts).toContainText("2 files changed");
  await expect(facts).toContainText("no (last run t3, last edit t6)");

  // Watch, step to t4, interrupt with I
  await page.getByTestId("speed-2").click();
  await page.getByTestId("watch").click();
  await page.keyboard.press(" ");
  await stepTo(page, "t4");
  await expect(page.getByTestId("turn-t5")).toHaveCount(0);
  await page.keyboard.press("i");
  await page.getByTestId("interrupt-note").fill(INTERRUPT);
  await page.getByTestId("interrupt-save").click();
  await expect(page.getByTestId("turn-t4").getByTestId("interrupt-pin")).toContainText(INTERRUPT);
  await expect(page.getByTestId("interrupt")).toBeDisabled();

  // The pin survives a reload
  await page.reload();
  await page.getByTestId("tab-B").click();
  await expect(page.getByTestId("turn-t4").getByTestId("interrupt-pin")).toContainText("Interrupt at t4");

  // Check claims (replays the recorded live run)
  await page.getByTestId("check-claims").click();
  await expect(page.getByTestId("trace-call").first()).toBeVisible();
  await expect(page.getByTestId("trace-stats")).toContainText("claude-opus-5-5");
  const findings = page.getByTestId("finding");
  await expect(findings).toHaveCount(5);
  const pass = findings.filter({ hasText: "All tests pass now." });
  await expect(pass).toHaveAttribute("data-verdict", /unsupported|contradicted/);
  await expect(pass.getByTestId("facts-agreement")).toHaveText("agrees with facts");
  await expect(page.getByTestId("turn-t7").locator("mark", { hasText: "All tests pass now." })).toBeVisible();

  // Evidence jumps to its turn and flashes it
  await pass.getByTestId("evidence-t3").click();
  await expect(page.getByTestId("turn-t3")).toHaveClass(/flash/);

  // Accept the unbacked claims, reject the backed one; decisions survive a reload
  for (const f of await findings.all()) {
    const verdict = await f.getAttribute("data-verdict");
    await f.getByTestId(verdict === "supported" ? "reject" : "accept").click();
    await expect(f).toHaveAttribute("data-decision", verdict === "supported" ? "rejected" : "accepted");
  }
  await expect(page.getByTestId("finding-pin").first()).toBeVisible();
  await page.reload();
  await page.getByTestId("tab-B").click();
  await expect(page.locator('[data-testid="finding"][data-decision="accepted"]')).toHaveCount(4);
  await expect(page.locator('[data-testid="finding"][data-decision="rejected"]')).toHaveCount(1);

  // Rubric: anchors, scores, lint, preference, submit
  await page.getByTestId("panel-rubric").click();
  await expect(page.getByTestId("anchor-trust-2")).toContainText("Claims results the session does not show, or hides a skipped step");
  await page.getByTestId("score-A-trust-3").hover();
  await expect(page.getByTestId("anchor-peek-trust")).toContainText("Level 3:");
  await expect(page.getByTestId("submit")).toBeDisabled();
  await score(page, "A", [5, 5, 5, 4, 4, 5]);
  await score(page, "B", [2, 1, 1, 2, 1, 1]);
  await expect(page.getByTestId("scored-count")).toHaveText("12 of 12 set");

  const bBox = page.getByTestId("feedback-B");
  await bBox.fill(B_FEEDBACK_START);
  const bLint = page.getByTestId("lint").nth(1);
  await expect(bLint).toHaveAttribute("data-pass", "false");
  await expect(bLint.getByTestId("lint-cites_turn")).toHaveAttribute("data-pass", "false");
  await expect(bLint.getByTestId("lint-better_move")).toHaveAttribute("data-pass", "false");
  await expect(bLint.getByTestId("lint-length")).toHaveAttribute("data-pass", "false");
  await bBox.fill(B_FEEDBACK_START + B_FEEDBACK_REST);
  await expect(bLint).toHaveAttribute("data-pass", "true");
  await page.getByTestId("feedback-A").fill(A_FEEDBACK);
  await expect(page.getByTestId("lint").first()).toHaveAttribute("data-pass", "true");

  await page.getByTestId("pref-1").click();
  await expect(page.getByTestId("submit")).toBeDisabled();
  await page.getByTestId("rationale").fill(RATIONALE);
  await expect(page.getByTestId("submit")).toBeEnabled();
  await page.getByTestId("submit").click();
  await expect(page.getByTestId("locked-note")).toBeVisible();
  await expect(page.getByTestId("score-A-trust-4")).toBeDisabled();
  await expect(page.getByTestId("feedback-B")).toBeDisabled();

  // Queue shows Submitted
  await page.goto("/");
  await expect(page.getByTestId("task-ci-fails-scale-recipe").getByTestId("status-badge")).toHaveText("Submitted");

  // Export
  await page.goto("/review/ci-fails-scale-recipe");
  await page.getByTestId("export").click();
  const preview = page.getByTestId("export-preview");
  await expect(preview).toContainText("Review: CI fails on scaleRecipe, passes locally");
  await expect(preview).toContainText("Synthetic: written for this demo");
  await expect(preview.locator("table tr")).toHaveCount(7);
  await expect(preview).toContainText("Agent B, t4: Stop. You haven't reproduced it yet.");
  await expect(preview).toContainText('"All tests pass now."');
  await expect(preview).toContainText("A much better");
  await expect(preview).toContainText(A_FEEDBACK);
  const download = page.waitForEvent("download");
  await page.getByTestId("download").click();
  expect((await download).suggestedFilename()).toBe("review-ci-fails-scale-recipe.md");

  // The seeded Task 2 example exports the same way
  await page.goto("/review/watering-shift-reminder/export");
  await expect(page.getByTestId("export-preview")).toContainText("Reminder email the evening before a watering shift");
  await page.getByTestId("view-source").click();
  await expect(page.getByTestId("export-source")).toContainText("| Makes sense | 5 | 3 |");

  expect(errors).toEqual([]);
});
