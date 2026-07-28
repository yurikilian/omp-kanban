import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { SessionSummary } from "@/server/sessions/types";
import { SessionList } from "./session-list";

function makeSession(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id: "session-1",
    title: "Medium cost",
    project: "alpha",
    startedAt: "2026-01-01T09:00:00.000Z",
    lastActivityAt: "2026-01-02T09:00:00.000Z",
    durationMs: 2_000,
    costUsd: 5,
    inputTokens: 1_500,
    outputTokens: 300,
    agentCount: 1,
    toolCallCount: 3,
    ...overrides,
  };
}

function renderedTitles(): string[] {
  return screen
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getAllByRole("cell")[0]?.textContent ?? "");
}

describe("SessionList sorting", () => {
  it("reactivates the active key by reversing direction and shows the active key and direction (E3-S3-AC1)", async () => {
    const user = userEvent.setup();
    render(<SessionList sessions={[makeSession()]} />);

    expect(screen.getByRole("button", { name: "Last activity, descending" })).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "Cost" }));
    expect(screen.getByRole("button", { name: "Cost, descending" })).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "Cost, descending" }));
    expect(screen.getByRole("button", { name: "Cost, ascending" })).toHaveAttribute("aria-pressed", "true");
  });

  it("orders rows by cost, duration, and last activity when each key is selected (E3-S3-AC1)", async () => {
    const user = userEvent.setup();
    const lowCost = makeSession({ id: "low", title: "Low cost", costUsd: 1, durationMs: 2_000, lastActivityAt: "2026-01-02T09:00:00.000Z" });
    const mediumCost = makeSession({ id: "medium", title: "Medium cost", costUsd: 5, durationMs: 3_000, lastActivityAt: "2026-01-01T09:00:00.000Z" });
    const highCost = makeSession({ id: "high", title: "High cost", costUsd: 10, durationMs: 1_000, lastActivityAt: "2026-01-03T09:00:00.000Z" });

    render(<SessionList sessions={[mediumCost, lowCost, highCost]} />);

    await user.click(screen.getByRole("button", { name: "Cost" }));
    expect(renderedTitles()).toEqual(["High cost", "Medium cost", "Low cost"]);

    await user.click(screen.getByRole("button", { name: "Duration" }));
    expect(renderedTitles()).toEqual(["Medium cost", "Low cost", "High cost"]);

    await user.click(screen.getByRole("button", { name: "Last activity" }));
    expect(renderedTitles()).toEqual(["High cost", "Low cost", "Medium cost"]);
  });
});