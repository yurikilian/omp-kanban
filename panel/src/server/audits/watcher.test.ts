// @vitest-environment node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { writeAuditJobRecords } from "./startup-index";
import type { AuditChange, AuditWatcher } from "./watcher";
import { watchAudits } from "./watcher";

const LIFECYCLE_STATUSES = [
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
  "insufficient_signal",
] as const;

describe("watchAudits", () => {
  let root: string | undefined;
  let watcher: AuditWatcher | undefined;

  afterEach(async () => {
    watcher?.close();
    watcher = undefined;
    if (root) await fs.rm(root, { recursive: true, force: true });
    root = undefined;
  });

  it("emits each exact canonical durable lifecycle status when the job record changes (E4-S6-AC2, E4-S6-AC3, E4-S6-AC4, E4-S6-AC5)", async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "omp-audit-watcher-"));
    writeAuditJobRecords([], root);
    const changes: AuditChange[] = [];
    watcher = watchAudits((change) => changes.push(change), root);

    const records = LIFECYCLE_STATUSES.map((status, index) => ({
      id: `audit-${status}`,
      sessionId: `session-${index}`,
      status,
      createdAt: "2026-01-01T09:00:00.000Z",
      ...(status === "failed" ? { failureSummary: "the analyzer stopped unexpectedly" } : {}),
      ...(status === "cancelled" ? { reason: "the user stopped the analyzer" } : {}),
    }));
    writeAuditJobRecords(records, root);

    const expected = records.map(({ sessionId, status }) => ({ sessionId, status }));
    await vi.waitFor(() => expect(changes).toEqual(expect.arrayContaining(expected)));
    expect(changes).toHaveLength(expected.length);
  });
  it("creates a missing audit root before watching so the first lifecycle change is delivered (E4-S6-AC5)", async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "omp-audit-watcher-missing-"));
    await fs.rm(root, { recursive: true, force: true });
    const changes: AuditChange[] = [];

    watcher = watchAudits((change) => changes.push(change), root);
    writeAuditJobRecords(
      [
        {
          id: "audit-first-queued",
          sessionId: "session-first-audit",
          status: "queued",
          createdAt: "2026-01-01T09:00:00.000Z",
        },
      ],
      root,
    );

    await vi.waitFor(() =>
      expect(changes).toContainEqual({ sessionId: "session-first-audit", status: "queued" }),
    );
  });
});
