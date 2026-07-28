/**
 * The full audit lifecycle (`panel/docs/audit-bundle.md`, "Status values"):
 *
 *   queued -> running -> one of: completed | failed | cancelled | insufficient_signal
 *
 * `queued`, `running` and `cancelled` are recorded solely in the job
 * service's own job record; `completed`, `insufficient_signal` and a
 * self-detected `failed` are recorded by `kb-forensics` in a bundle's
 * `manifest.json`; a crash `failed` is recorded by the job service itself.
 * Wherever a status came from, this module only maps it onto what a reader
 * should see - it does not decide which one an audit is currently in.
 */
export type AuditLifecycleStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "insufficient_signal";

/**
 * `alert` is reserved for the one state that is a genuine failure. Every
 * other state - including `insufficient_signal` - is `status`, so a session
 * that was simply too small to audit is never presented the way an error is
 * (E4-S6-AC3).
 */
export type AuditStateRole = "status" | "alert";

export interface AuditStateDescription {
  status: AuditLifecycleStatus;
  /** Short and distinct per state, e.g. "Failed", "Insufficient signal" (E4-S6-AC2). */
  label: string;
  /** A full sentence explaining what this state means for this audit. */
  explanation: string;
  role: AuditStateRole;
  /** Set only when `status` is `"failed"` - whether the panel can offer a retry. */
  retryAvailable?: boolean;
  /** Set only when `status` is `"failed"` - the sentence stating `retryAvailable` (E4-S6-AC2). */
  retryStatement?: string;
}

/**
 * `failed` and `cancelled` each carry record-specific context rather than
 * fixed copy. A failed audit has either `manifest.failureSummary` or the job
 * record's crash summary and an explicit retry decision; a cancelled audit
 * retains why it was stopped. Requiring those fields here keeps the display
 * layer from replacing durable record reasons with a generic message
 * (E4-S6-AC2, E4-S6-AC4).
 */
export type AuditStateInput =
  | { status: Exclude<AuditLifecycleStatus, "failed" | "cancelled"> }
  | { status: "cancelled"; cancellationReason: string }
  | { status: "failed"; failureReason: string; retryAvailable: boolean };

function retryStatement(retryAvailable: boolean): string {
  return retryAvailable
    ? "You can retry this audit from its session."
    : "A retry is not available for this audit.";
}

type StaticDescription = Omit<AuditStateDescription, "retryAvailable" | "retryStatement">;

// The statuses with fixed reader-facing copy. A missing key is a compile
// error, so a new static lifecycle status cannot be added without its own
// label and explanation.
const STATIC_DESCRIPTIONS: Record<
  Exclude<AuditLifecycleStatus, "failed" | "cancelled">,
  StaticDescription
> = {
  queued: {
    status: "queued",
    label: "Queued",
    explanation: "This audit is queued and will start shortly.",
    role: "status",
  },
  running: {
    status: "running",
    label: "Running",
    explanation: "The analyzer is currently examining this session.",
    role: "status",
  },
  completed: {
    status: "completed",
    label: "Completed",
    explanation: "The analyzer finished and reported its findings for this session.",
    role: "status",
  },
  insufficient_signal: {
    status: "insufficient_signal",
    label: "Insufficient signal",
    explanation:
      "This session was too small to audit - there wasn't enough recorded activity for the analyzer to reach a conclusion.",
    role: "status",
  },
};

/**
 * Maps one audit's current lifecycle status onto a distinct label,
 * explanation and, for `failed`, retry availability (E4-S6-AC2). Failed and
 * cancelled record reasons are carried through untouched, so neither can be
 * silently replaced or dropped on a later render (E4-S6-AC4).
 */
export function describeAuditState(input: AuditStateInput): AuditStateDescription {
  if (input.status === "cancelled") {
    return {
      status: "cancelled",
      label: "Cancelled",
      explanation: `This audit was cancelled: ${input.cancellationReason}`,
      role: "status",
    };
  }

  if (input.status === "failed") {
    return {
      status: "failed",
      label: "Failed",
      explanation: `This audit failed: ${input.failureReason}`,
      role: "alert",
      retryAvailable: input.retryAvailable,
      retryStatement: retryStatement(input.retryAvailable),
    };
  }

  return STATIC_DESCRIPTIONS[input.status];
}
