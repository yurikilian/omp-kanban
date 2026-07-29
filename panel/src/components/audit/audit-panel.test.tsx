import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { AuditReport } from "@/server/audits/bundle-schema";
import type { AuditJob } from "@/server/audits/types";
import type { SessionDetail as SessionDetailData } from "@/server/sessions/detail";
import { SessionDetail } from "../session/session-detail";
import { AuditPanel } from "./audit-panel";


const SESSION: SessionDetailData = {
  id: "2026-01-01T09-00-00-000Z_00000000-0000-7000-8000-00000000000a",
  title: "Refactor billing module",
  project: "alpha",
  startedAt: "2026-01-01T09:00:00.000Z",
  lastActivityAt: "2026-01-01T09:10:00.000Z",
  durationMs: 10 * 60 * 1000,
  costUsd: 0.015,
  inputTokens: 1500,
  outputTokens: 300,
  agentCount: 1,
  toolCallCount: 1,
  status: {
    label: "Completed",
    derived: true,
    basis: "a normal session exit event",
  },
};

const COMPLETED_AUDIT: AuditReport = {
  schemaVersion: 1,
  auditId: "audit_00000000-0000-4000-8000-000000000001",
  coverageGaps: [],
  sessionTotals: { inputTokens: 210000, outputTokens: 18500, cost: 4.62, currency: "USD" },
  findings: [
    {
      id: "finding-1",
      category: "repeated_context_loading",
      title: "Repeated repository context loading",
      severity: "high",
      confidence: "high",
      summary: "Three agents loaded substantially overlapping files across the session.",
      observedImpact: { inputTokens: 94000, outputTokens: 0, cost: 1.88 },
      estimatedSavings: {
        inputTokens: { minimum: 38000, likely: 61000, maximum: 76000 },
        cost: { minimum: 0.76, likely: 1.22, maximum: 1.52 },
      },
      evidenceIds: ["evidence-1", "evidence-2"],
      causalChain: [],
      limitations: [],
      proposalIds: ["proposal-1"],
    },
  ],
  proposals: [],
  methodology: "Measured from the session transcript.",
};

describe("AuditPanel", () => {
  it("renders every required finding detail and min-likely-max savings range (E4-S8-AC1)", () => {
    render(<SessionDetail session={SESSION} audit={COMPLETED_AUDIT} />);

    const audit = screen.getByRole("region", { name: "Audit findings" });
    expect(within(audit).getByText("High severity")).toBeInTheDocument();
    expect(within(audit).getByText("High confidence")).toBeInTheDocument();
    expect(within(audit).getByRole("heading", { name: "Repeated repository context loading" })).toBeInTheDocument();
    expect(within(audit).getByText("Three agents loaded substantially overlapping files across the session.")).toBeInTheDocument();
    expect(within(audit).getByText("Observed impact")).toBeInTheDocument();
    expect(within(audit).getByText("94,000 input tokens, 0 output tokens, $1.88")).toBeInTheDocument();
    expect(within(audit).getByText("Estimated savings")).toBeInTheDocument();
    expect(within(audit).getByText("Minimum")).toBeInTheDocument();
    expect(within(audit).getByText("Likely")).toBeInTheDocument();
    expect(within(audit).getByText("Maximum")).toBeInTheDocument();
    expect(within(audit).getByText("38,000 input tokens")).toBeInTheDocument();
    expect(within(audit).getByText("61,000 input tokens")).toBeInTheDocument();
    expect(within(audit).getByText("76,000 input tokens")).toBeInTheDocument();
  });
  it("distinguishes a completed audit with no findings from no audit yet (E4-S8-AC6)", () => {
    const completedWithoutFindings = { ...COMPLETED_AUDIT, findings: [] };
    const { rerender } = render(<SessionDetail session={SESSION} audit={completedWithoutFindings} />);

    const completedAudit = screen.getByRole("region", { name: "Audit findings" });
    expect(within(completedAudit).getByText("This completed audit found no findings.")).toBeInTheDocument();

    rerender(<SessionDetail session={SESSION} audit={null} />);

    const noAuditYet = screen.getByRole("region", { name: "Audit findings" });
    expect(within(noAuditYet).getByText("No audit has been completed for this session yet.")).toBeInTheDocument();
    expect(within(noAuditYet).queryByText("This completed audit found no findings.")).not.toBeInTheDocument();
  });
});

describe("AuditPanel cancellation (E4-S6-AC6)", () => {
  it("derives its post-cancel display from refreshed canonical history rather than local outcome state (E4-S6-AC6)", async () => {
    const onCancelAudit = vi.fn().mockResolvedValue(undefined);
    const runningJob: AuditJob = {
      id: "audit-running-to-cancelled",
      sessionId: SESSION.id,
      status: "running",
      createdAt: "2026-01-01T09:10:00.000Z",
    };
    const cancelledJob: AuditJob = {
      ...runningJob,
      status: "cancelled",
      reason: "the user stopped the analyzer",
    };
    const user = userEvent.setup();
    const { rerender } = render(
      <AuditPanel audit={null} auditJobs={[runningJob]} onCancelAudit={onCancelAudit} />,
    );

    await user.click(screen.getByRole("button", { name: "Cancel audit" }));

    await waitFor(() => expect(onCancelAudit).toHaveBeenCalledWith("audit-running-to-cancelled"));
    expect(screen.queryByRole("status", { name: "Audit cancellation" })).not.toBeInTheDocument();

    rerender(<AuditPanel audit={null} auditJobs={[cancelledJob]} onCancelAudit={onCancelAudit} />);

    expect(screen.getByText("This audit was cancelled: the user stopped the analyzer")).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Audit status: Cancelled" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel audit" })).not.toBeInTheDocument();
  });

  it("offers no cancel control, and no alternate not-offered explanation, when no audit is running", () => {
    render(<AuditPanel audit={null} />);

    expect(screen.queryByRole("button", { name: "Cancel audit" })).not.toBeInTheDocument();
    expect(screen.queryByText(/cancellation.*not.*offered/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/cannot be cancelled/i)).not.toBeInTheDocument();
  });

  it("offers no cancel control for a completed audit", () => {
    render(<AuditPanel audit={COMPLETED_AUDIT} />);

    expect(screen.queryByRole("button", { name: "Cancel audit" })).not.toBeInTheDocument();
  });

  it("keeps queued progress visible without offering a cancellation that has no analyzer child (E4-S6-AC6)", () => {
    render(
      <AuditPanel
        audit={null}
        auditJobs={[
          {
            id: "audit-queued",
            sessionId: SESSION.id,
            status: "queued",
            createdAt: "2026-01-01T09:10:00.000Z",
          },
        ]}
        onCancelAudit={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.getByLabelText("Audit progress")).toHaveTextContent("Queued");
    expect(screen.queryByRole("button", { name: "Cancel audit" })).not.toBeInTheDocument();
  });

  it("explains a failed analyzer with empty stderr by its exit status (E4-S6-AC2, E4-S6-AC4)", () => {
    render(
      <AuditPanel
        audit={null}
        auditJobs={[
          {
            id: "audit-empty-stderr",
            sessionId: SESSION.id,
            status: "failed",
            createdAt: "2026-01-01T09:10:00.000Z",
            exitStatus: 1,
            stderrSummary: "",
          },
        ]}
      />,
    );

    expect(screen.getByRole("alert", { name: "Audit status: Failed" })).toHaveTextContent(
      "This audit failed: The analyzer exited with status 1.",
    );
  });
});
