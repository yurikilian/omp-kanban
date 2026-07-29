"use client";

import { useEffect, useState } from "react";
import type { AuditEligibility } from "@/server/audits/eligibility";
import type { AuditJob } from "@/server/audits/types";
import { PricingPrompt } from "./pricing-prompt";
import { RerunAuditDialog } from "./rerun-audit-dialog";

export interface GenerateAuditButtonProps {
  sessionId: string;
  sessionTitle: string;
  eligibility?: AuditEligibility;
}

export function GenerateAuditButton({ sessionId, sessionTitle, eligibility }: GenerateAuditButtonProps) {
  const auditEligibility = eligibility ?? { eligible: true };
  const [auditJob, setAuditJob] = useState<AuditJob | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pricing, setPricing] = useState("");
  const [isRerunDialogOpen, setIsRerunDialogOpen] = useState(false);

  useEffect(() => {
    if (!auditEligibility.eligible) return;
    let cancelled = false;

    fetch(`/api/audits?sessionId=${encodeURIComponent(sessionId)}`)
      .then((response) => {
        if (!response.ok) throw new Error(`Failed to load audit: ${response.status}`);
        return response.json() as Promise<AuditJob[]>;
      })
      .then((jobs) => {
        const latestAuditJob = jobs[jobs.length - 1];
        if (!cancelled && latestAuditJob) setAuditJob((currentJob) => currentJob ?? latestAuditJob);
      })
      .catch(() => {
        // A session without an audit is still usable even if a status refresh fails.
      });

    return () => {
      cancelled = true;
    };
  }, [auditEligibility.eligible, sessionId]);

  async function generateAudit(rerun = false) {
    if (!rerun && !auditEligibility.eligible) return;
    setIsCreating(true);
    setError(null);

    try {
      const response = await fetch("/api/audits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          rerun ? { sessionId, rerun: true } : pricing.trim() ? { sessionId, pricing } : { sessionId },
        ),
      });
      if (!response.ok) throw new Error(`Failed to create audit: ${response.status}`);

      setAuditJob((await response.json()) as AuditJob);
    } catch {
      setError("Could not create the audit. Try again.");
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <section aria-label="Audit generation" className="flex flex-wrap items-center gap-2">
      <p className="text-sm text-muted-foreground">Audit target: {sessionTitle}</p>
      {!auditJob ? (
        <>
          {auditEligibility.eligible ? <PricingPrompt pricing={pricing} onPricingChange={setPricing} /> : null}
          <button
            type="button"
            aria-label={`Generate audit for ${sessionTitle}`}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
            disabled={!auditEligibility.eligible || isCreating}
            onClick={() => void generateAudit()}
          >
            {isCreating ? "Generating audit…" : "Generate audit"}
          </button>
          {!auditEligibility.eligible ? (
            <p role="status" className="text-sm text-muted-foreground">
              {auditEligibility.reason}
            </p>
          ) : null}
        </>
      ) : (
        <>
          <button
            type="button"
            aria-label={`Rerun audit for ${sessionTitle}`}
            className="rounded-md border px-3 py-1.5 text-sm font-medium"
            disabled={isCreating}
            onClick={() => setIsRerunDialogOpen(true)}
          >
            Rerun audit
          </button>
          <p role="status" className="text-sm text-muted-foreground">
            Audit {auditJob.id} is {auditJob.status}.
          </p>
        </>
      )}
      {error ? <p role="alert">{error}</p> : null}
      <RerunAuditDialog
        sessionTitle={sessionTitle}
        isOpen={isRerunDialogOpen}
        isSubmitting={isCreating}
        onCancel={() => setIsRerunDialogOpen(false)}
        onConfirm={() => {
          setIsRerunDialogOpen(false);
          void generateAudit(true);
        }}
      />
    </section>
  );
}
