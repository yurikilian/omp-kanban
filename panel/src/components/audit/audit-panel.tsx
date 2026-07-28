import type { AuditReport } from "@/server/audits/bundle-schema";
import { FindingCard } from "./finding-card";

export interface AuditPanelProps {
  audit: AuditReport | null;
}

export function AuditPanel({ audit }: AuditPanelProps) {
  if (!audit) return null;

  return (
    <section role="region" aria-label="Audit findings" className="space-y-3">
      <h2 className="text-lg font-semibold">Audit findings</h2>
      {audit.findings.map((finding) => (
        <FindingCard key={finding.id} finding={finding} />
      ))}
    </section>
  );
}
