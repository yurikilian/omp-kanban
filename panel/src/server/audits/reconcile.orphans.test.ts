// @vitest-environment node
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { indexAuditBundlesOnStartup, readAuditJobRecords, writeAuditJobRecords } from "./startup-index";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.resolve(dirname, "../../../tests/fixtures/audits");

let temporaryRoot: string | undefined;

afterEach(() => {
  if (temporaryRoot) fs.rmSync(temporaryRoot, { recursive: true, force: true });
  temporaryRoot = undefined;
  vi.restoreAllMocks();
});

/**
 * A pid guaranteed to no longer name a live process - spawning and awaiting
 * a real exit (rather than guessing a large number) keeps this immune to
 * whatever pid range the host OS happens to use.
 */
async function deadPid(): Promise<number> {
  const child = spawn(process.execPath, ["-e", "process.exit(0)"], { stdio: "ignore" });
  const { promise, reject, resolve } = Promise.withResolvers<number>();
  child.once("error", reject);
  child.once("exit", () => resolve(child.pid!));
  return promise;
}

describe("startup audit reconciliation", () => {
  it("records a running audit whose analyzer process is gone as interrupted with the reason (E4-S7-AC3)", async () => {
    temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "omp-panel-audit-orphan-"));
    const pid = await deadPid();

    writeAuditJobRecords(
      [
        {
          id: "audit_orphan",
          sessionId: "2026-07-28T16-10-00-000Z_00000000-0000-7000-8000-000000000058",
          status: "running",
          createdAt: "2026-07-28T16:10:00Z",
          pid,
        },
      ],
      temporaryRoot,
    );

    const jobs = indexAuditBundlesOnStartup(temporaryRoot);

    expect(jobs).toEqual([
      expect.objectContaining({
        id: "audit_orphan",
        status: "interrupted",
        failureSummary: expect.stringContaining(String(pid)),
      }),
    ]);
    expect(readAuditJobRecords(temporaryRoot)).toEqual(jobs);
  });

  it("skips a directory that is not a valid bundle with a recorded reason while indexing completes (E4-S7-AC4)", () => {
    temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "omp-panel-audit-invalid-dir-"));
    fs.cpSync(path.join(fixturesDir, "bundle-valid"), path.join(temporaryRoot, "bundle-valid"), {
      recursive: true,
    });
    fs.mkdirSync(path.join(temporaryRoot, "not-a-bundle"));

    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const jobs = indexAuditBundlesOnStartup(temporaryRoot);

    expect(jobs).toEqual([expect.objectContaining({ id: "bundle-valid", status: "completed" })]);
    expect(consoleWarn).toHaveBeenCalledWith(expect.stringContaining("not-a-bundle"));
  });

  it("never leaves any audit permanently running after reconciliation", async () => {
    temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "omp-panel-audit-no-running-"));
    const pid = await deadPid();

    writeAuditJobRecords(
      [
        {
          id: "audit_dead_pid",
          sessionId: "session-a",
          status: "running",
          createdAt: "2026-07-28T16:10:00Z",
          pid,
        },
        {
          id: "audit_no_pid",
          sessionId: "session-b",
          status: "running",
          createdAt: "2026-07-28T16:11:00Z",
        },
        {
          id: "audit_queued",
          sessionId: "session-c",
          status: "queued",
          createdAt: "2026-07-28T16:12:00Z",
        },
      ],
      temporaryRoot,
    );

    const jobs = indexAuditBundlesOnStartup(temporaryRoot);

    expect(jobs.some((job) => job.status === "running")).toBe(false);
    expect(jobs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "audit_dead_pid", status: "interrupted" }),
        expect.objectContaining({ id: "audit_no_pid", status: "interrupted" }),
        expect.objectContaining({ id: "audit_queued", status: "queued" }),
      ]),
    );
  });
});
