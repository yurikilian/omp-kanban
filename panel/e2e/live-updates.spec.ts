import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

interface SessionSummary {
  id: string;
  title: string;
  project: string;
  startedAt: string;
  lastActivityAt: string;
  durationMs: number;
  costUsd: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  agentCount: number;
  toolCallCount: number;
}

async function firstRecordedSession(page: Page): Promise<SessionSummary> {
  const response = await page.request.get("/api/sessions");
  expect(response.ok()).toBe(true);
  const sessions = (await response.json()) as SessionSummary[];
  test.skip(sessions.length === 0, "no recorded sessions on this machine to update");
  return sessions[0];
}

test("a live transcript change updates the row in place without a reload or route change (E3-S9-AC1)", async ({ page }) => {
  const session = await firstRecordedSession(page);
  const updatedTitle = `${session.title} live update`;
  const updatedSession = {
    ...session,
    title: updatedTitle,
    status: {
      label: "Running",
      derived: true,
      basis: "no terminal event",
    },
  };

  await page.route(`**/api/sessions/${encodeURIComponent(session.id)}`, (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(updatedSession),
    }),
  );
  await page.addInitScript((sessionId) => {
    class TestEventSource {
      constructor(_url: string) {}

      addEventListener(type: string, listener: EventListener) {
        if (type === "session-change") {
          listener(new MessageEvent("session-change", { data: JSON.stringify({ sessionId }) }));
        }
      }

      close() {}
    }

    Object.defineProperty(window, "EventSource", { configurable: true, value: TestEventSource });
  }, session.id);

  await page.goto("/sessions");
  const routeBeforeUpdate = page.url();
  let postLoadNavigations = 0;
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) postLoadNavigations += 1;
  });

  await expect(page.getByText(updatedTitle, { exact: true })).toBeVisible();

  expect(page.url()).toBe(routeBeforeUpdate);
  expect(postLoadNavigations).toBe(0);
});

test("the Sessions area opens one same-origin server-push stream without a polling loop (E3-S9-AC6)", async ({ page }) => {
  await firstRecordedSession(page);
  const streamRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/stream") {
      streamRequests.push(request.url());
    }
  });
  const streamResponse = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/stream");

  await page.goto("/sessions");
  const response = await streamResponse;

  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("text/event-stream");
  expect(streamRequests).toHaveLength(1);
  expect(new URL(streamRequests[0]).origin).toBe(new URL(page.url()).origin);
});