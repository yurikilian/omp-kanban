import { type ChildProcess } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import type { IndexedAuditJob } from "./startup-index.ts";
import type { AuditJob } from "./types.ts";
import { validateAuditBundle } from "./validate.ts";

export const MAX_STDERR_SUMMARY_BYTES = 4_096;

export interface ReconcileAuditInput {
  child: ChildProcess;
  bundleDirectory: string;
}

export type ProcessAliveCheck = (pid: number) => boolean;

type ReconciledAudit = Pick<AuditJob, "status" | "exitStatus" | "stderrSummary">;

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error;
}

/**
 * Whether `pid` still names a live OS process. `EPERM` means the process
 * exists but is owned by someone else - still alive, just unsignalable by
 * us; every other failure (chiefly `ESRCH`) means it is gone.
 */
export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return isErrnoException(error) && error.code === "EPERM";
  }
}

/**
 * Reconcile persisted job records whose status is "running" but whose
 * analyzer process is gone into "interrupted" (E4-S7-AC3, `panel/docs/
 * audit-bundle.md`'s "Status values" - `running` lives only in the job
 * service's own record, never in a bundle's `manifest.json`). This always
 * runs against records freshly loaded from disk on startup, so nothing here
 * has a live handle to any child process it did not itself just spawn - a
 * "running" record with no recorded pid can never be proven alive, and
 * reconciles too, so a stale record is never left running forever.
 */
export function reconcileOrphanedRunningJobs(
  jobs: readonly IndexedAuditJob[],
  isAlive: ProcessAliveCheck = isProcessAlive,
): IndexedAuditJob[] {
  return jobs.map((job) => {
    if (job.status !== "running") return job;
    if (typeof job.pid === "number" && isAlive(job.pid)) return job;

    const reason =
      typeof job.pid === "number"
        ? `analyzer process ${job.pid} is no longer running`
        : "no analyzer process was recorded for this audit";

    console.warn(`omp panel: reconciling orphaned audit "${job.id}" to interrupted (${reason})`);

    return { ...job, status: "interrupted", failureSummary: reason };
  });
}

function readStderrSummary(child: ChildProcess): Promise<string> {
  const stderr = child.stderr;
  if (!stderr || stderr.readableEnded) return Promise.resolve("");

  const { promise, resolve } = Promise.withResolvers<string>();
  const chunks: Buffer[] = [];
  let remainingBytes = MAX_STDERR_SUMMARY_BYTES;

  stderr.on("data", (chunk: Buffer | string) => {
    if (remainingBytes === 0) return;

    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    const retained = bytes.subarray(0, remainingBytes);
    chunks.push(retained);
    remainingBytes -= retained.length;
  });
  stderr.once("end", () => resolve(Buffer.concat(chunks).toString("utf8")));

  return promise;
}

function waitForChildToClose(child: ChildProcess): Promise<number | null> {
  const { promise, resolve } = Promise.withResolvers<number | null>();

  child.once("close", (exitStatus) => resolve(exitStatus));
  if (typeof child.exitCode === "number" || typeof child.signalCode === "string") resolve(child.exitCode);

  return promise;
}

async function hasManifest(bundleDirectory: string): Promise<boolean> {
  try {
    return (await fs.lstat(path.join(bundleDirectory, "manifest.json"))).isFile();
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

export async function reconcileAudit({ child, bundleDirectory }: ReconcileAuditInput): Promise<ReconciledAudit> {
  const stderrSummary = readStderrSummary(child);
  const exitStatus = await waitForChildToClose(child);
  const [summary, manifestExists] = await Promise.all([stderrSummary, hasManifest(bundleDirectory)]);

  if (exitStatus === 0 && manifestExists) return { status: "completed" };

  return { exitStatus, status: "failed", stderrSummary: summary };
}

function describeInvalidBundleDirectory(bundleDir: string): string {
  try {
    const validation = validateAuditBundle(bundleDir);
    switch (validation.status) {
      case "incomplete":
        return `missing ${validation.missingFiles.join(", ")}`;
      case "unsupported_schema_version":
        return `unsupported schemaVersion ${JSON.stringify(validation.schemaVersion)}`;
      case "invalid": {
        const [issue] = validation.issues;
        return issue ? `${issue.file} ${issue.location}: ${issue.message}` : "failed bundle validation";
      }
      case "valid":
        return "not recognized as an audit bundle";
    }
  } catch {
    return "could not be read";
  }
}

/**
 * Record why a directory under the audits root was not indexed as a bundle
 * (E4-S7-AC4). Logging only - the caller remains responsible for moving on
 * to the next directory regardless, so one bad directory never stops the
 * rest of indexing.
 */
export function recordSkippedBundleDirectory(auditsRootPath: string, entryName: string): void {
  const reason = describeInvalidBundleDirectory(path.join(auditsRootPath, entryName));
  console.warn(`omp panel: skipping audit directory "${entryName}" (${reason})`);
}
