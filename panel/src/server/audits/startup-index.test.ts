// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

const { dispatchQueuedAudit, getAuditBundleDirectory } = vi.hoisted(() => ({
  dispatchQueuedAudit: vi.fn(),
  getAuditBundleDirectory: vi.fn((auditId: string) => auditId),
}));

vi.mock("./dispatch", () => ({ dispatchQueuedAudit, getAuditBundleDirectory }));

import { createAuditJob, getLatestAuditJobForSession } from "./job-store";
import { indexAuditBundlesOnStartup, readAuditJobRecords, writeAuditJobRecords } from "./startup-index";
import type { AuditJob } from "./types";

const SESSION_ID = "2026-07-28T16-10-00-000Z_00000000-0000-7000-8000-000000000053";
const dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.resolve(dirname, "../../../tests/fixtures/audits");
const originalHome = process.env.HOME;


let temporaryRoot: string | undefined;


afterEach(() => {
  dispatchQueuedAudit.mockReset();
  getAuditBundleDirectory.mockClear();
  if (temporaryRoot) fs.rmSync(temporaryRoot, { recursive: true, force: true });
  temporaryRoot = undefined;
  if (originalHome === undefined) delete process.env.HOME;
  else process.env.HOME = originalHome;
});

type DurableAuditJob = AuditJob & { reason?: string };

