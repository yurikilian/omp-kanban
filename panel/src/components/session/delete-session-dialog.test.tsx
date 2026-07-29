import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionSummary } from "@/server/sessions/types";
import { SessionList } from "./session-list";

const fetchMock = vi.fn();

function makeSession(id: string, title: string, lastActivityAt: string): SessionSummary {
  return {
    id,
    title,
    project: "alpha",
    startedAt: "2026-01-01T09:00:00.000Z",
    lastActivityAt,
    durationMs: 600_000,
    costUsd: 12.5,
    inputTokens: 1500,
    outputTokens: 300,
    agentCount: 1,
    toolCallCount: 3,
  };
}

const session = makeSession(
  "2026-01-01T09-00-00-000Z_00000000-0000-7000-8000-000000000001",
  "Refactor billing module",
  "2026-01-01T09:10:00.000Z",
);
const olderSession = makeSession(
  "2026-01-01T08-00-00-000Z_00000000-0000-7000-8000-000000000002",
  "Tune the query planner",
  "2026-01-01T08:10:00.000Z",
);

/**
 * Only the delete requests. `SessionList` also loads pinned ids on mount, so
 * asserting on `fetchMock` as a whole would couple these tests to unrelated
 * traffic and fail the moment another feature fetches something.
 */
function deleteCalls(): unknown[][] {
  return fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === "DELETE");
}

function respondToDelete(response: unknown) {
  fetchMock.mockImplementation((_url: string, init?: RequestInit) =>
    init?.method === "DELETE" ? Promise.resolve(response) : Promise.resolve({ ok: false, status: 404 }),
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("session deletion", () => {
  it("opens a confirmation named for the session, moves focus into it, and deletes nothing (E3-S5-AC1)", async () => {
    const user = userEvent.setup();

    render(<SessionList sessions={[session]} />);
    await user.click(screen.getByRole("button", { name: `Delete ${session.title}` }));

    const dialog = screen.getByRole("dialog", { name: `Delete ${session.title}?` });
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toHaveFocus();
    expect(deleteCalls()).toHaveLength(0);
    expect(screen.getByText(session.title)).toBeInTheDocument();
  });

  it("cancelling or dismissing with Escape leaves the transcript untouched and its row in the list (E3-S5-AC2)", async () => {
    const user = userEvent.setup();

    render(<SessionList sessions={[session]} />);

    await user.click(screen.getByRole("button", { name: `Delete ${session.title}` }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText(session.title)).toBeInTheDocument();
    expect(deleteCalls()).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: `Delete ${session.title}` }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText(session.title)).toBeInTheDocument();
    expect(deleteCalls()).toHaveLength(0);
  });

  it("removes the row and announces the deleted session after confirmation (E3-S5-AC3)", async () => {
    const user = userEvent.setup();
    respondToDelete({ ok: true, status: 204 });

    render(<SessionList sessions={[session]} />);
    await user.click(screen.getByRole("button", { name: `Delete ${session.title}` }));
    await user.click(screen.getByRole("button", { name: "Delete session" }));

    expect(deleteCalls()).toEqual([[`/api/sessions/${encodeURIComponent(session.id)}`, { method: "DELETE" }]]);
    await waitFor(() => expect(screen.queryByText(session.title)).not.toBeInTheDocument());
    expect(screen.getByRole("status")).toHaveTextContent(`Deleted ${session.title}`);
  });

  it("moves keyboard selection to a surviving row when the selected session is deleted (E3-S5-AC4)", async () => {
    Element.prototype.scrollIntoView = vi.fn();
    const user = userEvent.setup();
    respondToDelete({ ok: true, status: 204 });

    render(<SessionList sessions={[session, olderSession]} onOpenSession={() => {}} />);

    const firstRow = screen.getByText(session.title).closest("tr");
    firstRow?.focus();
    await user.keyboard("{ArrowDown}");

    const secondRow = screen.getByText(olderSession.title).closest("tr");
    expect(secondRow).toHaveFocus();

    await user.click(screen.getByRole("button", { name: `Delete ${olderSession.title}` }));
    await user.click(screen.getByRole("button", { name: "Delete session" }));
    await waitFor(() => expect(screen.queryByText(olderSession.title)).not.toBeInTheDocument());

    // Selection lands on the surviving neighbour rather than an index past the
    // end of the list, which would leave no row reachable by Tab at all.
    expect(screen.getByText(session.title).closest("tr")).toHaveAttribute("tabindex", "0");
  });

  it("keeps the row and reports whether a failed delete is worth retrying (E3-S5-AC5)", async () => {
    const user = userEvent.setup();
    respondToDelete({ ok: false, status: 500, json: async () => ({ error: "Failed to delete session" }) });

    render(<SessionList sessions={[session]} />);
    await user.click(screen.getByRole("button", { name: `Delete ${session.title}` }));
    await user.click(screen.getByRole("button", { name: "Delete session" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Failed to delete session");
    expect(alert).toHaveTextContent("You can try again.");
    expect(screen.getByText(session.title)).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    expect(screen.getByRole("button", { name: "Delete session" })).toBeEnabled();
  });

  it("does not offer a retry when the server rejected the request outright (E3-S5-AC5)", async () => {
    const user = userEvent.setup();
    respondToDelete({ ok: false, status: 404, json: async () => ({ error: "Session not found" }) });

    render(<SessionList sessions={[session]} />);
    await user.click(screen.getByRole("button", { name: `Delete ${session.title}` }));
    await user.click(screen.getByRole("button", { name: "Delete session" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Session not found");
    expect(alert).toHaveTextContent("Retrying will not help.");
    expect(screen.getByText(session.title)).toBeInTheDocument();
  });
});
