import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { SessionSummary } from "@/server/sessions/types";
import { SessionSearch } from "../session/session-search";
import { LiveRegion } from "./live-region";

function makeSession(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id: "2026-01-01T09-00-00-000Z_00000000-0000-7000-8000-000000000001",
    title: "Session",
    project: "project",
    startedAt: "2026-01-01T09:00:00.000Z",
    lastActivityAt: "2026-01-01T09:10:00.000Z",
    durationMs: 600_000,
    costUsd: 1,
    inputTokens: 100,
    outputTokens: 20,
    agentCount: 1,
    toolCallCount: 1,
    ...overrides,
  };
}

describe("LiveRegion", () => {
  it("announces a selection change without moving focus (E3-S11-AC3)", () => {
    const { rerender } = render(
      <>
        <button type="button">Keep focus</button>
        <LiveRegion message="" />
      </>,
    );

    const button = screen.getByRole("button", { name: "Keep focus" });
    button.focus();
    rerender(
      <>
        <button type="button">Keep focus</button>
        <LiveRegion message="Selected event: Session started" />
      </>,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Selected event: Session started");
    expect(document.activeElement).toBe(button);
  });

  it("announces when a filter empties the session list (E3-S11-AC4)", async () => {
    const user = userEvent.setup();
    render(<SessionSearch sessions={[makeSession({ title: "Refactor billing module" })]} />);

    await user.type(screen.getByRole("searchbox"), "no matching session");

    expect(screen.getByRole("status")).toHaveTextContent("No sessions match your search.");
  });
});
