"use client";

import { useState, useTransition } from "react";
import type { AuditReport } from "@/server/audits/bundle-schema";
import { cancelAudit } from "@/server/audits/cancel";
import { FindingCard } from "./finding-card";

/** The audit currently being generated, if any - the only state cancellation applies to (E4-S6-AC6). */
export interface AuditPanelRunningJob {
  id: string;
  status: "queued" | "running";
}

export interface AuditPanelProps {
  audit: AuditReport | null;
  runningJob?: AuditPanelRunningJob | null;
}

export function AuditPanel({ audit, runningJob = null }: AuditPanelProps) {
  const [isCancelling, startCancelling] = useTransition();
  const [cancellationOutcome, setCancellationOutcome] = useState<"cancelled" | "failed" | null>(null);

  function handleCancel() {
    if (!runningJob) return;
    setCancellationOutcome(null);
    startCancelling(async () => {
      const result = await cancelAudit(runningJob.id);
      setCancellationOutcome(result.ok ? "cancelled" : "failed");
    });
  }

  return (
    <section role="region" aria-label="Audit findings" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Audit findings</h2>
        {runningJob && cancellationOutcome !== "cancelled" ? (
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
      {cancellationOutcome === "cancelled" ? (
        <p role="status" aria-label="Audit cancellation" className="text-sm text-muted-foreground">
          This audit was cancelled.
        </p>
      ) : null}
      {cancellationOutcome === "failed" ? (
        <p role="alert">Could not cancel the audit. It may have already finished.</p>
      ) : null}
      {audit === null ? (
        <p className="text-sm text-muted-foreground">No audit has been completed for this session yet.</p>
      ) : audit.findings.length === 0 ? (
        <p className="text-sm text-muted-foreground">This completed audit found no findings.</p>
      ) : (
        audit.findings.map((finding) => <FindingCard key={finding.id} auditId={audit.auditId} finding={finding} />)
      )}
    </section>
  );
}
