import type { BundleValidation } from "@/server/audits/validate";
import { describeAuditState, type AuditLifecycleStatus, type AuditStateInput } from "@/lib/audit-states";
import { InvalidBundleNotice } from "./invalid-bundle-notice";

export type AuditStateProps = AuditStateInput | { bundleDir: string; validation: BundleValidation };

// Same literal-Tailwind-palette convention as severity-badge.tsx's
// severityClasses - a tone per status so failed reads distinctly from
// insufficient_signal even before either sentence is read (E4-S6-AC3).
const STATE_BADGE_CLASSES: Record<AuditLifecycleStatus, string> = {
  queued: "bg-slate-100 text-slate-800",
  running: "bg-blue-100 text-blue-900",
  completed: "bg-emerald-100 text-emerald-900",
  insufficient_signal: "bg-amber-100 text-amber-900",
  cancelled: "bg-slate-100 text-slate-700",
  failed: "bg-red-100 text-red-900",
};

/**
 * Renders one audit's current state. Two unrelated concerns share this
 * component because they share a name: given `bundleDir`/`validation` it
 * keeps its original job of surfacing an invalid bundle (E4-S5-AC5);
 * given a lifecycle `status` it renders that status's label, explanation
 * and, for `failed`, retry availability (E4-S6-AC2). Every lifecycle status
 * renders something distinct and non-null - a failed or cancelled audit is
 * never silently dropped (E4-S6-AC4).
 */
export function AuditState(props: AuditStateProps) {
  if ("validation" in props) {
    if (props.validation.status !== "invalid") return null;
    return <InvalidBundleNotice bundleDir={props.bundleDir} validation={props.validation} />;
  }

  const description = describeAuditState(props);

  return (
    <section
      role={description.role}
      aria-label={`Audit status: ${description.label}`}
      data-audit-state={description.status}
      className="space-y-1.5 rounded-md border p-3"
    >
      <span
        className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${STATE_BADGE_CLASSES[description.status]}`}
      >
        {description.label}
      </span>
      <p className="text-sm text-foreground">{description.explanation}</p>
      {description.retryStatement ? (
        <p className="text-sm text-muted-foreground">{description.retryStatement}</p>
      ) : null}
    </section>
  );
}
