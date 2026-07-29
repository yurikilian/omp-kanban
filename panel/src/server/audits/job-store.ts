import { randomUUID } from "node:crypto";
import { dispatchQueuedAudit } from "./dispatch";
import type { AuditPricing } from "./analyzer-command";
import { fingerprintAuditTarget, type AuditTarget } from "./fingerprint";
import {
  indexAuditBundlesOnStartup,
  writeAuditJobRecords,
  type IndexedAuditJob,
} from "./startup-index";

const latestAuditJobBySessionId = new Map<string, StoredAuditJob>();
const auditJobById = new Map<string, StoredAuditJob>();
const auditJobByFingerprint = new Map<string, StoredAuditJob>();

const unavailablePricing: AuditPricing = { available: false, pricing: null };
let hasRecoveredAuditJobs = false;

export type StoredAuditJob = IndexedAuditJob;

export interface CreateAuditJobOptions {
  rerun?: boolean;
  pricing?: AuditPricing;
}

function isNewerAuditJob(candidate: StoredAuditJob, current: StoredAuditJob): boolean {
  const createdAtComparison = candidate.createdAt.localeCompare(current.createdAt);
  return createdAtComparison > 0 || (createdAtComparison === 0 && candidate.id.localeCompare(current.id) >= 0);
}

function storeAuditJob(job: StoredAuditJob): void {
  auditJobById.set(job.id, job);
  const latestJob = latestAuditJobBySessionId.get(job.sessionId);
  if (!latestJob || isNewerAuditJob(job, latestJob)) {
    latestAuditJobBySessionId.set(job.sessionId, job);
  }
  if (job.fingerprint) auditJobByFingerprint.set(job.fingerprint, job);
}

function persistAuditJobs(): void {
  writeAuditJobRecords([...auditJobById.values()]);
}

function ensureRecoveredAuditJobs(): void {
  if (hasRecoveredAuditJobs) return;

  hasRecoveredAuditJobs = true;
  rehydrateAuditJobs(indexAuditBundlesOnStartup());
}

function updateAuditJobStatus(id: string, status: StoredAuditJob["status"]): void {
  const currentJob = auditJobById.get(id);
  if (!currentJob) return;

  storeAuditJob({ ...currentJob, status });
  persistAuditJobs();
}

export function rehydrateAuditJobs(jobs: readonly StoredAuditJob[]): void {
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
      .then((child) => {
        if (!child) {
          updateAuditJobStatus(job.id, "failed");
          return;
        }

        updateAuditJobStatus(job.id, "running");
        child.once("close", () => {
          rehydrateAuditJobs(indexAuditBundlesOnStartup());
          if (auditJobById.get(job.id)?.status === "running") {
            updateAuditJobStatus(job.id, "failed");
          }
        });
      })
      .catch((error) => {
        updateAuditJobStatus(job.id, "failed");
        console.error(`Failed to start audit ${job.id}`, error);
      });
  });

  return job;
}

export async function getLatestAuditJobForSession(sessionId: string): Promise<StoredAuditJob | null> {
  ensureRecoveredAuditJobs();
  return latestAuditJobBySessionId.get(sessionId) ?? null;
}

export async function getAuditJobById(auditJobId: string): Promise<StoredAuditJob | null> {
  ensureRecoveredAuditJobs();
  return auditJobById.get(auditJobId) ?? null;
}

export async function getAuditJobByFingerprint(fingerprint: string): Promise<StoredAuditJob | null> {
  ensureRecoveredAuditJobs();
  return auditJobByFingerprint.get(fingerprint) ?? null;
}
