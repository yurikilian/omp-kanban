import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { AuditReport } from "@/server/audits/bundle-schema";
import type { SessionDetail as SessionDetailData } from "@/server/sessions/detail";
import { SessionDetail } from "../session/session-detail";

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
});
