import { randomUUID } from "node:crypto";
import { dispatchQueuedAudit, getAuditBundleDirectory } from "./dispatch.ts";
import { reconcileAudit } from "./reconcile.ts";
import type { AuditPricing } from "./analyzer-command.ts";
import { fingerprintAuditTarget, type AuditTarget } from "./fingerprint.ts";
import {
  indexAuditBundlesOnStartup,
  readAuditJobRecords,
  writeAuditJobRecords,
  type IndexedAuditJob,
} from "./startup-index.ts";

const auditJobById = new Map<string, StoredAuditJob>();
const auditJobByFingerprint = new Map<string, StoredAuditJob>();

const unavailablePricing: AuditPricing = { available: false, pricing: null };
let hasRecoveredAuditJobs = false;
let hasIndexedAuditJobs = false;

export type StoredAuditJob = IndexedAuditJob;

export interface CreateAuditJobOptions {
  rerun?: boolean;
  pricing?: AuditPricing;
}

function isTerminalAuditJob(status: StoredAuditJob["status"]): boolean {
  return (
    status === "completed" ||
    status === "insufficient_signal" ||
    status === "failed" ||
    status === "cancelled" ||
    status === "interrupted"
  );
}

function compareAuditJobs(left: StoredAuditJob, right: StoredAuditJob): number {
  const createdAtComparison = left.createdAt.localeCompare(right.createdAt);
  return createdAtComparison || left.id.localeCompare(right.id);
}

function storeAuditJob(job: StoredAuditJob): void {
  auditJobById.set(job.id, job);
  if (job.fingerprint) auditJobByFingerprint.set(job.fingerprint, job);
}

function persistAuditJobs(): void {
  writeAuditJobRecords([...auditJobById.values()]);
}

function ensureRecoveredAuditJobs(): void {
  if (hasRecoveredAuditJobs) return;

  rehydrateAuditJobs(readAuditJobRecords());
  hasRecoveredAuditJobs = true;
}

export function initializeAuditJobStore(): void {
  if (hasIndexedAuditJobs) return;

  rehydrateAuditJobs(indexAuditBundlesOnStartup());
  hasRecoveredAuditJobs = true;
  hasIndexedAuditJobs = true;
}

function updateAuditJob(id: string, updates: Partial<StoredAuditJob>): StoredAuditJob | null {
  const currentJob = auditJobById.get(id);
  if (!currentJob || isTerminalAuditJob(currentJob.status)) return null;

  const updatedJob = { ...currentJob, ...updates };
  storeAuditJob(updatedJob);
  persistAuditJobs();
  return updatedJob;
}

export function cancelAuditJob(auditJobId: string, reason: string): StoredAuditJob | null {
  ensureRecoveredAuditJobs();
  return updateAuditJob(auditJobId, { status: "cancelled", reason });
}

export function rehydrateAuditJobs(jobs: readonly StoredAuditJob[]): void {
  auditJobById.clear();
  auditJobByFingerprint.clear();
  for (const job of jobs) {
    storeAuditJob(job);
  }
}

export async function createAuditJob(
  sessionId: string,
  target?: AuditTarget,
  options: CreateAuditJobOptions = {},
): Promise<StoredAuditJob> {
  ensureRecoveredAuditJobs();

  const fingerprint = target
    ? fingerprintAuditTarget(target.targetContent, target.analyzerVersion)
    : null;
  const matchingAudit = fingerprint ? auditJobByFingerprint.get(fingerprint) : null;

  if (matchingAudit && !options.rerun) return matchingAudit;

  const job: StoredAuditJob = {
    id: `audit_${randomUUID()}`,
    sessionId,
    status: "queued",
    createdAt: new Date().toISOString(),
    ...(fingerprint ? { fingerprint } : {}),
  };

  storeAuditJob(job);
  persistAuditJobs();

  const pricing = options.pricing ?? unavailablePricing;
  setImmediate(() => {
    void dispatchQueuedAudit({ auditId: job.id, pricing, sessionId })
      .then(async (child) => {
        if (!child) {
          updateAuditJob(job.id, { status: "failed" });
          return;
        }

        updateAuditJob(job.id, {
          status: "running",
          ...(typeof child.pid === "number" ? { pid: child.pid } : {}),
        });

        const terminalState = await reconcileAudit({ bundleDirectory: getAuditBundleDirectory(job.id), child });
        updateAuditJob(job.id, terminalState);
        rehydrateAuditJobs(indexAuditBundlesOnStartup());
      })
      .catch((error) => {
        updateAuditJob(job.id, { status: "failed" });
        console.error(`Failed to start audit ${job.id}`, error);
      });
  });

  return job;
}

export async function getAuditJobsForSession(sessionId: string): Promise<StoredAuditJob[]> {
  ensureRecoveredAuditJobs();
  return [...auditJobById.values()].filter((job) => job.sessionId === sessionId).sort(compareAuditJobs);
}

export async function getLatestAuditJobForSession(sessionId: string): Promise<StoredAuditJob | null> {
  const jobs = await getAuditJobsForSession(sessionId);
  return jobs[jobs.length - 1] ?? null;
}

export async function getAuditJobById(auditJobId: string): Promise<StoredAuditJob | null> {
  ensureRecoveredAuditJobs();
  return auditJobById.get(auditJobId) ?? null;
}

export async function getAuditJobByFingerprint(fingerprint: string): Promise<StoredAuditJob | null> {
  ensureRecoveredAuditJobs();
  return auditJobByFingerprint.get(fingerprint) ?? null;
}
