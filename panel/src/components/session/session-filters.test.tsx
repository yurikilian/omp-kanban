import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionSummary } from "@/server/sessions/types";
import { SessionFilters } from "./session-filters";

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

const matchingSession = makeSession({
  id: "match",
  title: "Fix billing regression",
  project: "atlas",
  lastActivityAt: "2026-01-03T09:10:00.000Z",
});
const otherMatchingSession = makeSession({
  id: "other-match",
  title: "Ship billing tests",
  project: "atlas",
  costUsd: 3,
  lastActivityAt: "2026-01-02T09:10:00.000Z",
});

const wrongStatusSession = makeSession({ id: "wrong-status", title: "Fix billing migration", project: "atlas" });
const wrongProjectSession = makeSession({ id: "wrong-project", title: "Fix billing regression", project: "beacon" });
const sessions = [matchingSession, otherMatchingSession, wrongStatusSession, wrongProjectSession];

function mockSessionDetails(statuses: Record<string, string>) {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: string) => {
      const sessionId = decodeURIComponent(input.split("/").at(-1) ?? "");
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ status: { label: statuses[sessionId] } }),
      });
    }),
  );
}

function rowsFor(container: HTMLElement) {
  return within(container).getAllByRole("row").slice(1);
}

describe("SessionFilters", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/sessions");
    mockSessionDetails({
      match: "Completed",
      "other-match": "Completed",
      "wrong-status": "Running",
      "wrong-project": "Completed",
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps only rows matching the project filter, status filter and query (E3-S3-AC2)", async () => {
    const user = userEvent.setup();
    render(<SessionFilters sessions={sessions} />);

    await user.selectOptions(screen.getByLabelText("Project"), "atlas");
    await user.selectOptions(screen.getByLabelText("Status"), "Completed");
    await user.type(screen.getByRole("searchbox", { name: "Search sessions" }), "regression");

    const rows = await screen.findAllByRole("row");
    expect(rowsFor(screen.getByRole("table"))).toHaveLength(1);
    expect(screen.getByText("Fix billing regression")).toBeInTheDocument();
    expect(screen.queryByText("Fix billing migration")).not.toBeInTheDocument();
  });

  it("shows a no-matches state and clears every active filter (E3-S3-AC3)", async () => {
    const user = userEvent.setup();
    render(<SessionFilters sessions={sessions} />);

    await user.selectOptions(screen.getByLabelText("Project"), "atlas");
    await user.selectOptions(screen.getByLabelText("Status"), "Completed");
    await user.type(screen.getByRole("searchbox", { name: "Search sessions" }), "not-present");

    expect(await screen.findByText("No matching sessions")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear filters" }));

    expect(screen.getByRole("searchbox", { name: "Search sessions" })).toHaveValue("");
    expect(screen.getByLabelText("Project")).toHaveValue("");
    expect(screen.getByLabelText("Status")).toHaveValue("");
    expect(rowsFor(await screen.findByRole("table"))).toHaveLength(4);
  });

  it("restores the sort and filter state from the URL after a reload (E3-S3-AC4)", async () => {
    window.history.replaceState(
      null,
      "",
      "/sessions?q=billing&project=atlas&status=Completed&sort=cost&direction=ascending",
    );

    const { unmount } = render(<SessionFilters sessions={sessions} />);
    expect(await screen.findByRole("button", { name: "Cost, ascending" })).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Search sessions" })).toHaveValue("billing");
    expect(screen.getByLabelText("Project")).toHaveValue("atlas");
    expect(screen.getByLabelText("Status")).toHaveValue("Completed");
    expect(
      rowsFor(screen.getByRole("table")).map((row) => within(row).getAllByRole("cell")[0]?.textContent),
    ).toEqual(["Fix billing regression", "Ship billing tests"]);

    unmount();
    render(<SessionFilters sessions={sessions} />);

    expect(await screen.findByRole("button", { name: "Cost, ascending" })).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Search sessions" })).toHaveValue("billing");
    expect(screen.getByLabelText("Project")).toHaveValue("atlas");
    expect(screen.getByLabelText("Status")).toHaveValue("Completed");
  });
});
