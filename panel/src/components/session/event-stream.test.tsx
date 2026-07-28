import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import "../../app/globals.css";
import type { TimelineEvent } from "@/server/sessions/timeline";
import { EventStream } from "./event-stream";

const ALL_EVENT_TYPES: TimelineEvent[] = [
  { type: "status", id: "s1", timestamp: "2026-01-01T09:00:00.000Z", label: "Session started" },
  { type: "prompt", id: "p1", timestamp: "2026-01-01T09:02:00.000Z", text: "Please refactor the billing module." },
  {
    type: "response",
    id: "r1",
    timestamp: "2026-01-01T09:05:00.000Z",
    agent: "main",
    text: "Sure, starting now.",
    model: "claude-sonnet-5",
    durationMs: 60_000,
    inputTokens: 1000,
    outputTokens: 200,
    costUsd: 0.01,
  },
  {
    type: "tool_call",
    id: "t1",
    timestamp: "2026-01-01T09:06:00.000Z",
    agent: "main",
    toolName: "bash",
    summary: "Run the test suite",
    durationMs: 5000,
    outcome: "success",
  },
  {
    type: "delegation",
    id: "d1",
    timestamp: "2026-01-01T09:07:00.000Z",
    parentAgent: "main",
    childAgent: "Scout",
    task: "Delegate research to Scout",
  },
  { type: "error", id: "e1", timestamp: "2026-01-01T09:08:00.000Z", agent: "main", text: "Connection refused" },
];

function mockFetchOnce(response: { ok: boolean; status?: number; json?: () => Promise<unknown> }) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: response.ok, status: response.status ?? 200, json: response.json ?? (async () => []) }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("EventStream", () => {
  it("renders each event type through its own treatment, not a uniform card (E3-S7-AC1)", async () => {
    mockFetchOnce({ ok: true, json: async () => ALL_EVENT_TYPES });

    const { container } = render(<EventStream sessionId="session-1" />);

    // Prompt and response share the bounded reading column.
    expect(await screen.findByText("Please refactor the billing module.")).toBeInTheDocument();
    expect(screen.getByText("Sure, starting now.")).toBeInTheDocument();
    expect(document.querySelector('[data-slot="response-metadata"]')).toHaveTextContent("claude-sonnet-5");

    // Tool call collapses to a single line.
    const toolLine = container.querySelector('[data-slot="tool-call-line"]') as Element;
    expect(toolLine).toHaveTextContent("bash");
    expect(toolLine).toHaveTextContent("Run the test suite");

    // Delegation shows the parent-to-child hand-off.
    expect(screen.getByText("Scout")).toBeInTheDocument();
    expect(screen.getByText(/Delegate research to Scout/)).toBeInTheDocument();

    // Status is a compact separator - not one of the card frames.
    expect(screen.getByRole("separator")).toHaveTextContent("Session started");

    // Error carries an icon and text without a full-bleed surface.
    const errorText = screen.getByText("Connection refused");
    expect(errorText).toBeInTheDocument();

    // Five card-framed event types (prompt, response, tool call, delegation,
    // error) rendered through the one shared frame; the status separator is
    // deliberately not among them.
    expect(container.querySelectorAll('[data-slot="event-frame"]')).toHaveLength(5);
  });

  it("requests the session's own timeline endpoint", async () => {
    mockFetchOnce({ ok: true, json: async () => [] });

    render(<EventStream sessionId="session-42" />);

    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/sessions/session-42/timeline"));
  });

  it("shows a loading state before the timeline arrives", () => {
    const { promise } = Promise.withResolvers<Response>();
    vi.stubGlobal("fetch", vi.fn(() => promise));

    render(<EventStream sessionId="session-1" />);

    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it("shows an error state when the timeline fails to load", async () => {
    mockFetchOnce({ ok: false, status: 500 });

    render(<EventStream sessionId="session-1" />);

    expect(await screen.findByText(/failed to load/i)).toBeInTheDocument();
  });

  it("shows an empty state when the session recorded no events", async () => {
    mockFetchOnce({ ok: true, json: async () => [] });

    render(<EventStream sessionId="session-1" />);

    expect(await screen.findByText(/no events/i)).toBeInTheDocument();
  });
});