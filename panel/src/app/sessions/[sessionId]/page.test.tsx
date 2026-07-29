import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuditManifest, AuditReport } from "@/server/audits/bundle-schema";
import type { BundleValidation } from "@/server/audits/validate";
import type { SessionDetail as SessionDetailData } from "@/server/sessions/detail";

const getSessionDetail = vi.fn();
const indexAuditBundles = vi.fn();
const auditsForSession = vi.fn();

vi.mock("@/server/sessions/detail", () => ({
  getSessionDetail: (...args: unknown[]) => getSessionDetail(...args),
}));

vi.mock("@/server/audits/index-bundles", () => ({
  indexAuditBundles: (...args: unknown[]) => indexAuditBundles(...args),
  auditsForSession: (...args: unknown[]) => auditsForSession(...args),
}));

import SessionDetailPage from "./page";

const SESSION_ID = "2026-01-01T09-00-00-000Z_00000000-0000-7000-8000-00000000000a";
const AUDIT_ID = "audit_00000000-0000-4000-8000-000000000001";

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

const MANIFEST: AuditManifest = {
  schemaVersion: 1,
  auditId: AUDIT_ID,
  status: "completed",
  target: { sessionId: SESSION_ID, transcriptPath: `${SESSION_ID}.jsonl` },
  fingerprint: "fingerprint-1",
  analyzer: { name: "kb-forensics", version: "1.0.0" },
  createdAt: "2026-01-01T09:11:00.000Z",
  startedAt: "2026-01-01T09:11:05.000Z",
  completedAt: "2026-01-01T09:12:00.000Z",
  artifacts: { manifest: "manifest.json", audit: "audit.json", report: "report.md", evidence: "evidence.jsonl" },
};

const VALID_BUNDLE: BundleValidation = {
  status: "valid",
  manifest: MANIFEST,
  audit: COMPLETED_AUDIT,
  evidence: [],
  reportMarkdown: "# Audit\n",
};

beforeEach(() => {
  getSessionDetail.mockReset();
  indexAuditBundles.mockReset();
  auditsForSession.mockReset();
});

describe("SessionDetailPage", () => {
  it("supplies the session's completed audit to SessionDetail so a finding's evidence link is reachable (E4-S9-AC1, E4-S9-AC2)", async () => {
    getSessionDetail.mockResolvedValue(SESSION);
    indexAuditBundles.mockReturnValue({ all: [], bySessionId: new Map() });
    auditsForSession.mockReturnValue([
      { auditId: AUDIT_ID, bundleDir: `/tmp/audits/${AUDIT_ID}`, validation: VALID_BUNDLE, sessionId: SESSION_ID },
    ]);

    render(await SessionDetailPage({ params: Promise.resolve({ sessionId: SESSION_ID }) }));

    const link = await screen.findByRole("link", { name: "Open evidence evidence-1" });
    expect(link).toHaveAttribute("href", `/api/audits/${AUDIT_ID}/evidence?evidenceId=evidence-1`);
    expect(auditsForSession).toHaveBeenCalledWith(expect.anything(), SESSION_ID);
  });

  it("renders the no-audit-yet state when the session has no completed audit", async () => {
    getSessionDetail.mockResolvedValue(SESSION);
    indexAuditBundles.mockReturnValue({ all: [], bySessionId: new Map() });
    auditsForSession.mockReturnValue([]);

    render(await SessionDetailPage({ params: Promise.resolve({ sessionId: SESSION_ID }) }));

    expect(screen.getByText("No audit has been completed for this session yet.")).toBeInTheDocument();
  });
});
