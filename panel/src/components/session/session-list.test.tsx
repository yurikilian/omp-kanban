import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { SessionSummary } from "@/server/sessions/types";
import { SessionList } from "./session-list";

function makeSession(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id: "session-1",
    title: "Refactor billing module",
    project: "alpha",
    startedAt: "2026-01-01T09:00:00.000Z",
    lastActivityAt: "2026-01-01T09:10:00.000Z",
    durationMs: 600_000,
    costUsd: 12.5,
    inputTokens: 1500,
    outputTokens: 300,
    agentCount: 1,
    toolCallCount: 3,
    ...overrides,
  };
}

describe("SessionList", () => {
  it("renders one row per session with title, project, last activity, duration, cost, tokens, agent count and tool calls, newest first (E3-S1-AC1)", () => {
    const older = makeSession({
      id: "s-older",
      title: "Older session",
      lastActivityAt: "2026-01-01T09:10:00.000Z",
    });
    const newer = makeSession({
      id: "s-newer",
      title: "Newer session",
      lastActivityAt: "2026-01-02T09:10:00.000Z",
    });

    // Deliberately passed oldest-first, to prove the list enforces the
    // newest-first order itself rather than merely preserving input order.
    render(<SessionList sessions={[older, newer]} />);

    const rows = screen.getAllByRole("row").slice(1); // drop the header row
    expect(rows).toHaveLength(2);

    const firstRow = rows[0];
    const secondRow = rows[1];
    expect(within(firstRow).getByText("Newer session")).toBeInTheDocument();
    expect(within(secondRow).getByText("Older session")).toBeInTheDocument();

    expect(within(firstRow).getByText("alpha")).toBeInTheDocument();
    expect(within(firstRow).getByText("10m 00s")).toBeInTheDocument();
    expect(within(firstRow).getByText("$12.50")).toBeInTheDocument();
    expect(within(firstRow).getByText("1.5K")).toBeInTheDocument();
    expect(within(firstRow).getByText("300")).toBeInTheDocument();
    expect(within(firstRow).getByText("1")).toBeInTheDocument();
    expect(within(firstRow).getByText("3")).toBeInTheDocument();
    expect(
      firstRow.querySelector('time[datetime="2026-01-02T09:10:00.000Z"]'),
    ).not.toBeNull();
  });

  it("renders unavailable token and cost metrics distinctly from zero or blank (E3-S1-AC2)", () => {
    const session = makeSession({
      costUsd: null,
      inputTokens: null,
      outputTokens: null,
      toolCallCount: 0,
    });

    render(<SessionList sessions={[session]} />);

    const row = screen.getAllByRole("row")[1];
    const unavailableCells = within(row).getAllByText("Unavailable");
    // Cost, input tokens and output tokens are all unavailable.
    expect(unavailableCells).toHaveLength(3);

    // Tool-call count is a real, known zero - a different concept from
    // unavailable usage data - and must render as "0", never folded into
    // the unavailable treatment.
    expect(within(row).getByText("0")).toBeInTheDocument();
    expect(within(row).queryByText("$0.00")).not.toBeInTheDocument();
  });

  it("renders no rows for an empty session list without throwing", () => {
    render(<SessionList sessions={[]} />);

    expect(screen.getAllByRole("row")).toHaveLength(1); // header row only
  });
});
