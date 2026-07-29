import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";

const SESSION_ID = "e2e-session-agent-scope";
const projectPath = path.join(os.homedir(), ".omp", "agent", "sessions", "e2e-agent-scope-project");
const sessionFilePath = path.join(projectPath, `${SESSION_ID}.jsonl`);
const agentDirectoryPath = path.join(projectPath, SESSION_ID);

const mainTranscript = [
  JSON.stringify({ type: "title", title: "Agent scope session", updatedAt: "2026-03-01T00:00:00.000Z" }),
  JSON.stringify({ type: "session", version: 3, id: SESSION_ID, timestamp: "2026-03-01T00:00:00.000Z", cwd: "/work/agent-scope" }),
  JSON.stringify({
    type: "message",
    id: "main-response",
    timestamp: "2026-03-01T00:01:00.000Z",
    message: { role: "assistant", content: [{ type: "text", text: "Main response" }] },
  }),
  JSON.stringify({
    type: "message",
    id: "spawn-developer",
    timestamp: "2026-03-01T00:02:00.000Z",
    message: {
      role: "toolResult",
      toolName: "task",
      content: [{ type: "text", text: "Spawned agent `developer`" }],
    },
  }),
].join("\n");

const developerTranscript = [
  JSON.stringify({ type: "session", version: 3, timestamp: "2026-03-01T00:03:00.000Z", cwd: "/work/agent-scope" }),
  JSON.stringify({
    type: "message",
    id: "child-response",
    timestamp: "2026-03-01T00:04:00.000Z",
    message: { role: "assistant", content: [{ type: "text", text: "Developer response" }] },
  }),
].join("\n");

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await fs.mkdir(agentDirectoryPath, { recursive: true });
  await Promise.all([
    fs.writeFile(sessionFilePath, mainTranscript, "utf8"),
    fs.writeFile(path.join(agentDirectoryPath, "developer.jsonl"), developerTranscript, "utf8"),
  ]);
});

test.afterAll(async () => {
  await fs.rm(projectPath, { recursive: true, force: true });
});

test("selecting an agent scopes its timeline branch and restores it from the URL (E3-S8-AC3)", async ({ page }) => {
  await page.goto(`/sessions/${SESSION_ID}`);

  await expect(page.locator('[data-slot="event-stream"]')).toBeVisible();
  await page.getByRole("button", { name: "Scope timeline to developer" }).click();

  await expect(page).toHaveURL(new RegExp(`/sessions/${SESSION_ID}\\?agent=developer$`));
  await expect(page.locator('[data-event-id="developer:child-response"]')).toBeVisible();
  await expect(page.locator('[data-event-id="main:main-response"]')).toHaveCount(0);

  await page.reload();

  await expect(page.getByRole("button", { name: "Scope timeline to developer", pressed: true })).toBeVisible();
  await expect(page.locator('[data-event-id="developer:child-response"]')).toBeVisible();
  await expect(page.locator('[data-event-id="main:main-response"]')).toHaveCount(0);
});