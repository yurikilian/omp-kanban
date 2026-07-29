import type { EstimatedSavings, Finding, ObservedImpact, SavingsRange } from "@/server/audits/bundle-schema";
import { ProvenanceLabel } from "./provenance-label";
import { SeverityBadge } from "./severity-badge";

export interface FindingCardProps {
  finding: Finding;
}

function formatTokenCount(value: number, kind: "input" | "output"): string {
  return `${value.toLocaleString("en-US")} ${kind} tokens`;
}

function formatCost(value: number): string {
  return `$${value.toFixed(2)}`;
}

function formatObservedImpact(impact: ObservedImpact): string {
  const values: string[] = [];
  if (impact.inputTokens !== null) values.push(formatTokenCount(impact.inputTokens, "input"));
  if (impact.outputTokens !== null) values.push(formatTokenCount(impact.outputTokens, "output"));
  if (impact.cost !== null) values.push(formatCost(impact.cost));
  return values.join(", ") || "Unavailable";
}

interface SavingsRangeRowProps {
  metric: "input" | "output" | "cost";
  range: SavingsRange;
}

function SavingsRangeRow({ metric, range }: SavingsRangeRowProps) {
  const label = metric === "cost" ? "Cost" : `${metric[0].toUpperCase() + metric.slice(1)} tokens`;

  return (
    <tr>
      <th scope="row" className="pr-3 text-left font-medium">
        {label}
      </th>
      <td className="px-2 tabular-nums">
        {metric === "cost" ? formatCost(range.minimum) : formatTokenCount(range.minimum, metric)}
      </td>
      <td className="px-2 tabular-nums">
        {metric === "cost" ? formatCost(range.likely) : formatTokenCount(range.likely, metric)}
      </td>
      <td className="pl-2 tabular-nums">
        {metric === "cost" ? formatCost(range.maximum) : formatTokenCount(range.maximum, metric)}
      </td>
    </tr>
  );
}

interface UnavailableCostRowProps {
  label: string;
}

function UnavailableCostRow({ label }: UnavailableCostRowProps) {
  return (
    <tr>
      <th scope="row" className="pr-3 text-left font-medium">
        {label}
      </th>
      <td colSpan={3} className="pl-2 text-muted-foreground">
        Pricing unavailable
      </td>
    </tr>
  );
}

function SavingsRanges({ savings }: { savings: EstimatedSavings }) {
  const hasSavings = savings.inputTokens || savings.outputTokens || savings.cost;
  if (!hasSavings) {
    return <p className="text-sm text-muted-foreground">Pricing unavailable</p>;
  }

  return (
    <table aria-label="Savings ranges" className="text-sm">
      <thead>
        <tr>
          <th scope="col" className="pr-3 text-left font-medium">
            Metric
          </th>
          <th scope="col" className="px-2 text-left font-medium">
            Minimum
          </th>
          <th scope="col" className="px-2 text-left font-medium">
            Likely
          </th>
          <th scope="col" className="pl-2 text-left font-medium">
            Maximum
          </th>
        </tr>
      </thead>
      <tbody>
        {savings.inputTokens ? <SavingsRangeRow metric="input" range={savings.inputTokens} /> : null}
        {savings.outputTokens ? <SavingsRangeRow metric="output" range={savings.outputTokens} /> : null}
        {savings.cost ? <SavingsRangeRow metric="cost" range={savings.cost} /> : <UnavailableCostRow label="Cost" />}
      </tbody>
    </table>
  );
}

export function FindingCard({ finding }: FindingCardProps) {
  const headingId = `finding-${finding.id}`;

  return (
    <article aria-labelledby={headingId} className="space-y-2 rounded-md border p-3">
      <div className="flex items-center justify-between gap-2">
        <SeverityBadge severity={finding.severity} />
        <p className="text-sm text-muted-foreground">{finding.confidence[0].toUpperCase() + finding.confidence.slice(1)} confidence</p>
      </div>
      <h3 id={headingId} className="font-semibold">
        {finding.title}
      </h3>
      <p>{finding.summary}</p>
      <div>
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-sm font-medium">Observed impact</h4>
          <ProvenanceLabel provenance="observed" />
        </div>
        <p className="text-sm text-muted-foreground">
          {formatObservedImpact(finding.observedImpact)}
          {finding.observedImpact.cost === null ? " · Pricing unavailable" : null}
        </p>
      </div>
      <div>
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-sm font-medium">Estimated savings</h4>
          <ProvenanceLabel provenance="estimated" />
        </div>
        <SavingsRanges savings={finding.estimatedSavings} />
      </div>
    </article>
  );
}
