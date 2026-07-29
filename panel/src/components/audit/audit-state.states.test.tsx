import { render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import { AuditState } from "./audit-state";

describe("AuditState - lifecycle states (E4-S6-AC2, E4-S6-AC3, E4-S6-AC4)", () => {
  it("renders the queued state with its own label and explanation (E4-S6-AC2)", () => {
    render(<AuditState status="queued" />);

    expect(screen.getByRole("status")).toHaveTextContent("Queued");
    expect(screen.getByText("This audit is queued and will start shortly.")).toBeInTheDocument();
  });

  it("renders the running state with its own label and explanation (E4-S6-AC2)", () => {
    render(<AuditState status="running" />);

    expect(screen.getByRole("status")).toHaveTextContent("Running");
    expect(screen.getByText("The analyzer is currently examining this session.")).toBeInTheDocument();
  });

  it("renders the completed state with its own label and explanation (E4-S6-AC2)", () => {
    render(<AuditState status="completed" />);

    expect(screen.getByRole("status")).toHaveTextContent("Completed");
    expect(
      screen.getByText("The analyzer finished and reported its findings for this session."),
    ).toBeInTheDocument();
  });

  it("renders the cancelled state with its own label and recorded reason (E4-S6-AC4)", () => {
    render(<AuditState status="cancelled" cancellationReason="the user stopped the analyzer" />);

    expect(screen.getByRole("status")).toHaveTextContent("Cancelled");
    expect(screen.getByText("This audit was cancelled: the user stopped the analyzer")).toBeInTheDocument();
  });

  it("renders the insufficient_signal state with its own label and explanation (E4-S6-AC3)", () => {
    render(<AuditState status="insufficient_signal" />);

    expect(screen.getByRole("status")).toHaveTextContent("Insufficient signal");
    expect(
      screen.getByText(
        "This session was too small to audit - there wasn't enough recorded activity for the analyzer to reach a conclusion.",
      ),
    ).toBeInTheDocument();
  });

  it("renders the failed state with its own label and explanation, as an alert (E4-S6-AC2)", () => {
    render(<AuditState status="failed" failureReason="the transcript could not be read" retryAvailable={true} />);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Failed");
    expect(alert).toHaveTextContent("This audit failed: the transcript could not be read");
  });

  it("every one of the six states renders a visibly distinct label and explanation (E4-S6-AC2)", () => {
    const cases: Array<{ status: string; ui: ReactElement }> = [
      { status: "queued", ui: <AuditState status="queued" /> },
      { status: "running", ui: <AuditState status="running" /> },
      { status: "completed", ui: <AuditState status="completed" /> },
      {
        status: "cancelled",
        ui: <AuditState status="cancelled" cancellationReason="the user stopped the analyzer" />,
      },
      { status: "insufficient_signal", ui: <AuditState status="insufficient_signal" /> },
      {
        status: "failed",
        ui: <AuditState status="failed" failureReason="the analyzer crashed" retryAvailable={false} />,
      },
    ];

    const seenText = new Set<string>();
    for (const { status, ui } of cases) {
      const { unmount } = render(ui);
      const region = screen.getByRole(status === "failed" ? "alert" : "status");
      const text = region.textContent ?? "";
      expect(text.length).toBeGreaterThan(0);
      expect(seenText.has(text)).toBe(false);
      seenText.add(text);
      unmount();
    }

    expect(seenText.size).toBe(cases.length);
  });

  it("a failed audit states what failed and that a retry is available (E4-S6-AC2)", () => {
    render(
      <AuditState status="failed" failureReason="the transcript path did not exist" retryAvailable={true} />,
    );

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("the transcript path did not exist");
    expect(alert).toHaveTextContent("You can retry this audit from its session.");
  });

  it("a failed audit states what failed and that no retry is available, when it is not (E4-S6-AC2)", () => {
    render(
      <AuditState
        status="failed"
        failureReason="the analyzer crashed before writing a manifest"
        retryAvailable={false}
      />,
    );

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("the analyzer crashed before writing a manifest");
    expect(alert).toHaveTextContent("A retry is not available for this audit.");
  });

  it("an insufficient-signal audit reads as too small to audit, not as an error and not as zero findings (E4-S6-AC3)", () => {
    render(<AuditState status="insufficient_signal" />);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("too small to audit");
    expect(status.textContent?.toLowerCase()).not.toContain("error");
    expect(status.textContent?.toLowerCase()).not.toContain("finding");
    expect(screen.queryByText(/found no findings/i)).not.toBeInTheDocument();
  });

  it("keeps a failed and a cancelled audit's reasons both present after the session detail reloads (E4-S6-AC4)", () => {
    function renderSessionDetailAudits() {
      return render(
        <div>
          <AuditState status="failed" failureReason="the transcript could not be parsed" retryAvailable={true} />
          <AuditState status="cancelled" cancellationReason="the user stopped the analyzer" />
        </div>,
      );
    }

    const firstLoad = renderSessionDetailAudits();
    expect(screen.getByRole("alert")).toHaveTextContent("the transcript could not be parsed");
    expect(screen.getByRole("status")).toHaveTextContent("Cancelled");
    expect(screen.getByRole("status")).toHaveTextContent("the user stopped the analyzer");
    firstLoad.unmount();

    // Simulates the session detail reloading later and re-fetching the same
    // durable records - neither should have been discarded by the display
    // layer in between (E4-S6-AC4).
    renderSessionDetailAudits();
    expect(screen.getByRole("alert")).toHaveTextContent("the transcript could not be parsed");
    expect(screen.getByRole("status")).toHaveTextContent("Cancelled");
    expect(screen.getByRole("status")).toHaveTextContent("the user stopped the analyzer");
  });
});
