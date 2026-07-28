import type { Finding } from "@/server/audits/bundle-schema";

export interface SeverityBadgeProps {
  severity: Finding["severity"];
}

const severityClasses = {
  low: "bg-slate-100 text-slate-800",
  medium: "bg-amber-100 text-amber-900",
  high: "bg-red-100 text-red-900",
} as const;

export function SeverityBadge({ severity }: SeverityBadgeProps) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${severityClasses[severity]}`}>
      {severity[0].toUpperCase() + severity.slice(1)} severity
    </span>
  );
}
