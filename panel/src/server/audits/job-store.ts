import { randomUUID } from "node:crypto";
import { dispatchQueuedAudit } from "./dispatch";
import type { AuditPricing } from "./analyzer-command";
import { fingerprintAuditTarget, type AuditTarget } from "./fingerprint";
import type { AuditJob } from "./types";

// Module scope keeps jobs alive across browser reloads while this panel runtime
// remains alive. A later persistent backing store can retain this interface.
const latestAuditJobBySessionId = new Map<string, AuditJob>();
const auditJobById = new Map<string, AuditJob>();
const auditJobByFingerprint = new Map<string, AuditJob>();

const unavailablePricing: AuditPricing = { available: false, pricing: null };

export interface CreateAuditJobOptions {
  rerun?: boolean;
  pricing?: AuditPricing;
}

export async function createAuditJob(
  sessionId: string,
  target?: AuditTarget,
  options: CreateAuditJobOptions = {},
): Promise<AuditJob> {
  const fingerprint = target
    ? fingerprintAuditTarget(target.targetContent, target.analyzerVersion)
    : null;
  const matchingAudit = fingerprint ? auditJobByFingerprint.get(fingerprint) : null;

  if (matchingAudit && !options.rerun) return matchingAudit;

  const job: AuditJob = {
    id: `audit_${randomUUID()}`,
    sessionId,
    status: "queued",
    createdAt: new Date().toISOString(),
  };

  latestAuditJobBySessionId.set(sessionId, job);
  auditJobById.set(job.id, job);

  if (fingerprint) {
    auditJobByFingerprint.set(fingerprint, job);
  }

  const pricing = options.pricing ?? unavailablePricing;
  setImmediate(() => {
    void dispatchQueuedAudit({ auditId: job.id, pricing, sessionId }).catch((error) => {
      console.error(`Failed to start audit ${job.id}`, error);
    });
  });

  return job;
}

export async function getLatestAuditJobForSession(sessionId: string): Promise<AuditJob | null> {
  return latestAuditJobBySessionId.get(sessionId) ?? null;
}

export async function getAuditJobById(auditJobId: string): Promise<AuditJob | null> {
  return auditJobById.get(auditJobId) ?? null;
}

export async function getAuditJobByFingerprint(fingerprint: string): Promise<AuditJob | null> {
  return auditJobByFingerprint.get(fingerprint) ?? null;
}
