import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { cancelAudit } from "@/server/audits/cancel";
import { AuditPanel } from "./audit-panel";
import { AuditProgress } from "./audit-progress";

vi.mock("@/server/audits/cancel", () => ({
  cancelAudit: vi.fn(),
}));

describe("AuditProgress (E4-S6-AC5)", () => {
  it("conveys queued and running progress as its own readable text, not only as an animation", () => {
    const { rerender } = render(<AuditProgress status="queued" />);

    expect(screen.getByText("Queued")).toBeInTheDocument();

    rerender(<AuditProgress status="running" />);

    expect(screen.getByText("Running")).toBeInTheDocument();
    expect(screen.queryByText("Queued")).not.toBeInTheDocument();
  });

  it("gives a cancelling audit its own distinct progress text", () => {
    render(<AuditProgress status="cancelling" />);

    expect(screen.getByText("Cancelling…")).toBeInTheDocument();
  });
});

describe("AuditPanel audit progress announcements (E4-S6-AC5)", () => {
  it("announces an audit status change through the live region as the job moves from queued to running", () => {
    const { rerender } = render(<AuditPanel audit={null} runningJob={{ id: "audit_progress-1", status: "queued" }} />);

    expect(screen.getByRole("status")).toHaveTextContent("Audit status: queued.");

    rerender(<AuditPanel audit={null} runningJob={{ id: "audit_progress-1", status: "running" }} />);

    expect(screen.getByRole("status")).toHaveTextContent("Audit status: running.");
  });

  it("shows the running audit's progress as text alongside the live region announcement", () => {
    render(<AuditPanel audit={null} runningJob={{ id: "audit_progress-2", status: "running" }} />);

    expect(screen.getByText("Running")).toBeInTheDocument();
  });

  it("renders no progress text once no audit is in flight", () => {
    render(<AuditPanel audit={null} />);

    expect(screen.queryByText("Queued")).not.toBeInTheDocument();
    expect(screen.queryByText("Running")).not.toBeInTheDocument();
    expect(screen.queryByText("Cancelling…")).not.toBeInTheDocument();
  });
});
