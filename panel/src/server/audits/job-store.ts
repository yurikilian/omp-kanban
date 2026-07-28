import { randomUUID } from "node:crypto";
import type { AuditJob } from "./types";
// Module scope keeps jobs alive across browser reloads while this panel runtime
// remains alive. A later persistent backing store can retain this interface.
const latestAuditJobBySessionId = new Map<string, AuditJob>();

export async function createAuditJob(sessionId: string): Promise<AuditJob> {
  const job: AuditJob = {
    id: `audit_${randomUUID()}`,
    sessionId,
    status: "queued",
    createdAt: new Date().toISOString(),
  };

  latestAuditJobBySessionId.set(sessionId, job);

  return job;
}

export async function getLatestAuditJobForSession(sessionId: string): Promise<AuditJob | null> {
  return latestAuditJobBySessionId.get(sessionId) ?? null;
}