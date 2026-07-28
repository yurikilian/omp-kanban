import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
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

/** Rows that carry actual session cells - excludes the header row and the "Pinned" group-heading row. */
function dataRows() {
  return screen.getAllByRole("row").filter((row) => within(row).queryAllByRole("cell").length > 0);
}

function rowTitle(row: HTMLElement): string | null {
  return within(row).getAllByRole("cell")[0]?.textContent ?? null;
}

/** Simulates the /api/prefs/pins route: GET returns the current set, POST toggles and persists it in-memory for the test. */
function mockPinsApi(initialPinnedIds: string[] = []) {
  const pinned = new Set(initialPinnedIds);

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      if (input !== "/api/prefs/pins") return { ok: false, json: async () => ({}) };

      if (init?.method === "POST") {
        const body = JSON.parse(init.body as string) as { sessionId: string; pinned: boolean };
        if (body.pinned) pinned.add(body.sessionId);
        else pinned.delete(body.sessionId);
      }

      return { ok: true, json: async () => ({ pinnedSessionIds: [...pinned] }) };
    }),
  );

  return pinned;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PinControl accessible name", () => {
  it("reflects the pinned state rather than colour alone (E3-S4-AC1)", async () => {
    mockPinsApi();
    const user = userEvent.setup();
    const session = makeSession({ title: "Refactor billing module" });
    render(<SessionList sessions={[session]} />);

    const pinButton = await screen.findByRole("button", { name: "Pin Refactor billing module" });
    expect(pinButton).toHaveAttribute("aria-pressed", "false");

    await user.click(pinButton);

    const unpinButton = await screen.findByRole("button", { name: "Unpin Refactor billing module" });
    expect(unpinButton).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("button", { name: "Pin Refactor billing module" })).not.toBeInTheDocument();
  });
});

describe("Pinning grouping", () => {
  it("moves the row into a pinned group above the unpinned rows (E3-S4-AC1)", async () => {
    mockPinsApi();
    const user = userEvent.setup();
    const newer = makeSession({
      id: "newer",
      title: "Newer session",
      lastActivityAt: "2026-01-02T09:10:00.000Z",
    });
    const older = makeSession({
      id: "older",
      title: "Older session",
      lastActivityAt: "2026-01-01T09:10:00.000Z",
    });

    render(<SessionList sessions={[newer, older]} />);

    // Default sort is newest-first, so "Newer session" leads before any pin.
    await waitFor(() => expect(dataRows().map(rowTitle)).toEqual(["Newer session", "Older session"]));
    expect(screen.queryByText("Pinned")).not.toBeInTheDocument();

    await user.click(await screen.findByRole("button", { name: "Pin Older session" }));

    await waitFor(() => expect(dataRows().map(rowTitle)).toEqual(["Older session", "Newer session"]));
    expect(screen.getByText("Pinned")).toBeInTheDocument();
  });

  it("returns an unpinned row to its position under the active sort (E3-S4-AC3)", async () => {
    mockPinsApi();
    const user = userEvent.setup();
    const newer = makeSession({
      id: "newer",
      title: "Newer session",
      lastActivityAt: "2026-01-02T09:10:00.000Z",
    });
    const older = makeSession({
      id: "older",
      title: "Older session",
      lastActivityAt: "2026-01-01T09:10:00.000Z",
    });

    render(<SessionList sessions={[newer, older]} />);
    await waitFor(() => expect(dataRows().map(rowTitle)).toEqual(["Newer session", "Older session"]));

    await user.click(await screen.findByRole("button", { name: "Pin Older session" }));
    await waitFor(() => expect(dataRows().map(rowTitle)).toEqual(["Older session", "Newer session"]));

    await user.click(await screen.findByRole("button", { name: "Unpin Older session" }));

    await waitFor(() => expect(dataRows().map(rowTitle)).toEqual(["Newer session", "Older session"]));
    expect(screen.queryByText("Pinned")).not.toBeInTheDocument();
  });

  it("loads the previously pinned set on mount, before any click (E3-S4-AC2)", async () => {
    const older = makeSession({
      id: "older",
      title: "Older session",
      lastActivityAt: "2026-01-01T09:10:00.000Z",
    });
    const newer = makeSession({
      id: "newer",
      title: "Newer session",
      lastActivityAt: "2026-01-02T09:10:00.000Z",
    });
    mockPinsApi(["older"]);

    render(<SessionList sessions={[newer, older]} />);

    await waitFor(() => expect(dataRows().map(rowTitle)).toEqual(["Older session", "Newer session"]));
    expect(await screen.findByRole("button", { name: "Unpin Older session" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});

describe("Stale pins", () => {
  it("drops a stored pin whose session no longer exists, with no phantom row (E3-S4-AC4)", async () => {
    const session = makeSession({ id: "still-here", title: "Still here" });
    mockPinsApi(["session-that-no-longer-exists"]);

    render(<SessionList sessions={[session]} />);

    await waitFor(() => expect(dataRows()).toHaveLength(1));
    expect(dataRows().map(rowTitle)).toEqual(["Still here"]);
    expect(screen.queryByText("Pinned")).not.toBeInTheDocument();
  });
});