describe("startup audit recovery", () => {
  it("keeps a dispatched audit running for its session after a browser reload (E4-S7-AC1)", async () => {
    dispatchQueuedAudit.mockResolvedValue({ once: vi.fn() });

    const created = await createAuditJob(SESSION_ID);

    await vi.waitFor(async () => {
      await expect(getLatestAuditJobForSession(SESSION_ID)).resolves.toMatchObject({
        id: created.id,
        status: "running",
      });
    });
  });

  it("indexes a completed on-disk bundle with its session, status, and findings without dispatching (E4-S7-AC2)", () => {
    temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "omp-panel-audit-startup-"));
    fs.cpSync(path.join(fixturesDir, "bundle-valid"), path.join(temporaryRoot, "bundle-valid"), {
      recursive: true,
    });

    const jobs = indexAuditBundlesOnStartup(temporaryRoot);

    expect(jobs).toEqual([
      expect.objectContaining({
        id: "bundle-valid",
        sessionId: "2026-07-22T10-15-00-aaaa1111",
        status: "completed",
        findings: [expect.objectContaining({ title: "Full log file read instead of tailed" })],
      }),
    ]);
    expect(readAuditJobRecords(temporaryRoot)).toEqual(jobs);
    expect(dispatchQueuedAudit).not.toHaveBeenCalled();
  });

  it("preserves every persisted lifecycle record and terminal reason during recovery (E4-S6-AC4)", () => {
    temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "omp-panel-audit-history-recovery-"));
    fs.cpSync(path.join(fixturesDir, "bundle-valid"), path.join(temporaryRoot, "bundle-valid"), {
      recursive: true,
    });
    const records: DurableAuditJob[] = [
      {
        id: "audit_queued",
        sessionId: "2026-07-22T10-15-00-aaaa1111",
        status: "queued",
        createdAt: "2026-07-22T10:16:00Z",
      },
      {
        id: "bundle-valid",
        sessionId: "2026-07-22T10-15-00-aaaa1111",
        status: "failed",
        createdAt: "2026-07-22T10:17:00Z",
        failureSummary: "the analyzer result was rejected before it could be published",
      },
      {
        id: "audit_completed",
        sessionId: "2026-07-22T10-15-00-aaaa1111",
        status: "completed",
        createdAt: "2026-07-22T10:18:00Z",
      },
      {
        id: "audit_insufficient_signal",
        sessionId: "2026-07-22T10-15-00-aaaa1111",
        status: "insufficient_signal",
        createdAt: "2026-07-22T10:19:00Z",
      },
      {
        id: "audit_cancelled",
        sessionId: "2026-07-22T10-15-00-aaaa1111",
        status: "cancelled",
        createdAt: "2026-07-22T10:20:00Z",
        reason: "the user stopped the analyzer",
      },
      {
        id: "audit_interrupted",
        sessionId: "2026-07-22T10-15-00-aaaa1111",
        status: "interrupted",
        createdAt: "2026-07-22T10:21:00Z",
        reason: "the panel runtime ended before the analyzer finished",
      },
    ];
    writeAuditJobRecords(records, temporaryRoot);

    const recovered = indexAuditBundlesOnStartup(temporaryRoot);

    expect(recovered).toHaveLength(records.length);
    expect(recovered).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "bundle-valid",
          status: "failed",
          failureSummary: "the analyzer result was rejected before it could be published",
        }),
        expect.objectContaining({
          id: "audit_cancelled",
          status: "cancelled",
          reason: "the user stopped the analyzer",
        }),
        expect.objectContaining({
          id: "audit_interrupted",
          status: "interrupted",
          reason: "the panel runtime ended before the analyzer finished",
        }),
      ]),
    );
    expect(readAuditJobRecords(temporaryRoot)).toEqual(recovered);
  });

  it("does not recover malformed bundles as terminal audits (E4-S7-AC2)", () => {
    temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "omp-panel-audit-invalid-startup-"));
    for (const auditId of ["bundle-missing-field", "bundle-wrong-type"]) {
      fs.cpSync(path.join(fixturesDir, auditId), path.join(temporaryRoot, auditId), { recursive: true });
    }

    expect(indexAuditBundlesOnStartup(temporaryRoot)).toEqual([]);
    expect(readAuditJobRecords(temporaryRoot)).toEqual([]);
    expect(dispatchQueuedAudit).not.toHaveBeenCalled();
  });

  it("replaces a stale running record with its completed bundle on startup (E4-S7-AC2)", () => {
    temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "omp-panel-audit-terminal-startup-"));
    fs.cpSync(path.join(fixturesDir, "bundle-valid"), path.join(temporaryRoot, "bundle-valid"), {
      recursive: true,
    });
    writeAuditJobRecords(
      [
        {
          id: "bundle-valid",
          sessionId: "2026-07-22T10-15-00-aaaa1111",
          status: "running",
          createdAt: "2026-07-22T10:18:00Z",
        },
      ],
      temporaryRoot,
    );

    expect(indexAuditBundlesOnStartup(temporaryRoot)).toEqual([
      expect.objectContaining({
        id: "bundle-valid",
        status: "completed",
        findings: [expect.objectContaining({ title: "Full log file read instead of tailed" })],
      }),
    ]);
    expect(dispatchQueuedAudit).not.toHaveBeenCalled();
  });

  it("treats a fresh-install audits root as empty without creating it (E4-S7-AC2)", () => {
    temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "omp-panel-audit-empty-startup-"));
    const missingRoot = path.join(temporaryRoot, "not-created-yet");

    expect(indexAuditBundlesOnStartup(missingRoot)).toEqual([]);
    expect(fs.existsSync(missingRoot)).toBe(false);
  });

  it("hydrates a fresh runtime from indexed terminal bundles without dispatching an analyzer (E4-S7-AC2)", async () => {
    temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "omp-panel-audit-restart-"));
    process.env.HOME = temporaryRoot;
    const auditsRoot = path.join(temporaryRoot, ".omp", "forensics", "audits");
    fs.mkdirSync(auditsRoot, { recursive: true });
    fs.cpSync(path.join(fixturesDir, "bundle-valid"), path.join(auditsRoot, "bundle-valid"), {
      recursive: true,
    });
    indexAuditBundlesOnStartup(auditsRoot);

    vi.resetModules();
    // Dynamic import deliberately establishes the empty-module-cache restart boundary.
    const { getLatestAuditJobForSession: getRecoveredAudit } = await import("./job-store");

    await expect(getRecoveredAudit("2026-07-22T10-15-00-aaaa1111")).resolves.toMatchObject({
      id: "bundle-valid",
      status: "completed",
      findings: [expect.objectContaining({ title: "Full log file read instead of tailed" })],
    });
    expect(dispatchQueuedAudit).not.toHaveBeenCalled();
  });
});
