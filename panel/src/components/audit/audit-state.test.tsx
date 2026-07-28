import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { BundleValidation } from "@/server/audits/validate";
import { AuditState } from "./audit-state";

const BUNDLE_DIR = "/Users/example/.omp/forensics/audits/audit-invalid";

const INVALID_OUTPUT: BundleValidation = {
  status: "invalid",
  issues: [
    {
      file: "evidence.jsonl",
      location: "line 2",
      message: "Unexpected end of JSON input",
    },
  ],
  manifest: {
    schemaVersion: 1,
    auditId: "audit-invalid",
    status: "completed",
    target: {
      sessionId: "2026-07-22T10-15-00-aaaa1111",
      transcriptPath: "~/.omp/agent/sessions/example.jsonl",
    },
    fingerprint: "sha256:aaaaaaaa",
    analyzer: { name: "kb-forensics", version: "1.0" },
    createdAt: "2026-07-22T10:18:00Z",
    startedAt: "2026-07-22T10:18:02Z",
    completedAt: "2026-07-22T10:19:47Z",
    artifacts: {
      manifest: "manifest.json",
      audit: "audit.json",
      report: "report.md",
      evidence: "evidence.jsonl",
    },
  },
};

describe("AuditState", () => {
  it("keeps invalid-output artifact paths available and withholds findings (E4-S5-AC5)", () => {
    render(<AuditState bundleDir={BUNDLE_DIR} validation={INVALID_OUTPUT} />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Invalid audit output: evidence.jsonl, line 2. Unexpected end of JSON input",
    );
    expect(screen.getByText("Findings are unavailable because this output did not pass validation.")).toBeInTheDocument();
    expect(screen.getByText(`${BUNDLE_DIR}/manifest.json`)).toBeInTheDocument();
    expect(screen.getByText(`${BUNDLE_DIR}/audit.json`)).toBeInTheDocument();
    expect(screen.getByText(`${BUNDLE_DIR}/report.md`)).toBeInTheDocument();
    expect(screen.getByText(`${BUNDLE_DIR}/evidence.jsonl`)).toBeInTheDocument();
    expect(screen.getByText("You can rerun this audit from its session.")).toBeInTheDocument();
  });
});