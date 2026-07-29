// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuditJob } from "./types";

const { dispatchQueuedAudit, getAuditBundleDirectory } = vi.hoisted(() => ({
  dispatchQueuedAudit: vi.fn(),
  getAuditBundleDirectory: vi.fn((auditId: string) => auditId),
}));

vi.mock("./dispatch", () => ({ dispatchQueuedAudit, getAuditBundleDirectory }));

import { createAuditJob, getLatestAuditJobForSession } from "./job-store";
import { indexAuditBundlesOnStartup } from "./startup-index";

const SESSION_ID = "2026-07-28T16-10-00-000Z_00000000-0000-7000-8000-000000000070";
const dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.resolve(dirname, "../../../tests/fixtures/audits");

let temporaryRoot: string | undefined;

afterEach(() => {
  dispatchQueuedAudit.mockReset();
  getAuditBundleDirectory.mockClear();
  if (temporaryRoot) fs.rmSync(temporaryRoot, { recursive: true, force: true });
  temporaryRoot = undefined;
});

// The shared AuditJob DTO in ./types is what API routes and client
// components declare their audit job values as (e.g.
// generate-audit-button.tsx's `useState<AuditJob | null>` and its
// `response.json() as AuditJob`). Before this widening the type only
// modeled "queued", so every non-queued status job-store actually produces
// was a fresh object literal the type checker would reject here.
describe("AuditJob DTO models every job-store status and recovered findings (E4-S7)", () => {
  it("accepts every terminal/in-flight status job-store and startup-index produce", () => {
    const statuses: AuditJob["status"][] = [
      "queued",
      "running",
      "completed",
      "insufficient_signal",
      "failed",
      "cancelled",
    ];

    const jobs: AuditJob[] = statuses.map((status) => ({
      id: `audit_${status}`,
      sessionId: SESSION_ID,
      status,
      createdAt: "2026-07-28T16:10:00.000Z",
    }));

    expect(jobs.map((job) => job.status)).toEqual(statuses);
  });

  it("carries recovered findings, fingerprint, and failureSummary alongside a terminal status", () => {
    const completed: AuditJob = {
      id: "audit_completed",
      sessionId: SESSION_ID,
      status: "completed",
      createdAt: "2026-07-28T16:10:00.000Z",
      findings: [{ id: "finding-1", title: "Repeated context loading" }],
      fingerprint: "fingerprint-1",
    };
    const failed: AuditJob = {
      id: "audit_failed",
      sessionId: SESSION_ID,
      status: "failed",
      createdAt: "2026-07-28T16:10:00.000Z",
      failureSummary: "analyzer exited non-zero",
    };

    expect(completed.findings).toHaveLength(1);
    expect(failed.failureSummary).toBe("analyzer exited non-zero");
  });

  it("keeps a dispatched audit's DTO reporting running for its session after a browser reload (E4-S7-AC1)", async () => {
    dispatchQueuedAudit.mockResolvedValue({ once: vi.fn() });

    const created = await createAuditJob(SESSION_ID);

    await vi.waitFor(async () => {
      const recovered = (await getLatestAuditJobForSession(SESSION_ID)) as AuditJob | null;
      expect(recovered).toMatchObject({ id: created.id, status: "running" });
    });
  });

  it("indexes a completed on-disk bundle into the DTO with status and findings, without dispatching (E4-S7-AC2)", () => {
    temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "omp-panel-audit-types-"));
    fs.cpSync(path.join(fixturesDir, "bundle-valid"), path.join(temporaryRoot, "bundle-valid"), {
      recursive: true,
    });

    const jobs = indexAuditBundlesOnStartup(temporaryRoot) as AuditJob[];

    expect(jobs).toEqual([
      expect.objectContaining({
        id: "bundle-valid",
        sessionId: "2026-07-22T10-15-00-aaaa1111",
        status: "completed",
        findings: [expect.objectContaining({ title: "Full log file read instead of tailed" })],
      }),
    ]);
    expect(dispatchQueuedAudit).not.toHaveBeenCalled();
  });
});
