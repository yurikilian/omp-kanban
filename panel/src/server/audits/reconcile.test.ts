// @vitest-environment node
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { type ChildProcess } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  dispatchQueuedAudit: vi.fn(),
  getAuditBundleDirectory: vi.fn((auditId: string) => auditId),
}));

vi.mock("./dispatch", () => mocks);

import { createAuditJob, getLatestAuditJobForSession } from "./job-store";

interface ControlledAnalyzer extends ChildProcess {
  finish(exitStatus: number, stderr: string): void;
}

function createControlledAnalyzer(): ControlledAnalyzer {
  const child = new EventEmitter() as ControlledAnalyzer;
  const stderr = new PassThrough();

  Object.assign(child, {
    exitCode: null,
    signalCode: null,
    stderr,
    finish(exitStatus: number, summary: string) {
      stderr.end(summary);
      child.emit("close", exitStatus, null);
    },
  });

  return child;
}

async function waitForFailedAudit(sessionId: string) {
  await vi.waitFor(
    async () => {
      expect((await getLatestAuditJobForSession(sessionId))?.status).toBe("failed");
    },
    { timeout: 1_000 },
  );
  return getLatestAuditJobForSession(sessionId);
}

async function queueAuditForAnalyzer(exitStatus: number, stderr: string) {
  const child = createControlledAnalyzer();
  const sessionId = `session-${crypto.randomUUID()}`;
  const { promise: dispatched, resolve } = Promise.withResolvers<void>();

  mocks.dispatchQueuedAudit.mockImplementation(() => {
    const dispatchedChild = Promise.resolve(child);
    queueMicrotask(resolve);
    return dispatchedChild;
  });

  await createAuditJob(sessionId);
  await dispatched;
  child.finish(exitStatus, stderr);

  return waitForFailedAudit(sessionId);
}

afterEach(() => {
  mocks.dispatchQueuedAudit.mockReset();
});

describe("audit reconciliation", () => {
  it("records an analyzer non-zero exit as failed with its exit status (E4-S3-AC5)", async () => {
    const audit = await queueAuditForAnalyzer(23, "analyzer exploded");

    expect(audit).toMatchObject({ status: "failed", exitStatus: 23, stderrSummary: "analyzer exploded" });
  });

  it("records a manifest-less analyzer exit as failed (E4-S3-AC5)", async () => {
    const audit = await queueAuditForAnalyzer(0, "manifest absent");

    expect(audit).toMatchObject({ status: "failed", exitStatus: 0, stderrSummary: "manifest absent" });
  });

  it("bounds the retained analyzer stderr summary (E4-S3-AC5)", async () => {
    const audit = await queueAuditForAnalyzer(1, "x".repeat(20_000));

    expect(audit).toMatchObject({ status: "failed", exitStatus: 1 });
    expect(audit?.stderrSummary).toHaveLength(4_096);
  });
});