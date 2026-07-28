import { render, screen, within, act, renderHook } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSearchParams, type ReadonlyURLSearchParams } from "next/navigation";
import { SessionSearch } from "@/components/session/session-search";
import type { SessionSummary } from "@/server/sessions/types";
import { useSessionListUrl } from "./use-session-list-url";

vi.mock("next/navigation", () => ({
  useSearchParams: vi.fn(),
}));

const mockedUseSearchParams = vi.mocked(useSearchParams);

/** Simulates being mounted inside a real Next.js App Router. */
function mountWithRouter() {
  mockedUseSearchParams.mockImplementation(
    () => new URLSearchParams(window.location.search) as ReadonlyURLSearchParams,
  );
}

/** Simulates a bare render with no App Router context, as in most component tests. */
function mountWithoutRouter() {
  mockedUseSearchParams.mockReturnValue(null as unknown as ReadonlyURLSearchParams);
}

beforeEach(() => {
  window.history.replaceState(null, "", "/sessions");
});

afterEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, "", "/sessions");
});

describe("useSessionListUrl", () => {
  it("reads the initial query from the `q` URL param (E3-S2-AC3)", () => {
    window.history.replaceState(null, "", "/sessions?q=atlas");
    mountWithRouter();

    const { result } = renderHook(() => useSessionListUrl());

    expect(result.current.query).toBe("atlas");
  });

  it("defaults to an empty query when the URL carries none", () => {
    mountWithRouter();

    const { result } = renderHook(() => useSessionListUrl());

    expect(result.current.query).toBe("");
  });

  it("writes query changes to the URL without adding a history entry (E3-S2-AC3)", () => {
    mountWithRouter();
    const historyLength = window.history.length;

    const { result } = renderHook(() => useSessionListUrl());
    act(() => result.current.setQuery("atlas"));

    expect(result.current.query).toBe("atlas");
    expect(window.location.search).toBe("?q=atlas");
    expect(window.history.length).toBe(historyLength);
  });

  it("removes the `q` param from the URL when the query is cleared", () => {
    window.history.replaceState(null, "", "/sessions?q=atlas");
    mountWithRouter();

    const { result } = renderHook(() => useSessionListUrl());
    act(() => result.current.setQuery(""));

    expect(window.location.search).toBe("");
  });

  it("falls back to local state and never touches the URL outside a router context", () => {
    window.history.replaceState(null, "", "/sessions?q=atlas");
    mountWithoutRouter();

    const { result } = renderHook(() => useSessionListUrl());
    expect(result.current.query).toBe("");

    act(() => result.current.setQuery("flaky"));

    expect(result.current.query).toBe("flaky");
    expect(window.location.search).toBe("?q=atlas");
  });

  it("restores the same query across a remount that simulates a server refresh (E3-S2-AC4)", () => {
    mountWithRouter();

    const first = renderHook(() => useSessionListUrl());
    act(() => first.result.current.setQuery("atlas"));
    first.unmount();

    const second = renderHook(() => useSessionListUrl());

    expect(second.result.current.query).toBe("atlas");
  });
});

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

function rowsFor(container: HTMLElement) {
  return within(container).getAllByRole("row").slice(1); // drop the header row
}

describe("SessionSearch with useSessionListUrl mounted in a router", () => {
  it("preserves the query and the filtered result across a remount that simulates a server refresh (E3-S2-AC4)", async () => {
    mountWithRouter();
    const user = userEvent.setup();

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

    const first = render(createElement(SessionSearch, { sessions: [billing, flaky] }));
    await user.type(screen.getByRole("searchbox"), "atlas");
    expect(rowsFor(screen.getByRole("table"))).toHaveLength(1);
    expect(window.location.search).toBe("?q=atlas");

    // The server refresh: SessionListStates tears SessionSearch down while
    // it re-fetches, then swaps a fresh instance back in with new session
    // data once the response lands - the query must survive that remount
    // because it lives in the URL, not in the unmounted component's state.
    first.unmount();
    const refreshedBilling = { ...billing, agentCount: billing.agentCount + 1 };
    render(createElement(SessionSearch, { sessions: [refreshedBilling, flaky] }));

    expect(screen.getByRole("searchbox")).toHaveValue("atlas");
    const rows = rowsFor(screen.getByRole("table"));
    expect(rows).toHaveLength(1);
    expect(screen.getByText("Refactor billing module")).toBeInTheDocument();
    expect(screen.queryByText("Investigate flaky tests")).not.toBeInTheDocument();
    expect(screen.getByText("1 of 2 sessions")).toBeInTheDocument();
  });
});