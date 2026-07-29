// @vitest-environment node
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cancelAudit } from "./cancel";
import { getRunningAuditChild, registerRunningAuditChild } from "./dispatch";
import { getAuditJobById, rehydrateAuditJobs } from "./job-store";
import { writeAuditJobRecords } from "./startup-index";

const spawnedChildren: ChildProcess[] = [];
const originalHome = process.env.HOME;
let temporaryHome: string | undefined;

/** A child that stays alive until killed - waiting on stdin needs no timer to hang. */
function spawnLongRunningChild(): ChildProcess {
  const child = spawn(process.execPath, ["-e", "process.stdin.resume()"]);
  spawnedChildren.push(child);
  return child;
}

function createAuditsRoot(): string {
  temporaryHome = fs.mkdtempSync(path.join(os.tmpdir(), "omp-panel-cancel-"));
  process.env.HOME = temporaryHome;
  return path.join(temporaryHome, ".omp", "forensics", "audits");
}

function waitForSpawn(child: ChildProcess): Promise<void> {
  const { promise, reject, resolve } = Promise.withResolvers<void>();
  child.once("spawn", resolve);
  child.once("error", reject);
  return promise;
}

interface ChildExit {
  code: number | null;
  signal: NodeJS.Signals | null;
}

function waitForExit(child: ChildProcess): Promise<ChildExit> {
  const { promise, resolve } = Promise.withResolvers<ChildExit>();
  child.once("exit", (code, signal) => resolve({ code, signal }));
  return promise;
}

afterEach(() => {
  for (const child of spawnedChildren.splice(0)) {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
  }
  rehydrateAuditJobs([]);
  if (temporaryHome) fs.rmSync(temporaryHome, { recursive: true, force: true });
  temporaryHome = undefined;
  if (originalHome === undefined) delete process.env.HOME;
  else process.env.HOME = originalHome;
  vi.restoreAllMocks();
});

describe("cancelAudit (E4-S6-AC6)", () => {
  it("stops the registered analyzer and transitions its canonical record to cancelled with a reason (E4-S6-AC4, E4-S6-AC6)", async () => {
    const auditId = "audit_cancel-stops-child";
    const sessionId = "2026-01-01T09-00-00-000Z_00000000-0000-7000-8000-00000000000a";
    const reason = "the user stopped this analyzer";
    const auditsRoot = createAuditsRoot();
    writeAuditJobRecords(
      [
        {
          id: auditId,
          sessionId,
          status: "running",
          createdAt: "2026-01-01T09:00:00.000Z",
        },
      ],
      auditsRoot,
    );
    const child = spawnLongRunningChild();
    await waitForSpawn(child);
    registerRunningAuditChild(auditId, child);

    const exited = waitForExit(child);
    const result = await cancelAudit(auditId, reason);

    expect(result).toMatchObject({ ok: true, auditId, status: "cancelled", reason });
    await expect(exited).resolves.toEqual({ code: null, signal: "SIGTERM" });
    await expect(getAuditJobById(auditId)).resolves.toMatchObject({ status: "cancelled", reason });
    expect(getRunningAuditChild(auditId)).toBeUndefined();
  });

  it("reports failure rather than a fabricated success when there is no running child for the audit id", async () => {
    const result = await cancelAudit("audit_never-dispatched");


    expect(result).toEqual({
      ok: false,
      auditId: "audit_never-dispatched",
      reason: "no running analyzer child for this audit",
    });
  });

  it("reports failure for an audit whose child has already exited on its own", async () => {
    const auditId = "audit_already-finished";
    const child = spawn(process.execPath, ["-e", ""]);
    spawnedChildren.push(child);
    registerRunningAuditChild(auditId, child);
    await waitForExit(child);

    const result = await cancelAudit(auditId);

    expect(result).toEqual({
      ok: false,
      auditId,
      reason: "no running analyzer child for this audit",
    });
  });
});
