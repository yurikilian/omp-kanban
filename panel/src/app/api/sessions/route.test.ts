// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionSummary } from "@/server/sessions/types";

const listSessionSummaries = vi.fn();

// The repository owns real filesystem access (a legitimate mock boundary);
// this suite's job is only the HTTP-shape contract the route adds on top
// of whatever the repository resolves. vi.mock is hoisted above imports by
// Vitest, so the static import of GET below already resolves against the
// mocked repository.
vi.mock("@/server/sessions/repository", () => ({
  listSessionSummaries: (...args: unknown[]) => listSessionSummaries(...args),
}));

import { GET } from "./route";

const FIXTURE_SESSION: SessionSummary = {
  id: "2026-01-01T00-00-00-000Z_fixture",
  title: "Fixture session",
  project: "fixture-project",
  startedAt: "2026-01-01T00:00:00.000Z",
  lastActivityAt: "2026-01-01T00:05:00.000Z",
  durationMs: 300_000,
  costUsd: 0.05,
  inputTokens: 1000,
  outputTokens: 200,
  agentCount: 2,
  toolCallCount: 4,
};

beforeEach(() => {
  listSessionSummaries.mockReset();
});

describe("GET /api/sessions", () => {
  it("responds 200 with the sessions the repository resolves", async () => {
    listSessionSummaries.mockResolvedValue([FIXTURE_SESSION]);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual([FIXTURE_SESSION]);
  });

  it("carries no nested stats envelope, acpId, live or busy field (E3-S1-AC6)", async () => {
    listSessionSummaries.mockResolvedValue([FIXTURE_SESSION]);

    const response = await GET();
    const [session] = await response.json();

    expect(session).not.toHaveProperty("stats");
    expect(session).not.toHaveProperty("acpId");
    expect(session).not.toHaveProperty("live");
    expect(session).not.toHaveProperty("busy");
    expect(Object.keys(session).sort()).toEqual(
      [
        "id",
        "title",
        "project",
        "startedAt",
        "lastActivityAt",
        "durationMs",
        "costUsd",
        "inputTokens",
        "outputTokens",
        "agentCount",
        "toolCallCount",
      ].sort(),
    );
  });

  it("responds with an error status instead of throwing when the sessions root cannot be read", async () => {
    listSessionSummaries.mockRejectedValue(new Error("ENOENT: no such directory"));

    const response = await GET();

    expect(response.status).toBeGreaterThanOrEqual(500);
  });
});
