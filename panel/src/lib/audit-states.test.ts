import { describe, expect, it } from "vitest";
import { describeAuditState, type AuditLifecycleStatus, type AuditStateInput } from "./audit-states";

const SIMPLE_STATES: Exclude<AuditLifecycleStatus, "failed" | "cancelled">[] = [
  "queued",
  "running",
  "completed",
  "insufficient_signal",
];

const CANCELLED_INPUT: AuditStateInput = {
  status: "cancelled",
  cancellationReason: "the user stopped the analyzer",
};

function describe_(status: Exclude<AuditLifecycleStatus, "failed" | "cancelled">) {
  return describeAuditState({ status });
}

function describeCancelled() {
  return describeAuditState(CANCELLED_INPUT);
}

describe("describeAuditState", () => {
  it("gives every one of the six lifecycle states its own label and its own explanation (E4-S6-AC2)", () => {
    const failed = describeAuditState({
      status: "failed",
      failureReason: "the transcript could not be read",
      retryAvailable: true,
    });
    const descriptions = [...SIMPLE_STATES.map(describe_), describeCancelled(), failed];

    const labels = new Set(descriptions.map((d) => d.label));
    const explanations = new Set(descriptions.map((d) => d.explanation));

    expect(labels.size).toBe(descriptions.length);
    expect(explanations.size).toBe(descriptions.length);
  });

  it("labels each state distinctly and matches its own status (E4-S6-AC2)", () => {
    expect(describe_("queued")).toMatchObject({ status: "queued", label: "Queued" });
    expect(describe_("running")).toMatchObject({ status: "running", label: "Running" });
    expect(describe_("completed")).toMatchObject({ status: "completed", label: "Completed" });
    expect(describeCancelled()).toMatchObject({ status: "cancelled", label: "Cancelled" });
    expect(describe_("insufficient_signal")).toMatchObject({
      status: "insufficient_signal",
      label: "Insufficient signal",
    });
  });

  it("only ever assigns the alert role to the failed state - every other state is status (E4-S6-AC3)", () => {
    for (const status of SIMPLE_STATES) {
      expect(describe_(status).role).toBe("status");
    }
    expect(describeCancelled().role).toBe("status");
    expect(describeAuditState({ status: "failed", failureReason: "crash", retryAvailable: true }).role).toBe("alert");
  });

  it("states what failed and that a retry is available when it is (E4-S6-AC2)", () => {
    const description = describeAuditState({
      status: "failed",
      failureReason: "the transcript path did not exist",
      retryAvailable: true,
    });

    expect(description.label).toBe("Failed");
    expect(description.explanation).toContain("the transcript path did not exist");
    expect(description.retryAvailable).toBe(true);
    expect(description.retryStatement).toBe("You can retry this audit from its session.");
  });

  it("states what failed and that no retry is available when it is not (E4-S6-AC2)", () => {
    const description = describeAuditState({
      status: "failed",
      failureReason: "the analyzer crashed before writing a manifest",
      retryAvailable: false,
    });

    expect(description.explanation).toContain("the analyzer crashed before writing a manifest");
    expect(description.retryAvailable).toBe(false);
    expect(description.retryStatement).toBe("A retry is not available for this audit.");
  });

  it("keeps a cancelled audit's recorded reason in its explanation (E4-S6-AC4)", () => {
    const description = describeAuditState({
      status: "cancelled",
      cancellationReason: "the user stopped the analyzer",
    });

    expect(description.label).toBe("Cancelled");
    expect(description.explanation).toContain("the user stopped the analyzer");
  });

  it("never states retry availability for a state other than failed (E4-S6-AC2)", () => {
    for (const status of SIMPLE_STATES) {
      const description = describe_(status);
      expect(description.retryAvailable).toBeUndefined();
      expect(description.retryStatement).toBeUndefined();
    }
    expect(describeCancelled().retryAvailable).toBeUndefined();
    expect(describeCancelled().retryStatement).toBeUndefined();
  });

  it("explains insufficient signal as too small to audit, never as an error or a zero-findings result (E4-S6-AC3)", () => {
    const description = describe_("insufficient_signal");

    expect(description.explanation.toLowerCase()).toContain("too small to audit");
    expect(description.explanation.toLowerCase()).not.toContain("error");
    expect(description.explanation.toLowerCase()).not.toContain("failed");
    expect(description.explanation.toLowerCase()).not.toContain("finding");
  });

  it("is total over every status the lifecycle can end in, so none can silently go undescribed (E4-S6-AC4)", () => {
    const inputs: AuditStateInput[] = [
      ...SIMPLE_STATES.map((status) => ({ status })),
      CANCELLED_INPUT,
      { status: "failed", failureReason: "unknown", retryAvailable: false },
    ];

    for (const input of inputs) {
      expect(() => describeAuditState(input)).not.toThrow();
    }
  });
});
