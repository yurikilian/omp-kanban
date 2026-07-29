import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuditReport } from "@/server/audits/bundle-schema";
import { cancelAudit } from "@/server/audits/cancel";
import type { SessionDetail as SessionDetailData } from "@/server/sessions/detail";
import { SessionDetail } from "../session/session-detail";
import { AuditPanel } from "./audit-panel";

vi.mock("@/server/audits/cancel", () => ({
  cancelAudit: vi.fn(),
}));

const cancelAuditMock = vi.mocked(cancelAudit);

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
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("offers a reachable cancel control for a running audit and stops the analyzer child when activated", async () => {
    cancelAuditMock.mockResolvedValue({
      ok: true,
      auditId: "audit_running-1",
      status: "cancelled",
      reason: "the user stopped the analyzer",
      cancelledAt: "2026-01-01T09:12:00.000Z",
    });
    const user = userEvent.setup();

    render(<AuditPanel audit={null} runningJob={{ id: "audit_running-1", status: "running" }} />);

    await user.click(screen.getByRole("button", { name: "Cancel audit" }));

    expect(cancelAuditMock).toHaveBeenCalledWith("audit_running-1");
    expect(await screen.findByRole("status", { name: "Audit cancellation" })).toHaveTextContent(
      "This audit was cancelled.",
    );
  });

  it("reports failure rather than silently succeeding when the child cannot be stopped", async () => {
    cancelAuditMock.mockResolvedValue({
      ok: false,
      auditId: "audit_running-2",
      reason: "no running analyzer child for this audit",
    });
    const user = userEvent.setup();

    render(<AuditPanel audit={null} runningJob={{ id: "audit_running-2", status: "running" }} />);

    await user.click(screen.getByRole("button", { name: "Cancel audit" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not cancel the audit.");
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
});
