import path from "node:path";
import { validateAuditBundle } from "./validate";
import type { IndexedAuditJob } from "./startup-index";

export type ProcessAliveCheck = (pid: number) => boolean;

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
