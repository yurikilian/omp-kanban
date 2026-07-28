import { createElement } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SessionDetail } from "@/components/session/session-detail";
import { SessionList } from "@/components/session/session-list";
import type { SessionDetail as SessionDetailData } from "@/server/sessions/detail";
import { useLiveSessions } from "./use-live-sessions";

vi.mock("@/components/session/event-stream", () => ({
  EventStream() {
    return null;
  },
}));

const initialSession: SessionDetailData = {
  id: "session-1",
  title: "Before live update",
  project: "alpha",
  startedAt: "2026-01-01T09:00:00.000Z",
  lastActivityAt: "2026-01-01T09:10:00.000Z",
  durationMs: 600_000,
  costUsd: 0.1,
  inputTokens: 100,
  outputTokens: 50,
  agentCount: 1,
  toolCallCount: 2,
  status: {
    label: "Running",
    derived: true,
    basis: "no terminal event",
  },
};

const refreshedSession: SessionDetailData = {
  ...initialSession,
  title: "After live update",
  lastActivityAt: "2026-01-01T09:11:00.000Z",
  durationMs: 660_000,
};

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

function LiveSessionSubscriber({ onSessionChange }: { onSessionChange: (sessionId: string) => void }) {
  useLiveSessions(onSessionChange);
  return null;
}

afterEach(() => {
  FakeEventSource.instances = [];
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("useLiveSessions", () => {
  it("subscribes to changed-session notifications over the shared stream (E3-S9-AC6)", () => {
    vi.stubGlobal("EventSource", FakeEventSource);
    const onSessionChange = vi.fn();
    const { unmount } = render(createElement(LiveSessionSubscriber, { onSessionChange }));

    expect(FakeEventSource.instances).toHaveLength(1);
    FakeEventSource.instances[0].emit("session-change", JSON.stringify({ sessionId: "session-1" }));

    expect(onSessionChange).toHaveBeenCalledWith("session-1");

    unmount();
  });

  it("updates the affected list row and open detail in place without changing the route (E3-S9-AC1)", async () => {
    vi.stubGlobal("EventSource", FakeEventSource);
    
    // Mock fetch to return different responses based on endpoint
    let fetchCallCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        fetchCallCount++;
        // Sessions endpoint returns SessionDetail (with status)
        if (url.includes("/api/sessions/") && !url.includes("/agents") && !url.includes("/timeline")) {
          
          return {
            ok: true,
            json: async () => ({
              ...refreshedSession,
              status: refreshedSession.status || initialSession.status,
            }),
          };
        }
        // Agents endpoint returns empty array (AgentTree can handle no agents)
        if (url.includes("/agents")) {
          
          return {
            ok: true,
            json: async () => [],
          };
        }
        // Timeline endpoint returns empty array
        if (url.includes("/timeline")) {
          
          return {
            ok: true,
            json: async () => [],
          };
        }
        // Fallback
        
        return {
          ok: true,
          json: async () => [],
        };
      }),
    );
    window.history.replaceState(null, "", `/sessions/${initialSession.id}`);
    const routeBeforeUpdate = window.location.pathname;
    // Extract only SessionSummary fields (without status) for SessionList
    const sessionSummary = (() => {
      const { id, title, project, startedAt, lastActivityAt, durationMs, costUsd, inputTokens, outputTokens, agentCount, toolCallCount } = initialSession;
      return { id, title, project, startedAt, lastActivityAt, durationMs, costUsd, inputTokens, outputTokens, agentCount, toolCallCount };
    })();
    
    const { unmount } = render(
      createElement(
        "div",
        null,
        createElement(SessionList, { sessions: [sessionSummary] }),
        createElement(SessionDetail, { session: initialSession }),
      ),
    );
    expect(FakeEventSource.instances).toHaveLength(1);
    
    FakeEventSource.instances[0].emit("session-change", JSON.stringify({ sessionId: initialSession.id }));

    await waitFor(() => {
      const texts = screen.queryAllByText(refreshedSession.title);
      
      expect(texts).toHaveLength(2);
    });
    expect(window.location.pathname).toBe(routeBeforeUpdate);

    unmount();
  });
});