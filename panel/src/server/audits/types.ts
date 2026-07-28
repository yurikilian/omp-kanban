export type AuditJobStatus = "queued" | "completed" | "failed";

export interface AuditJob {
  id: string;
  sessionId: string;
  status: AuditJobStatus;
  createdAt: string;
  exitStatus?: number | null;
  stderrSummary?: string;
}