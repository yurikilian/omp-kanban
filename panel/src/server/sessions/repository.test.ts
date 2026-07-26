// @vitest-environment node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listSessionSummaries } from "./repository";
import type { SessionSummary } from "./types";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesRoot = path.resolve(dirname, "../../../tests/fixtures/sessions/repository-root");

function findById(summaries: SessionSummary[], idSuffix: string): SessionSummary {
  const found = summaries.find((s) => s.id.endsWith(idSuffix));
  if (!found) throw new Error(`fixture session ending in ${idSuffix} not found`);
  return found;
}

describe("listSessionSummaries", () => {
  it("lists one summary per real session across every project, newest first (E3-S1-AC1)", async () => {
    const summaries = await listSessionSummaries(fixturesRoot);

    // 4 real sessions: A, B (with 2 sub-agents), C, D. The "incomplete"
    // file with no session header is excluded (see below).
    expect(summaries).toHaveLength(4);
    expect(summaries.map((s) => s.id.slice(-1))).toEqual(["d", "c", "b", "a"]);
  });

  it("carries title, project, last activity, duration, cost, tokens, agent count and tool calls for a plain session", async () => {
    const summaries = await listSessionSummaries(fixturesRoot);
    const sessionA = findById(summaries, "00000000-0000-7000-8000-00000000000a");

    expect(sessionA).toEqual({
      id: "2026-01-01T09-00-00-000Z_00000000-0000-7000-8000-00000000000a",
      title: "Refactor billing module",
      project: "alpha",
      startedAt: "2026-01-01T09:00:00.000Z",
      lastActivityAt: "2026-01-01T09:10:00.000Z",
      durationMs: 10 * 60 * 1000,
      costUsd: 0.015,
      inputTokens: 1500,
      outputTokens: 300,
      agentCount: 1,
      toolCallCount: 1,
    });
  });

  it("resolves the project label from the session's real cwd, not the on-disk directory slug", async () => {
    const summaries = await listSessionSummaries(fixturesRoot);
    const sessionA = findById(summaries, "00000000-0000-7000-8000-00000000000a");

    // The fixture directory is named "project-alpha"; the session's real
    // cwd is "/work/alpha", so the displayed project must be "alpha".
    expect(sessionA.project).toBe("alpha");
  });

  it("folds sibling sub-agent transcripts into the parent's totals (E3-S1-AC3)", async () => {
    const summaries = await listSessionSummaries(fixturesRoot);
    const sessionB = findById(summaries, "00000000-0000-7000-8000-00000000000b");

    expect(sessionB.agentCount).toBe(3); // main + Worker + Helper
    expect(sessionB.toolCallCount).toBe(5); // 1 + 3 + 1
    expect(sessionB.inputTokens).toBe(3100); // 2000 + 800 + 300
    expect(sessionB.outputTokens).toBe(600); // 400 + 150 + 50
    expect(sessionB.costUsd).toBeCloseTo(0.031, 10);
    // Worker's last tool call (10:07) runs later than the main log's last
    // entry (10:05) - the folded session must reflect the later time.
    expect(sessionB.lastActivityAt).toBe("2026-01-01T10:07:00.000Z");
    expect(sessionB.durationMs).toBe(7 * 60 * 1000);
  });

  it("reports token and cost metrics as null, not zero, for a session whose transcript recorded no usage (E3-S1-AC2)", async () => {
    const summaries = await listSessionSummaries(fixturesRoot);
    const sessionC = findById(summaries, "00000000-0000-7000-8000-00000000000c");

    expect(sessionC.inputTokens).toBeNull();
    expect(sessionC.outputTokens).toBeNull();
    expect(sessionC.costUsd).toBeNull();
    // No custom tool_execution entries were recorded either - a real,
    // known zero, distinct from the usage fields being unavailable.
    expect(sessionC.toolCallCount).toBe(0);
    expect(sessionC.agentCount).toBe(1);
  });

  it("excludes a transcript with no session header from the list", async () => {
    const summaries = await listSessionSummaries(fixturesRoot);

    expect(summaries.some((s) => s.title.includes("Interrupted"))).toBe(false);
  });

  it("returns an empty list for a sessions root with no project directories", async () => {
    const emptyRoot = await fs.mkdtemp(path.join(os.tmpdir(), "panel-empty-sessions-"));
    try {
      const summaries = await listSessionSummaries(emptyRoot);
      expect(summaries).toEqual([]);
    } finally {
      await fs.rm(emptyRoot, { recursive: true, force: true });
    }
  });

  it("rejects when the sessions root cannot be read", async () => {
    const missingRoot = path.join(fixturesRoot, "does-not-exist");
    await expect(listSessionSummaries(missingRoot)).rejects.toThrow();
  });
});

describe("listSessionSummaries against a genuinely empty directory tree", () => {
  let root: string;

  beforeAll(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "panel-project-no-sessions-"));
    await fs.mkdir(path.join(root, "some-project"), { recursive: true });
  });

  afterAll(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it("returns an empty list when a project directory has no session files", async () => {
    const summaries = await listSessionSummaries(root);
    expect(summaries).toEqual([]);
  });
});
