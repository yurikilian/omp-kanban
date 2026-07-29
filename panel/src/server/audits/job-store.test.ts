// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuditJob, AuditJobStatus } from "./types";
import type * as StartupIndexModule from "./startup-index";
import { writeAuditJobRecords } from "./startup-index";

const SESSION_ID = "2026-01-01T09-00-00-000Z_00000000-0000-7000-8000-00000000000a";
const originalHome = process.env.HOME;
const PERSISTED_AUDIT_STATUSES = [
  "queued",
  "running",
  "completed",
  "insufficient_signal",
  "failed",
  "cancelled",
  "interrupted",
] as const;

type PersistedAuditStatus = (typeof PERSISTED_AUDIT_STATUSES)[number];

let temporaryHome: string | undefined;

function createAuditsRoot(): string {
  temporaryHome = fs.mkdtempSync(path.join(os.tmpdir(), "omp-panel-audit-history-"));
  process.env.HOME = temporaryHome;
  return path.join(temporaryHome, ".omp", "forensics", "audits");
}

afterEach(() => {
  vi.doUnmock("./startup-index");
  vi.doUnmock("./dispatch");
  vi.resetModules();
  if (temporaryHome) fs.rmSync(temporaryHome, { recursive: true, force: true });
  temporaryHome = undefined;
  if (originalHome === undefined) delete process.env.HOME;
  else process.env.HOME = originalHome;
});

describe("audit job store", () => {
  it("keeps a queued audit available for its session after the caller returns (E4-S1-AC2, E4-S1-AC3)", async () => {
    const readAuditJobRecords = vi.fn(() => []);
    const writeAuditJobRecords = vi.fn();
    const dispatchQueuedAudit = vi.fn().mockResolvedValue(null);
    vi.resetModules();
    vi.doMock("./startup-index", async (importOriginal) => {
      const actual = await importOriginal<typeof StartupIndexModule>();
      return { ...actual, readAuditJobRecords, writeAuditJobRecords };
    });
    vi.doMock("./dispatch", () => ({
      dispatchQueuedAudit,
      getAuditBundleDirectory: (auditId: string) => auditId,
    }));

    // The mocked module boundary isolates this store test from a developer's real audit history.
    const { createAuditJob, getLatestAuditJobForSession } = await import("./job-store");
    const created = await createAuditJob(SESSION_ID);

    expect(created).toMatchObject({ sessionId: SESSION_ID, status: "queued" });
    expect(created.id).toMatch(/^audit_/);
    expect(await getLatestAuditJobForSession(SESSION_ID)).toEqual(created);
    expect(writeAuditJobRecords).toHaveBeenCalledWith([created]);
  });

  it("keeps failed and cancelled durable records in session history after a module reload (E4-S6-AC4)", async () => {
    const auditsRoot = createAuditsRoot();
    const history: AuditJob[] = [
      {
        id: "audit_failed",
        sessionId: SESSION_ID,
        status: "failed",
        createdAt: "2026-01-01T09:11:00.000Z",
        failureSummary: "the analyzer exited before writing a bundle",
      },
      {
        id: "audit_cancelled",
        sessionId: SESSION_ID,
        status: "cancelled",
        createdAt: "2026-01-01T09:12:00.000Z",
        reason: "the user stopped the analyzer",
      },
    ];
    writeAuditJobRecords(history, auditsRoot);

    vi.resetModules();
    // A fresh module cache is the restart boundary under test; a static import would retain the old store.
    const { getAuditJobsForSession } = await import("./job-store");

    await expect(getAuditJobsForSession(SESSION_ID)).resolves.toEqual(history);
  });

  it("reads reloaded history from durable records without request-time bundle indexing (E4-S6-AC4)", async () => {
    const history: AuditJob[] = [
      {
        id: "audit_completed",
        sessionId: SESSION_ID,
        status: "completed",
        createdAt: "2026-01-01T09:13:00.000Z",
      },
    ];
    const readAuditJobRecords = vi.fn(() => history);

    const indexAuditBundlesOnStartup = vi.fn(() => {
      throw new Error("request-time bundle indexing is not allowed");
    });
    vi.resetModules();
    vi.doMock("./startup-index", async (importOriginal) => {
      const actual = await importOriginal<typeof StartupIndexModule>();
      return { ...actual, indexAuditBundlesOnStartup, readAuditJobRecords };
    });

    // A fresh module cache models a route loaded after runtime/start.mjs initialized durable records.
    const { getAuditJobsForSession } = await import("./job-store");

    await expect(getAuditJobsForSession(SESSION_ID)).resolves.toEqual(history);
    expect(indexAuditBundlesOnStartup).not.toHaveBeenCalled();
    expect(readAuditJobRecords).toHaveBeenCalledOnce();
  });

  it("keeps recovered interrupted records within the literal persisted status contract (E4-S6-AC4)", () => {
    const recovered: AuditJob = {
      id: "audit_interrupted",
      sessionId: SESSION_ID,
      status: "interrupted",
      createdAt: "2026-01-01T09:13:00.000Z",
      reason: "the panel runtime ended before the analyzer finished",
    };
    const acceptPersistedStatus = (status: PersistedAuditStatus): AuditJobStatus => status;

    expect(PERSISTED_AUDIT_STATUSES).toContain(acceptPersistedStatus(recovered.status));
    expect(acceptPersistedStatus(recovered.status)).toBe("interrupted");
  });
});