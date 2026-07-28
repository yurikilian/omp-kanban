"use client";

import { useEffect, useState } from "react";
import type { AuditEligibility } from "@/server/audits/eligibility";
import type { AuditJob } from "@/server/audits/types";
import { PricingPrompt } from "./pricing-prompt";

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

  useEffect(() => {
    if (!auditEligibility.eligible) return;
    let cancelled = false;

    fetch(`/api/audits?sessionId=${encodeURIComponent(sessionId)}`)
      .then((response) => {
        if (!response.ok) throw new Error(`Failed to load audit: ${response.status}`);
        return response.json() as Promise<AuditJob | null>;
      })
      .then((job) => {
        if (!cancelled && job) setAuditJob((currentJob) => currentJob ?? job);
      })
      .catch(() => {
        // A session without an audit is still usable even if a status refresh fails.
      });

    return () => {
      cancelled = true;
    };
  }, [auditEligibility.eligible, sessionId]);

  async function generateAudit() {
    if (!auditEligibility.eligible) return;
    setIsCreating(true);
    setError(null);

    try {
      const response = await fetch("/api/audits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pricing.trim() ? { sessionId, pricing } : { sessionId }),
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
      {auditEligibility.eligible ? <PricingPrompt pricing={pricing} onPricingChange={setPricing} /> : null}
      <button
        type="button"
        aria-label={`Generate audit for ${sessionTitle}`}
        className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
        disabled={!auditEligibility.eligible || isCreating}
        onClick={generateAudit}
      >
        {isCreating ? "Generating audit…" : "Generate audit"}
      </button>
      {!auditEligibility.eligible ? (
        <p role="status" className="text-sm text-muted-foreground">
          {auditEligibility.reason}
        </p>
      ) : null}
      {auditJob ? (
        <p role="status" className="text-sm text-muted-foreground">
          Audit {auditJob.id} is {auditJob.status}.
        </p>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
    </section>
  );
}