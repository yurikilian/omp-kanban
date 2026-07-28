import { describe, expect, it } from "vitest";
import type { SessionSummary } from "@/server/sessions/types";
import { filterSessionsByQuery } from "./session-query";

function makeSession(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id: "2026-01-01T09-00-00-000Z_00000000-0000-7000-8000-000000000001",
    title: "Refactor billing module",
    project: "alpha-project",
    startedAt: "2026-01-01T09:00:00.000Z",
    lastActivityAt: "2026-01-01T09:10:00.000Z",
    durationMs: 600_000,
    costUsd: 1.5,
    inputTokens: 100,
    outputTokens: 20,
    agentCount: 1,
    toolCallCount: 1,
    ...overrides,
  };
}

describe("filterSessionsByQuery", () => {
  it("matches a substring of the title case-insensitively (E3-S2-AC1)", () => {
    const target = makeSession({ id: "s-1", title: "Refactor Billing Module" });
    const other = makeSession({ id: "s-2", title: "Unrelated session" });

    expect(filterSessionsByQuery([target, other], "billing")).toEqual([target]);
    expect(filterSessionsByQuery([target, other], "BILLING")).toEqual([target]);
  });

  it("matches a substring of the project case-insensitively (E3-S2-AC1)", () => {
    const target = makeSession({ id: "s-1", project: "Omp-Panel" });
    const other = makeSession({ id: "s-2", project: "unrelated-project" });

    expect(filterSessionsByQuery([target, other], "omp-panel")).toEqual([target]);
  });

  it("matches a substring of the session id case-insensitively (E3-S2-AC1)", () => {
    const target = makeSession({ id: "2026-01-01T09-00-00-000Z_ABCDEF01" });
    const other = makeSession({ id: "2026-01-02T09-00-00-000Z_ffffffff" });

    expect(filterSessionsByQuery([target, other], "abcdef01")).toEqual([target]);
  });

  it("matches a substring anywhere in the field, not only a prefix", () => {
    const target = makeSession({ id: "s-1", title: "Nightly regression sweep" });
    const other = makeSession({ id: "s-2", title: "Unrelated" });

    expect(filterSessionsByQuery([target, other], "regression")).toEqual([target]);
  });

  it("returns every session, in the same order, for an empty or whitespace-only query", () => {
    const sessions = [makeSession({ id: "s-1" }), makeSession({ id: "s-2" })];

    expect(filterSessionsByQuery(sessions, "")).toEqual(sessions);
    expect(filterSessionsByQuery(sessions, "   ")).toEqual(sessions);
  });

  it("returns an empty array when no session matches (E3-S2-AC2)", () => {
    const sessions = [makeSession({ id: "s-1", title: "Alpha", project: "alpha" })];

    expect(filterSessionsByQuery(sessions, "zzz-does-not-exist")).toEqual([]);
  });

  it("trims surrounding whitespace from the query before matching", () => {
    const target = makeSession({ id: "s-1", title: "Billing sync" });

    expect(filterSessionsByQuery([target], "  billing  ")).toEqual([target]);
  });
});
