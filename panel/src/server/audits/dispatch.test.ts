// @vitest-environment node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cancelAudit } from "./cancel";
import { buildAnalyzerCommand } from "./analyzer-command";
import { dispatchAudit, dispatchQueuedAudit, getRunningAuditChild } from "./dispatch";
import { getAuditJobById, rehydrateAuditJobs } from "./job-store";
import { writeAuditJobRecords } from "./startup-index";

const fakeAnalyzerPath = fileURLToPath(new URL("../../../tests/fakes/fake-analyzer.mjs", import.meta.url));
const partialBundleAnalyzerPath = fileURLToPath(
  new URL("../../../tests/fakes/partial-bundle-analyzer.mjs", import.meta.url),
);
const originalAnalyzerCommand = process.env.OMP_PANEL_ANALYZER_COMMAND;

function waitForSuccessfulExit(child: ChildProcess): Promise<void> {
  const { promise, reject, resolve } = Promise.withResolvers<void>();

  child.once("error", reject);
  child.once("exit", (code, signal) => {
    if (code === 0) resolve();
    else reject(new Error(`Analyzer exited with ${code ?? signal ?? "an unknown status"}`));
  });

  return promise;
}

function waitForSpawn(child: ChildProcess): Promise<void> {
  const { promise, reject, resolve } = Promise.withResolvers<void>();
  child.once("error", reject);
  child.once("spawn", resolve);
  return promise;
}

afterEach(() => {
  rehydrateAuditJobs([]);
  if (originalAnalyzerCommand === undefined) delete process.env.OMP_PANEL_ANALYZER_COMMAND;
  else process.env.OMP_PANEL_ANALYZER_COMMAND = originalAnalyzerCommand;
  vi.restoreAllMocks();
});

describe("audit analyzer dispatch", () => {
  it("runs the overridden OMP CLI child with the real CLI arguments and receives its bundle (E4-S3-AC1, E4-S3-AC4)", async () => {
    const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "panel-audit-dispatch-"));

    try {
      const targetTranscript = path.join(temporaryDirectory, "session.jsonl");
      const bundleDirectory = path.join(temporaryDirectory, "bundle");
      const input = {
        auditId: "audit_00000000-0000-4000-8000-000000000001",
        targetTranscript,
        bundleDirectory,
        pricing: { available: false, pricing: null },
      };
      await fs.writeFile(targetTranscript, "{}\n");
      process.env.OMP_PANEL_ANALYZER_COMMAND = fakeAnalyzerPath;

      const expectedCommand = buildAnalyzerCommand(input);
      const child = dispatchAudit(input);
      await waitForSuccessfulExit(child);

      const manifest = JSON.parse(await fs.readFile(path.join(bundleDirectory, "manifest.json"), "utf8"));
      expect(manifest.parentPid).toBe(process.pid);
      expect(manifest.receivedArgs).toEqual(expectedCommand.args);
      expect(manifest).toMatchObject({
        auditId: input.auditId,
        targetTranscript,
        status: "completed",
      });
      await expect(fs.readFile(path.join(bundleDirectory, "audit.json"), "utf8")).resolves.toBeTruthy();
      await expect(fs.readFile(path.join(bundleDirectory, "report.md"), "utf8")).resolves.toBeTruthy();
      await expect(fs.readFile(path.join(bundleDirectory, "evidence.jsonl"), "utf8")).resolves.toBeTruthy();
    } finally {
      await fs.rm(temporaryDirectory, { recursive: true, force: true });
    }
  });

  it("resolves the queued audit to its concrete session transcript before starting the child (E4-S3-AC1)", async () => {
    const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "panel-queued-audit-"));

    try {
      const auditId = "audit_00000000-0000-4000-8000-000000000002";
      const sessionId = "2026-01-01T09-00-00-000Z_00000000-0000-7000-8000-00000000000a";
      const targetTranscript = path.join(
        temporaryDirectory,
        ".omp",
        "agent",
        "sessions",
        "project",
        `${sessionId}.jsonl`,
      );
      await fs.mkdir(path.dirname(targetTranscript), { recursive: true });
      await fs.writeFile(targetTranscript, "{}\n");
      vi.spyOn(os, "homedir").mockReturnValue(temporaryDirectory);
      process.env.OMP_PANEL_ANALYZER_COMMAND = fakeAnalyzerPath;

      const child = await dispatchQueuedAudit({
        auditId,
        pricing: { available: false, pricing: null },
        sessionId,
      });
      expect(child).not.toBeNull();
      await waitForSuccessfulExit(child!);

      const manifest = JSON.parse(
        await fs.readFile(path.join(temporaryDirectory, ".omp", "forensics", "audits", auditId, "manifest.json"), "utf8"),
      );
      expect(manifest.targetTranscript).toBe(targetTranscript);
    } finally {
      await fs.rm(temporaryDirectory, { recursive: true, force: true });
    }
  });

  it("does not start an analyzer for a queued audit whose target transcript disappeared (E4-S3-AC1)", async () => {
    const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "panel-missing-audit-"));

    try {
      vi.spyOn(os, "homedir").mockReturnValue(temporaryDirectory);
      process.env.OMP_PANEL_ANALYZER_COMMAND = fakeAnalyzerPath;

      const child = await dispatchQueuedAudit({
        auditId: "audit_00000000-0000-4000-8000-000000000003",
        pricing: { available: false, pricing: null },
        sessionId: "2026-01-01T09-00-00-000Z_00000000-0000-7000-8000-00000000000b",
      });
      if (child) await waitForSuccessfulExit(child);

      expect(child).toBeNull();
    } finally {
      await fs.rm(temporaryDirectory, { recursive: true, force: true });
    }
  });

  it("clears a stopped child after its canonical cancellation transition (E4-S6-AC4, E4-S6-AC6)", async () => {
    const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "panel-audit-cancel-dispatch-"));
    let child: ChildProcess | undefined;

    try {
      const auditId = "audit_cancel-clears-registry";
      const sessionId = "2026-01-01T09-00-00-000Z_00000000-0000-7000-8000-00000000000a";
      const reason = "the user stopped the analyzer";
      const auditsRoot = path.join(temporaryDirectory, ".omp", "forensics", "audits");
      vi.spyOn(os, "homedir").mockReturnValue(temporaryDirectory);
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
      const targetTranscript = path.join(temporaryDirectory, "session.jsonl");
      const bundleDirectory = path.join(temporaryDirectory, "bundle");
      await fs.writeFile(targetTranscript, "{}\n");
      process.env.OMP_PANEL_ANALYZER_COMMAND = partialBundleAnalyzerPath;
      child = dispatchAudit({
        auditId,
        targetTranscript,
        bundleDirectory,
        pricing: { available: false, pricing: null },
      });
      await waitForSpawn(child);
      expect(getRunningAuditChild(auditId)).toBe(child);

      const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
        child!.once("exit", (code, signal) => resolve({ code, signal }));
      });
      await expect(cancelAudit(auditId, reason)).resolves.toMatchObject({
        ok: true,
        auditId,
        status: "cancelled",
        reason,
      });
      await expect(exited).resolves.toEqual({ code: null, signal: "SIGTERM" });
      await expect(getAuditJobById(auditId)).resolves.toMatchObject({ status: "cancelled", reason });
      expect(getRunningAuditChild(auditId)).toBeUndefined();
    } finally {
      if (child && child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
      await fs.rm(temporaryDirectory, { recursive: true, force: true });
    }
  });
});