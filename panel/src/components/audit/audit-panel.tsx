import type { AuditReport } from "@/server/audits/bundle-schema";
import { FindingCard } from "./finding-card";

export interface AuditPanelProps {
  audit: AuditReport | null;
}

export function AuditPanel({ audit }: AuditPanelProps) {
  return (
    <section role="region" aria-label="Audit findings" className="space-y-3">
      <h2 className="text-lg font-semibold">Audit findings</h2>
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
