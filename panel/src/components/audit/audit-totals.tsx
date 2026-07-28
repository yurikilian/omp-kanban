import type { SessionTotals } from "@/server/audits/bundle-schema";
import { ProvenanceLabel } from "./provenance-label";

export interface AuditTotalsProps {
  totals: SessionTotals;
}

function formatTokenCount(value: number, kind: "input" | "output"): string {
  return `${value.toLocaleString("en-US")} ${kind} tokens`;
}

function formatCost(value: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(value);
}


export function AuditTotals({ totals }: AuditTotalsProps) {

  return (
    <section role="region" aria-label="Audit totals" className="space-y-2 rounded-md border p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold">Audit totals</h3>
        <ProvenanceLabel provenance="derived" />
      </div>
      <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-muted-foreground">Input tokens</dt>
          <dd className="tabular-nums">{totals.inputTokens === null ? "Unavailable" : formatTokenCount(totals.inputTokens, "input")}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Output tokens</dt>
          <dd className="tabular-nums">{totals.outputTokens === null ? "Unavailable" : formatTokenCount(totals.outputTokens, "output")}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Cost</dt>
          <dd className="tabular-nums">{totals.cost === null || totals.currency === null ? "Pricing unavailable" : formatCost(totals.cost, totals.currency)}</dd>
        </div>
      </dl>
    </section>
  );
}
