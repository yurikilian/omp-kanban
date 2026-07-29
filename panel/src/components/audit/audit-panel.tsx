"use client";

import { useTransition } from "react";
import type { AuditStateInput } from "@/lib/audit-states";
import type { AuditReport } from "@/server/audits/bundle-schema";
import type { AuditJob } from "@/server/audits/types";
import { AuditProgress, type AuditProgressStatus } from "./audit-progress";
import { AuditState } from "./audit-state";
import { FindingCard } from "./finding-card";

export interface AuditPanelRunningJob {
  id: string;
  status: "queued" | "running";
}

export interface AuditPanelProps {
  audit: AuditReport | null;
  auditJobs?: readonly AuditJob[];
  runningJob?: AuditPanelRunningJob | null;
  onCancelAudit?: (auditId: string) => Promise<void>;
}

function failureReasonForAuditJob(auditJob: AuditJob): string {
  const durableReason = [auditJob.failureSummary, auditJob.stderrSummary, auditJob.reason].find(
    (reason): reason is string => typeof reason === "string" && reason.trim().length > 0,
  );
  if (durableReason) return durableReason;

  return typeof auditJob.exitStatus === "number"
    ? `The analyzer exited with status ${auditJob.exitStatus}.`
    : "The analyzer stopped before completing the audit.";
}

function stateInputForAuditJob(auditJob: AuditJob): AuditStateInput | null {
  switch (auditJob.status) {
    case "queued":
    case "running":
    case "completed":
    case "insufficient_signal":
      return { status: auditJob.status };
    case "cancelled":
      return {
        status: "cancelled",
        cancellationReason: auditJob.reason ?? "No cancellation reason was recorded.",
      };
    case "failed":
      return {
        status: "failed",
        failureReason: failureReasonForAuditJob(auditJob),
        retryAvailable: true,
      };
    default:
      return null;
  }
}

function latestAuditInProgress(auditJobs: readonly AuditJob[]): AuditPanelRunningJob | null {
  for (let index = auditJobs.length - 1; index >= 0; index -= 1) {
    const auditJob = auditJobs[index];
    if (auditJob.status === "queued" || auditJob.status === "running") {
      return { id: auditJob.id, status: auditJob.status };
    }
  }

  return null;
}

export function AuditPanel({ audit, auditJobs = [], runningJob = null, onCancelAudit }: AuditPanelProps) {
  const [isCancelling, startCancelling] = useTransition();
  const activeJob = runningJob ?? latestAuditInProgress(auditJobs);
  const cancellableAuditId = activeJob?.status === "running" ? activeJob.id : null;

  function handleCancel() {
    if (!cancellableAuditId || !onCancelAudit) return;

    startCancelling(async () => {
      await onCancelAudit(cancellableAuditId);
    });
  }

  const progressStatus: AuditProgressStatus | null = isCancelling ? "cancelling" : activeJob?.status ?? null;

  return (
    <section role="region" aria-label="Audit findings" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Audit findings</h2>
        {cancellableAuditId && onCancelAudit ? (
          <button
            type="button"
            aria-label="Cancel audit"
            className="rounded-md border px-3 py-1.5 text-sm font-medium"
            disabled={isCancelling}
            onClick={handleCancel}
          >
            {isCancelling ? "Cancelling…" : "Cancel audit"}
          </button>
        ) : null}
      </div>
      {progressStatus ? <AuditProgress status={progressStatus} /> : null}
      {auditJobs.map((auditJob) => {
        const stateInput = stateInputForAuditJob(auditJob);
        return stateInput ? <AuditState key={auditJob.id} {...stateInput} /> : null;
      })}
      {audit === null && auditJobs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No audit has been completed for this session yet.</p>
      ) : audit?.findings.length === 0 ? (
        <p className="text-sm text-muted-foreground">This completed audit found no findings.</p>
      ) : audit ? (
        audit.findings.map((finding) => <FindingCard key={finding.id} auditId={audit.auditId} finding={finding} />)
      ) : null}
    </section>
  );
}
