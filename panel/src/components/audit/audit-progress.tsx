import { LiveRegion } from "@/components/layout/live-region";

/** The in-flight lifecycle states this component reports on (E4-S6-AC5). */
export type AuditProgressStatus = "queued" | "running" | "cancelling";

export interface AuditProgressProps {
  status: AuditProgressStatus;
}

const PROGRESS_LABEL: Record<AuditProgressStatus, string> = {
  queued: "Queued",
  running: "Running",
  cancelling: "Cancelling…",
};

const PROGRESS_ANNOUNCEMENT: Record<AuditProgressStatus, string> = {
  queued: "Audit status: queued.",
  running: "Audit status: running.",
  cancelling: "Audit status: cancelling.",
};

/**
 * Surfaces one in-flight audit's progress as its own readable text, not
 * only as a spinner a sighted user infers motion from, and announces every
 * status change through the shared live region so a screen reader user
 * learns the audit moved on without polling the panel (E4-S6-AC5).
 */
export function AuditProgress({ status }: AuditProgressProps) {
  return (
    <>
      <p aria-label="Audit progress" className="text-sm text-muted-foreground">
        {PROGRESS_LABEL[status]}
      </p>
      <LiveRegion message={PROGRESS_ANNOUNCEMENT[status]} />
    </>
  );
}
