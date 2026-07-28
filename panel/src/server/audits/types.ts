export type AuditJobStatus = "queued";

export interface AuditJob {
  id: string;
  sessionId: string;
  status: AuditJobStatus;
  createdAt: string;
}