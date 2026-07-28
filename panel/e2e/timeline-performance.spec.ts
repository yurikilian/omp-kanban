import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";

const fixturePath = path.resolve(__dirname, "../tests/fixtures/sessions/large-session.jsonl");

// Written into the real OMP sessions root the production server reads from
// (`getSessionTimeline`/`getSessionDetail` resolve it via `os.homedir()`,
// with no test-only override) - the same place a real 2,000-event session
// would live, so this exercises the actual read path rather than a mock.
const SESSION_ID = "e2e-timeline-performance-fixture";
const PROJECT_DIR = "e2e-timeline-performance-project";
const sessionsRoot = path.join(os.homedir(), ".omp", "agent", "sessions");
const projectPath = path.join(sessionsRoot, PROJECT_DIR);
const sessionFilePath = path.join(projectPath, `${SESSION_ID}.jsonl`);

// The agreed budget: a real user waiting on a session detail page expects it
// to feel immediate, not merely "eventually done". Generous enough to
// absorb CI/dev-machine variance; tight enough that eagerly mounting the
// full 2,100-event transcript (which measurably takes several times this
// long to build and paint) blows it.
const INTERACTIVE_BUDGET_MS = 2000;

test.beforeAll(async () => {
  await fs.mkdir(projectPath, { recursive: true });
  const fixture = await fs.readFile(fixturePath, "utf8");
  await fs.writeFile(sessionFilePath, fixture, "utf8");
});

test.afterAll(async () => {
  await fs.rm(projectPath, { recursive: true, force: true });
});

test("a 2,000-event fixture timeline becomes interactive within the agreed budget (E3-S7-AC5)", async ({ page }) => {
  const start = Date.now();

  await page.goto(`/sessions/${SESSION_ID}`);
  await expect(page.locator('[data-slot="event-stream"]')).toBeVisible();

  // "Interactive" means the page responds to real input, not just that
  // some DOM painted - a scroll must actually move content.
  const before = await page.evaluate(() => window.scrollY);
  await page.mouse.wheel(0, 1200);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(before);

  const elapsed = Date.now() - start;
  expect(elapsed).toBeLessThan(INTERACTIVE_BUDGET_MS);
});

test("events stay in chronological order across a long scroll (E3-S7-AC5)", async ({ page }) => {
  await page.goto(`/sessions/${SESSION_ID}`);
  await expect(page.locator('[data-slot="event-stream"]')).toBeVisible();

  async function readVisibleTimestamps() {
    const values = await page.locator('[data-slot="event-stream"] time').evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("dateTime")).filter((value): value is string => Boolean(value)),
    );
    return values.map((value) => Date.parse(value));
  }

  const initial = await readVisibleTimestamps();
  expect(initial.length).toBeGreaterThan(0);
  expect(initial).toEqual([...initial].sort((a, b) => a - b));

  // At every point during a long scroll, the events currently mounted
  // must themselves already be in ascending chronological order - proving
  // the windowing never reorders or scrambles the transcript as it grows.
  for (let i = 0; i < 60; i++) {
    await page.mouse.wheel(0, 2000);
    await page.waitForTimeout(20);
    const visible = await readVisibleTimestamps();
    expect(visible).toEqual([...visible].sort((a, b) => a - b));
  }

  // And the scroll actually progressed through the transcript rather than
  // stalling on the same events near the top.
  const final = await readVisibleTimestamps();
  expect(Math.max(...final)).toBeGreaterThan(Math.max(...initial));
});