import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { SessionSummary } from "@/server/sessions/types";
import { SessionSearch } from "./session-search";

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

const billing = makeSession({
  id: "2026-01-01T09-00-00-000Z_00000000-0000-7000-8000-0000000000aa",
  title: "Refactor billing module",
  project: "atlas",
});
const flaky = makeSession({
  id: "2026-01-02T09-00-00-000Z_00000000-0000-7000-8000-0000000000bb",
  title: "Investigate flaky tests",
  project: "beacon",
});
const nightly = makeSession({
  id: "2026-01-03T09-00-00-000Z_00000000-0000-7000-8000-0000000000cc",
  title: "Nightly regression sweep",
  project: "atlas",
});
const sessions = [billing, flaky, nightly];

function rowsFor(container: HTMLElement) {
  return within(container).getAllByRole("row").slice(1); // drop the header row
}

describe("SessionSearch", () => {
  it("keeps only rows whose title, project or id contain the query case-insensitively (E3-S2-AC1)", async () => {
    const user = userEvent.setup();
    render(<SessionSearch sessions={sessions} />);

    // Matches by project, case-insensitively.
    await user.type(screen.getByRole("searchbox"), "ATLAS");
    let rows = rowsFor(screen.getByRole("table"));
    expect(rows).toHaveLength(2);
    expect(screen.getByText("Refactor billing module")).toBeInTheDocument();
    expect(screen.getByText("Nightly regression sweep")).toBeInTheDocument();
    expect(screen.queryByText("Investigate flaky tests")).not.toBeInTheDocument();

    // Matches by title.
    await user.clear(screen.getByRole("searchbox"));
    await user.type(screen.getByRole("searchbox"), "flaky");
    rows = rowsFor(screen.getByRole("table"));
    expect(rows).toHaveLength(1);
    expect(screen.getByText("Investigate flaky tests")).toBeInTheDocument();

    // Matches by session id.
    await user.clear(screen.getByRole("searchbox"));
    await user.type(screen.getByRole("searchbox"), "0000000000bb");
    rows = rowsFor(screen.getByRole("table"));
    expect(rows).toHaveLength(1);
    expect(screen.getByText("Investigate flaky tests")).toBeInTheDocument();
  });

  it("keeps the displayed result count in step with the filtered set (E3-S2-AC1)", async () => {
    const user = userEvent.setup();
    render(<SessionSearch sessions={sessions} />);

    expect(screen.getByText("3 of 3 sessions")).toBeInTheDocument();

    await user.type(screen.getByRole("searchbox"), "atlas");
    expect(screen.getByText("2 of 3 sessions")).toBeInTheDocument();
    expect(screen.queryByText("3 of 3 sessions")).not.toBeInTheDocument();
  });

  it("shows a no-search-matches state worded apart from the no-sessions-yet state (E3-S2-AC2)", async () => {
    const user = userEvent.setup();
    render(<SessionSearch sessions={sessions} />);

    await user.type(screen.getByRole("searchbox"), "no-session-matches-this-query");

    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    // Wording distinct from session-list-states.tsx's no-sessions-yet copy
    // ("No recorded sessions" / "Start an Oh My Pi session to see it here.").
    expect(screen.getByText("No matching sessions")).toBeInTheDocument();
    expect(screen.queryByText("No recorded sessions")).not.toBeInTheDocument();
    expect(screen.queryByText("Start an Oh My Pi session to see it here.")).not.toBeInTheDocument();
    expect(screen.getByText("0 of 3 sessions")).toBeInTheDocument();
  });

  it("restores the full list through the clear-search action (E3-S2-AC2)", async () => {
    const user = userEvent.setup();
    render(<SessionSearch sessions={sessions} />);

    await user.type(screen.getByRole("searchbox"), "no-session-matches-this-query");
    expect(await screen.findByText("No matching sessions")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear search" }));

    expect(screen.queryByText("No matching sessions")).not.toBeInTheDocument();
    expect(screen.getByRole("searchbox")).toHaveValue("");
    expect(rowsFor(screen.getByRole("table"))).toHaveLength(3);
    expect(screen.getByText("3 of 3 sessions")).toBeInTheDocument();
  });
});
