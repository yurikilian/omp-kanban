import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import { once } from "node:events";
import os from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";

const SESSION_ID = "e2e-session-deep-link";
const projectPath = path.join(os.homedir(), ".omp", "agent", "sessions", "e2e-deep-link-project");
const sessionFilePath = path.join(projectPath, `${SESSION_ID}.jsonl`);

const transcript = [
  JSON.stringify({ type: "title", title: "Deep-link session", updatedAt: "2026-03-01T00:00:00.000Z" }),
  JSON.stringify({ type: "session", version: 3, id: SESSION_ID, timestamp: "2026-03-01T00:00:00.000Z", cwd: "/work/deep-link" }),
  ...Array.from({ length: 33 }, (_, index) =>
    JSON.stringify({
      type: "message",
      id: `m${index + 1}`,
      parentId: index === 0 ? null : `m${index}`,
      timestamp: `2026-03-01T00:${String(index + 1).padStart(2, "0")}:00.000Z`,
      message: { role: "user", content: [{ type: "text", text: `Deep-link prompt ${index + 1}` }] },
    }),
  ),
].join("\n");

// Each test starts and removes the same on-disk session fixture.
test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await fs.mkdir(projectPath, { recursive: true });
  await fs.writeFile(sessionFilePath, transcript, "utf8");
});

test.afterAll(async () => {
  await fs.rm(projectPath, { recursive: true, force: true });
});

test("selecting an event updates the URL without navigating the page (E3-S10-AC1)", async ({ page }) => {
  await page.goto(`/sessions/${SESSION_ID}`);
  await expect(page.locator('[data-slot="event-stream"]')).toBeVisible();

  await page.evaluate(() => {
    document.body.dataset.eventSelectionMarker = "existing-document";
  });
  await page.locator('[data-event-id="main:m1"]').click();

  await expect(page).toHaveURL(new RegExp(`/sessions/${SESSION_ID}\\?event=main%3Am1$`));
  await expect(page.getByRole("complementary", { name: "Selected event" })).toContainText("Deep-link prompt 1");
  await expect(page.locator("body")).toHaveAttribute("data-event-selection-marker", "existing-document");
});

test("a fresh deep link selects, reveals, and inspects its event from disk (E3-S10-AC2, E3-S10-AC4)", async ({ page }) => {
  await page.goto(`/sessions/${SESSION_ID}?event=main%3Am33`);

  const selectedEvent = page.locator('[data-event-id="main:m33"]');
  await expect(selectedEvent).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Selected event" })).toContainText("Deep-link prompt 33");

  const bounds = await selectedEvent.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(await page.evaluate(() => window.innerHeight));
});

test("an absent deep-link event keeps the session open and explains what happened (E3-S10-AC3)", async ({ page }) => {
  await page.goto(`/sessions/${SESSION_ID}?event=main%3Amissing`);

  await expect(page.getByRole("heading", { name: "Deep-link session" })).toBeVisible();
  await expect(page.getByText('The event "main:missing" could not be found in this session.', { exact: true })).toBeVisible();
});

test("a deep link captured before a runtime restart resolves from the persisted transcript (E3-S10-AC4)", async ({ page }) => {
  const port = 4174;
  const runtime = spawn(process.execPath, ["runtime/start.mjs"], {
    cwd: path.resolve(__dirname, ".."),
    env: { ...process.env, PORT: String(port) },
    stdio: "ignore",
  });

  try {
    await expect
      .poll(
        async () => {
          try {
            return (await fetch(`http://127.0.0.1:${port}/internal/health`)).status;
          } catch {
            return 0;
          }
        },
        { timeout: 15_000 },
      )
      .toBe(200);

    await page.goto(`http://127.0.0.1:${port}/sessions/${SESSION_ID}?event=main%3Am33`);
    await expect(page.getByRole("complementary", { name: "Selected event" })).toContainText("Event: main:m33");
  } finally {
    if (runtime.exitCode === null) {
      runtime.kill("SIGTERM");
      await once(runtime, "exit");
    }
  }
});