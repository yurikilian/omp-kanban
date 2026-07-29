export interface EvidenceLinkProps {
  auditId: string;
  evidenceId: string;
}

export function EvidenceLink({ auditId, evidenceId }: EvidenceLinkProps) {
  const query = new URLSearchParams({ evidenceId }).toString();
  const href = `/api/audits/${encodeURIComponent(auditId)}/evidence?${query}`;

  return (
    <a href={href} aria-label={`Open evidence ${evidenceId}`} className="text-sm text-primary underline-offset-4 hover:underline">
      Evidence {evidenceId}
    </a>
  );
}
