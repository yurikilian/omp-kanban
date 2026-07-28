"use client";

import { useEffect, useState } from "react";
import type { AuditJob } from "@/server/audits/types";

export interface GenerateAuditButtonProps {
  sessionId: string;
  sessionTitle: string;
}

export function GenerateAuditButton({ sessionId, sessionTitle }: GenerateAuditButtonProps) {
  const [auditJob, setAuditJob] = useState<AuditJob | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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
  }, [sessionId]);

  async function generateAudit() {
    setIsCreating(true);
    setError(null);

    try {
      const response = await fetch("/api/audits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
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
      <button
        type="button"
        aria-label={`Generate audit for ${sessionTitle}`}
        className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
        disabled={isCreating}
        onClick={generateAudit}
      >
        {isCreating ? "Generating audit…" : "Generate audit"}
      </button>
      {auditJob ? (
        <p role="status" className="text-sm text-muted-foreground">
          Audit {auditJob.id} is {auditJob.status}.
        </p>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
    </section>
  );
}