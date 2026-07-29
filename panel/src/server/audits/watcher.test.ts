// @vitest-environment node
import type { FSWatcher } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AUDIT_JOB_RECORDS_FILENAME, writeAuditJobRecords } from "./startup-index";
import type { AuditChange, AuditWatcher } from "./watcher";
import { watchAudits } from "./watcher";

const fsWatchMock = vi.hoisted(() => vi.fn());

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, watch: fsWatchMock };
});

const LIFECYCLE_STATUSES = [
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
  "insufficient_signal",
] as const;

type WatchEventListener = (eventType: string, filename: string | Buffer | null) => void;

function stubWatch() {
  const close = vi.fn();
  let listener: WatchEventListener | undefined;

  fsWatchMock.mockImplementation((_: string, __: unknown, nextListener: WatchEventListener) => {
    listener = nextListener;
    return { close } as unknown as FSWatcher;
  });

  return {
    close,
    emit: (eventType: string, filename: string) => listener?.(eventType, filename),
  };
}

describe("watchAudits", () => {
  let root: string | undefined;
  let watcher: AuditWatcher | undefined;

  afterEach(async () => {
    watcher?.close();
    watcher = undefined;
    if (root) await fs.rm(root, { recursive: true, force: true });
    root = undefined;
    vi.useRealTimers();
    fsWatchMock.mockReset();
  });

  it("emits each exact canonical durable lifecycle status when the job record changes (E4-S6-AC2, E4-S6-AC3, E4-S6-AC4, E4-S6-AC5)", async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "omp-audit-watcher-"));
    writeAuditJobRecords([], root);
    const changes: AuditChange[] = [];
    const filesystemWatch = stubWatch();
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

    filesystemWatch.emit("rename", AUDIT_JOB_RECORDS_FILENAME);

    const expected = records.map(({ sessionId, status }) => ({ sessionId, status }));
    expect(changes).toEqual(expected);
  });
  it("creates a missing audit root before watching so the first lifecycle change is delivered (E4-S6-AC5)", async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "omp-audit-watcher-missing-"));
    await fs.rm(root, { recursive: true, force: true });
    const changes: AuditChange[] = [];
    const filesystemWatch = stubWatch();

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

    filesystemWatch.emit("rename", AUDIT_JOB_RECORDS_FILENAME);

    expect(changes).toEqual([{ sessionId: "session-first-audit", status: "queued" }]);
  });

  it("delivers a lifecycle change written right after creation when the filesystem event never fires (E4-S6-AC5)", async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "omp-audit-watcher-reconcile-"));
    writeAuditJobRecords([], root);
    const changes: AuditChange[] = [];
    const filesystemWatch = stubWatch();
    vi.useFakeTimers();

    watcher = watchAudits((change) => changes.push(change), root);
    writeAuditJobRecords(
      [
        {
          id: "audit-reconciled-queued",
          sessionId: "session-reconciled",
          status: "queued",
          createdAt: "2026-01-01T09:00:00.000Z",
        },
      ],
      root,
    );

    await vi.advanceTimersToNextTimerAsync();

    expect(changes).toEqual([{ sessionId: "session-reconciled", status: "queued" }]);
    expect(filesystemWatch.close).not.toHaveBeenCalled();
  });

  it("emits one change per record transition when a late filesystem event repeats a reconciled write (E4-S6-AC2, E4-S6-AC3, E4-S6-AC4)", async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "omp-audit-watcher-late-event-"));
    writeAuditJobRecords([], root);
    const changes: AuditChange[] = [];
    const filesystemWatch = stubWatch();
    vi.useFakeTimers();

    watcher = watchAudits((change) => changes.push(change), root);
    const records = LIFECYCLE_STATUSES.map((status, index) => ({
      id: `audit-late-${status}`,
      sessionId: `session-late-${index}`,
      status,
      createdAt: "2026-01-01T09:00:00.000Z",
    }));
    writeAuditJobRecords(records, root);

    await vi.advanceTimersToNextTimerAsync();
    const expected = records.map(({ sessionId, status }) => ({ sessionId, status }));
    expect(changes).toEqual(expected);
    filesystemWatch.emit("rename", AUDIT_JOB_RECORDS_FILENAME);

    expect(changes).toEqual(expected);
  });

  it("close stops both the filesystem watch and the reconcile pass (E4-S6-AC5)", async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "omp-audit-watcher-close-"));
    writeAuditJobRecords([], root);
    const changes: AuditChange[] = [];
    const filesystemWatch = stubWatch();
    vi.useFakeTimers();

    watcher = watchAudits((change) => changes.push(change), root);
    writeAuditJobRecords(
      [
        {
          id: "audit-close-queued",
          sessionId: "session-close",
          status: "queued",
          createdAt: "2026-01-01T09:00:00.000Z",
        },
      ],
      root,
    );
    await vi.advanceTimersToNextTimerAsync();
    watcher.close();
    watcher = undefined;

    writeAuditJobRecords(
      [
        {
          id: "audit-close-queued",
          sessionId: "session-close",
          status: "running",
          createdAt: "2026-01-01T09:00:00.000Z",
        },
      ],
      root,
    );
    await vi.advanceTimersByTimeAsync(1_000);

    expect(changes).toEqual([{ sessionId: "session-close", status: "queued" }]);
    expect(filesystemWatch.close).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});
