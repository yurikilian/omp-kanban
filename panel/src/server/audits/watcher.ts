import { watch } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AuditLifecycleStatus } from "@/lib/audit-states";
import {
  AUDIT_JOB_RECORDS_FILENAME,
  readAuditJobRecords,
  type IndexedAuditJob,
} from "./startup-index";

const DEFAULT_AUDITS_ROOT = path.join(os.homedir(), ".omp", "forensics", "audits");

export interface AuditChange {
  sessionId: string;
  status: AuditLifecycleStatus;
}

export interface AuditWatcher {
  close(): void;
}

function isAuditLifecycleStatus(status: string): status is AuditLifecycleStatus {
  return (
    status === "queued" ||
    status === "running" ||
    status === "completed" ||
    status === "failed" ||
    status === "cancelled" ||
    status === "insufficient_signal"
  );
}

function hasRelevantRecordChange(previous: IndexedAuditJob | undefined, next: IndexedAuditJob): boolean {
  return (
    !previous ||
    previous.status !== next.status ||
    previous.reason !== next.reason ||
    previous.failureSummary !== next.failureSummary ||
    previous.stderrSummary !== next.stderrSummary
  );
}


export function watchAudits(
  onAuditChange: (change: AuditChange) => void,
  root: string = DEFAULT_AUDITS_ROOT,
): AuditWatcher {
  let previousJobs = new Map(readAuditJobRecords(root).map((job) => [job.id, job]));

  const watcher = watch(root, { recursive: true }, (_eventType, filename) => {
    if (
      typeof filename !== "string" ||
      path.basename(filename.replace(/\\/g, "/")) !== AUDIT_JOB_RECORDS_FILENAME
    ) {
      return;
    }

    const jobs = readAuditJobRecords(root);
    for (const job of jobs) {
      if (isAuditLifecycleStatus(job.status) && hasRelevantRecordChange(previousJobs.get(job.id), job)) {
        onAuditChange({ sessionId: job.sessionId, status: job.status });
      }
    }
    previousJobs = new Map(jobs.map((job) => [job.id, job]));
  });

  return { close: () => watcher.close() };
}
