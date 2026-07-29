"use client";

import { useState, type MouseEvent } from "react";
import { MissingEvidenceNotice } from "./missing-evidence-notice";

export interface EvidenceLinkProps {
  auditId: string;
  evidenceId: string;
}

export function EvidenceLink({ auditId, evidenceId }: EvidenceLinkProps) {
  const [eventMissing, setEventMissing] = useState(false);
  const query = new URLSearchParams({ evidenceId }).toString();
  const href = `/api/audits/${encodeURIComponent(auditId)}/evidence?${query}`;

  if (eventMissing) {
    return <MissingEvidenceNotice evidenceId={evidenceId} />;
  }

  async function handleClick(clickEvent: MouseEvent<HTMLAnchorElement>) {
    clickEvent.preventDefault();

    try {
      // A redirect the browser followed means the target session, agent
      // and event all resolved - hand off to a real navigation there
      // rather than the fetched document. Anything else - including a
      // network failure - falls through to a normal navigation on `href`,
      // exactly as this link behaved before this check existed.
      const response = await fetch(href);
      if (response.redirected) {
        window.location.assign(response.url);
        return;
      }

      const body: unknown = await response.json().catch(() => undefined);
      if (body && typeof body === "object" && "status" in body && body.status === "event-missing") {
        setEventMissing(true);
        return;
      }
    } catch {
      // fall through
    }

    window.location.assign(href);
  }

  return (
    <a href={href} aria-label={`Open evidence ${evidenceId}`} className="text-sm text-primary underline-offset-4 hover:underline" onClick={handleClick}>
      Evidence {evidenceId}
    </a>
  );
}
