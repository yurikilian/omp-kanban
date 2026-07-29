// @vitest-environment node
import { spawn, type ChildProcess } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { registerRunningAuditChild } from "./dispatch";
import { cancelAudit, getAuditCancellation } from "./cancel";

const spawnedChildren: ChildProcess[] = [];

/** A child that stays alive until killed - waiting on stdin needs no timer to hang. */
function spawnLongRunningChild(): ChildProcess {
  const child = spawn(process.execPath, ["-e", "process.stdin.resume()"]);
  spawnedChildren.push(child);
  return child;
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
});

describe("cancelAudit (E4-S6-AC6)", () => {
  it("stops the analyzer child and records the audit cancelled", async () => {
    const auditId = "audit_cancel-stops-child";
    const child = spawnLongRunningChild();
    await waitForSpawn(child);
    registerRunningAuditChild(auditId, child);

    const exited = waitForExit(child);

    const result = await cancelAudit(auditId);

    expect(result.ok).toBe(true);
    expect(result.auditId).toBe(auditId);
    if (result.ok) expect(typeof result.cancelledAt).toBe("string");

    const { signal } = await exited;
    expect(signal).toBe("SIGTERM");

    const record = await getAuditCancellation(auditId);
    expect(record).not.toBeNull();
    expect(record?.status).toBe("cancelled");
    expect(record?.auditId).toBe(auditId);
  });

  it("reports failure rather than a fabricated success when there is no running child for the audit id", async () => {
    const result = await cancelAudit("audit_never-dispatched");

    expect(result.ok).toBe(false);
    expect(await getAuditCancellation("audit_never-dispatched")).toBeNull();
  });

  it("reports failure for an audit whose child has already exited on its own", async () => {
    const auditId = "audit_already-finished";
    const child = spawn(process.execPath, ["-e", ""]);
    spawnedChildren.push(child);
    registerRunningAuditChild(auditId, child);
    await waitForExit(child);

    const result = await cancelAudit(auditId);

    expect(result.ok).toBe(false);
  });
});
