import { randomUUID } from "node:crypto";
import { fingerprintAuditTarget, type AuditTarget } from "./fingerprint";
import type { AuditJob } from "./types";
// Module scope keeps jobs alive across browser reloads while this panel runtime
// remains alive. A later persistent backing store can retain this interface.
const latestAuditJobBySessionId = new Map<string, AuditJob>();
const auditJobById = new Map<string, AuditJob>();
const auditJobByFingerprint = new Map<string, AuditJob>();

export async function createAuditJob(sessionId: string, target?: AuditTarget): Promise<AuditJob> {
  const fingerprint = target
    ? fingerprintAuditTarget(target.targetContent, target.analyzerVersion)
    : null;
  const matchingAudit = fingerprint ? auditJobByFingerprint.get(fingerprint) : null;

  if (matchingAudit) return matchingAudit;

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