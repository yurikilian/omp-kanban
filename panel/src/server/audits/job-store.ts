import { randomUUID } from "node:crypto";
import { dispatchQueuedAudit } from "./dispatch";
import type { AuditPricing } from "./analyzer-command";
import type { AuditJob } from "./types";

// Module scope keeps jobs alive across browser reloads while this panel runtime
// remains alive. A later persistent backing store can retain this interface.
const latestAuditJobBySessionId = new Map<string, AuditJob>();

const unavailablePricing: AuditPricing = { available: false, pricing: null };

export async function createAuditJob(
  sessionId: string,
  pricing: AuditPricing = unavailablePricing,
): Promise<AuditJob> {
  const job: AuditJob = {
    id: `audit_${randomUUID()}`,
    sessionId,
    status: "queued",
    createdAt: new Date().toISOString(),
  };

  latestAuditJobBySessionId.set(sessionId, job);

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