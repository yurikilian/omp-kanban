import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SessionSummary } from "@/server/sessions/types";
import { SessionSearch } from "./session-search";

function makeSession(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id: "session-1",
    title: "Selected session",
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

class FakeEventSource {
  static instances: FakeEventSource[] = [];

  readonly close = vi.fn();
  readonly listeners = new Map<string, Set<(event: Event) => void>>();

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    const callback =
      typeof listener === "function" ? listener : (event: Event) => listener.handleEvent(event);
    const listeners = this.listeners.get(type) ?? new Set<(event: Event) => void>();
    listeners.add(callback);
    this.listeners.set(type, listeners);
  }

  emit(type: string, data: string) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(new MessageEvent(type, { data }));
    }
  }
}

function sessionRows() {
  return screen.getAllByRole("row").slice(1);
}

afterEach(() => {
  FakeEventSource.instances = [];
  vi.unstubAllGlobals();
  window.getSelection()?.removeAllRanges();
});

describe("SessionList live-update stability", () => {
  it("keeps the selected row, active query and scroll position steady during an update (E3-S9-AC2)", async () => {
    const user = userEvent.setup();
    const selected = makeSession();
    const sessions = [
      makeSession({ id: "newer", title: "Newer session", lastActivityAt: "2026-01-03T09:10:00.000Z" }),
      selected,
      makeSession({ id: "older", title: "Older session", lastActivityAt: "2026-01-01T08:10:00.000Z" }),
    ];
    const refreshedSelected = makeSession({
      lastActivityAt: "2026-01-04T09:10:00.000Z",
      durationMs: 660_000,
    });

    vi.stubGlobal("EventSource", FakeEventSource);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => refreshedSelected,
      })),
    );

    render(
      <div data-testid="scroll-container" style={{ height: 100, overflow: "auto" }}>
        <SessionSearch sessions={sessions} />
      </div>,
    );

    const query = screen.getByRole("searchbox");
    await user.type(query, "alpha");
    const scrollContainer = screen.getByTestId("scroll-container");
    scrollContainer.scrollTop = 73;

    const beforeUpdate = sessionRows();
    const selectedRow = beforeUpdate[1];
    const selectedTitle = within(selectedRow).getByText("Selected session");
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(selectedTitle);
    selection?.removeAllRanges();
    selection?.addRange(range);

    FakeEventSource.instances[0].emit("session-change", JSON.stringify({ sessionId: selected.id }));

    await waitFor(() => {
      expect(within(selectedRow).getByText("11m 00s")).toBeInTheDocument();
    });

    expect(query).toHaveValue("alpha");
    expect(document.activeElement).toBe(query);
    expect(scrollContainer.scrollTop).toBe(73);
    expect(selection?.toString()).toBe("Selected session");
    expect(sessionRows()[1]).toBe(selectedRow);
  });

  it("appends a newly observed session without moving the row under the pointer (E3-S9-AC2)", async () => {
    const first = makeSession({ id: "first", title: "First session", lastActivityAt: "2026-01-03T09:10:00.000Z" });
    const pointed = makeSession({ id: "pointed", title: "Pointed session", lastActivityAt: "2026-01-02T09:10:00.000Z" });
    const inserted = makeSession({ id: "inserted", title: "Inserted session", lastActivityAt: "2026-01-04T09:10:00.000Z" });

    vi.stubGlobal("EventSource", FakeEventSource);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => inserted,
      })),
    );

    render(<SessionSearch sessions={[first, pointed]} />);

    const pointedRow = sessionRows()[1];
    FakeEventSource.instances[0].emit("session-change", JSON.stringify({ sessionId: inserted.id }));

    await waitFor(() => {
      expect(screen.getByText("Inserted session")).toBeInTheDocument();
    });

    expect(sessionRows()[1]).toBe(pointedRow);
    expect(within(sessionRows()[2]).getByText("Inserted session")).toBeInTheDocument();
  });
});