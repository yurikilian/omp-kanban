import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionSummary } from "@/server/sessions/types";
import { SessionList } from "./session-list";

const fetchMock = vi.fn();

const session: SessionSummary = {
  id: "2026-01-01T09-00-00-000Z_00000000-0000-7000-8000-000000000001",
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
};

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
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText(session.title)).toBeInTheDocument();
  });

  it("cancelling or dismissing with Escape leaves the transcript untouched and its row in the list (E3-S5-AC2)", async () => {
    const user = userEvent.setup();

    render(<SessionList sessions={[session]} />);

    await user.click(screen.getByRole("button", { name: `Delete ${session.title}` }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText(session.title)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: `Delete ${session.title}` }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText(session.title)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("removes the row and announces the deleted session after confirmation (E3-S5-AC3)", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue({ ok: true } as Response);

    render(<SessionList sessions={[session]} />);
    await user.click(screen.getByRole("button", { name: `Delete ${session.title}` }));
    await user.click(screen.getByRole("button", { name: "Delete session" }));

    expect(fetchMock).toHaveBeenCalledWith(`/api/sessions/${encodeURIComponent(session.id)}`, { method: "DELETE" });
    await waitFor(() => expect(screen.queryByText(session.title)).not.toBeInTheDocument());
    expect(screen.getByRole("status")).toHaveTextContent(`Deleted ${session.title}`);
  });
});
