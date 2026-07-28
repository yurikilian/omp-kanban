// @vitest-environment node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { deriveSessionStatus, getSessionDetail } from "./detail";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesRoot = path.resolve(dirname, "../../../tests/fixtures/sessions/repository-root");

describe("deriveSessionStatus", () => {
  it("marks a transcript without a recorded status as derived from its missing exit event (E3-S6-AC2)", () => {
    const status = deriveSessionStatus(
      '{"type":"session","timestamp":"2026-01-01T09:00:00.000Z","cwd":"/work/alpha"}',
    );

    expect(status).toEqual({
      label: "Running",
      derived: true,
      basis: "no session exit event was recorded",
    });
  });

  it("derives completed, interrupted and failed labels from recorded exit events (E3-S6-AC2)", () => {
    expect(
      deriveSessionStatus(
        '{"type":"custom","customType":"session_exit","data":{"reason":"dispose","kind":"normal"}}',
      ),
    ).toEqual({
      label: "Completed",
      derived: true,
      basis: "a normal session exit event",
    });
    expect(
      deriveSessionStatus(
        '{"type":"custom","customType":"session_exit","data":{"reason":"sigterm","kind":"signal"}}',
      ),
    ).toEqual({
      label: "Interrupted",
      derived: true,
      basis: "a signal session exit event",
    });
    expect(
      deriveSessionStatus(
        '{"type":"custom","customType":"session_exit","data":{"reason":"uncaught_exception","kind":"fatal"}}',
      ),
    ).toEqual({
      label: "Failed",
      derived: true,
      basis: "a fatal session exit event",
    });
  });
});

describe("getSessionDetail", () => {
  it("loads the compact-header fields and folded metrics for one recorded session (E3-S6-AC1)", async () => {
    const detail = await getSessionDetail(
      "2026-01-01T10-00-00-000Z_00000000-0000-7000-8000-00000000000b",
      fixturesRoot,
    );

    expect(detail).toEqual({
      id: "2026-01-01T10-00-00-000Z_00000000-0000-7000-8000-00000000000b",
      title: "Coordinate parallel migration",
      project: "alpha",
      startedAt: "2026-01-01T10:00:00.000Z",
      lastActivityAt: "2026-01-01T10:07:00.000Z",
      durationMs: 7 * 60 * 1000,
      costUsd: 0.031,
      inputTokens: 3100,
      outputTokens: 600,
      agentCount: 3,
      toolCallCount: 5,
      status: {
        label: "Running",
        derived: true,
        basis: "no session exit event was recorded",
      },
    });
  });
});
