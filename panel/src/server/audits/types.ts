export type AuditJobStatus =
  | "queued"
  | "running"
  | "completed"
  | "insufficient_signal"
  | "failed"
  | "cancelled"
  | "interrupted";

export interface AuditJob {
  id: string;
  sessionId: string;
  status: AuditJobStatus;
  createdAt: string;
  findings?: unknown[];
  fingerprint?: string;
  failureSummary?: string;
  exitStatus?: number | null;
  stderrSummary?: string;
}
