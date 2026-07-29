import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuditReport } from "@/server/audits/bundle-schema";
import type { SessionDetail as SessionDetailData } from "@/server/sessions/detail";

const getSessionDetail = vi.fn();
const getAuditJobsForSession = vi.fn();
const readCompletedAuditMetadata = vi.fn();
const fetchMock = vi.fn();

vi.mock("@/server/sessions/detail", () => ({
  getSessionDetail: (...args: unknown[]) => getSessionDetail(...args),
}));

vi.mock("@/server/audits/job-store", () => ({
  getAuditJobsForSession: (...args: unknown[]) => getAuditJobsForSession(...args),
}));

vi.mock("@/server/audits/index-bundles", () => ({
  readCompletedAuditMetadata: (...args: unknown[]) => readCompletedAuditMetadata(...args),
}));

import SessionDetailPage from "./page";

const SESSION_ID = "2026-01-01T09-00-00-000Z_00000000-0000-7000-8000-00000000000a";
const AUDIT_ID = "audit_00000000-0000-4000-8000-000000000001";

const COMPLETED_AUDIT_CREATED_AT = "2026-01-01T09:11:00.000Z";

const SESSION: SessionDetailData = {
  id: SESSION_ID,
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
  status: { label: "Completed", derived: true, basis: "a normal session exit event" },
};

const COMPLETED_AUDIT: AuditReport = {
  schemaVersion: 1,
  auditId: AUDIT_ID,
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
      evidenceIds: ["evidence-1"],
      causalChain: [],
      limitations: [],
      proposalIds: [],
    },
  ],
  proposals: [],
  methodology: "Measured from the session transcript.",
};


beforeEach(() => {
  getSessionDetail.mockReset();
  getAuditJobsForSession.mockReset();
  readCompletedAuditMetadata.mockReset();
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SessionDetailPage", () => {
  it("supplies the session's completed audit to SessionDetail so a finding's evidence link is reachable (E4-S9-AC1, E4-S9-AC2)", async () => {
    getSessionDetail.mockResolvedValue(SESSION);
    getAuditJobsForSession.mockResolvedValue([
      { id: AUDIT_ID, sessionId: SESSION_ID, status: "completed", createdAt: COMPLETED_AUDIT_CREATED_AT },
    ]);
    readCompletedAuditMetadata.mockReturnValue(COMPLETED_AUDIT);

    render(await SessionDetailPage({ params: Promise.resolve({ sessionId: SESSION_ID }) }));

    const link = await screen.findByRole("link", { name: "Open evidence evidence-1" });
    expect(link).toHaveAttribute("href", `/api/audits/${AUDIT_ID}/evidence?evidenceId=evidence-1`);
    expect(getAuditJobsForSession).toHaveBeenCalledWith(SESSION_ID);
    expect(readCompletedAuditMetadata).toHaveBeenCalledWith(expect.any(String), { auditId: AUDIT_ID, sessionId: SESSION_ID });
  });


  it("renders a completed finding without evidence activation and requests only its cited evidence when the rendered link is opened (E4-S9-AC4)", async () => {
    const evidenceHref = `/api/audits/${AUDIT_ID}/evidence?evidenceId=evidence-1`;
    getSessionDetail.mockResolvedValue(SESSION);
    getAuditJobsForSession.mockResolvedValue([{ id: AUDIT_ID, sessionId: SESSION_ID, status: "completed", createdAt: COMPLETED_AUDIT_CREATED_AT }]);
    readCompletedAuditMetadata.mockReturnValue(COMPLETED_AUDIT);
    vi.stubGlobal(
      "fetch",
      fetchMock.mockResolvedValue({
        ok: false,
        redirected: false,
        json: async () => ({ status: "event-missing", evidenceId: "evidence-1", eventRef: "main:missing" }),
      }),
    );

    render(await SessionDetailPage({ params: Promise.resolve({ sessionId: SESSION_ID }) }));

    const link = await screen.findByRole("link", { name: "Open evidence evidence-1" });
    expect(getAuditJobsForSession).toHaveBeenCalledWith(SESSION_ID);
    expect(readCompletedAuditMetadata).toHaveBeenCalledWith(expect.any(String), { auditId: AUDIT_ID, sessionId: SESSION_ID });
    expect(fetchMock.mock.calls.filter(([url]) => url === evidenceHref)).toEqual([]);

    await userEvent.setup().click(link);

    expect(await screen.findByRole("alert")).toHaveTextContent('The event referenced by evidence "evidence-1" could not be located in the transcript.');
    expect(fetchMock.mock.calls.filter(([url]) => url === evidenceHref)).toEqual([[evidenceHref]]);
  });
  it("renders the no-audit-yet state when the session has no completed audit", async () => {
    getSessionDetail.mockResolvedValue(SESSION);
    getAuditJobsForSession.mockResolvedValue([]);

    render(await SessionDetailPage({ params: Promise.resolve({ sessionId: SESSION_ID }) }));

    expect(screen.getByText("No audit has been completed for this session yet.")).toBeInTheDocument();
  });
});
