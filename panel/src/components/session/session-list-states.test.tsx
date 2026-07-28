import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionSummary } from "@/server/sessions/types";
import { SessionListStates } from "./session-list-states";

const fetchMock = vi.fn();

const fixtureSession: SessionSummary = {
  id: "2026-01-01T00-00-00-000Z_fixture",
  title: "Retryable session",
  project: "fixture-project",
  startedAt: "2026-01-01T00:00:00.000Z",
  lastActivityAt: "2026-01-01T00:05:00.000Z",
  durationMs: 300_000,
  costUsd: 0.05,
  inputTokens: 1000,
  outputTokens: 200,
  agentCount: 2,
  toolCallCount: 4,
};

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SessionListStates", () => {
  it("renders a loading state while the sessions request is in flight (E3-S1-AC4)", () => {
    fetchMock.mockReturnValue(Promise.withResolvers<Response>().promise);

    render(<SessionListStates />);
    expect(fetchMock).toHaveBeenCalledWith("/api/sessions", { cache: "no-store" });

    expect(screen.getByRole("status")).toHaveTextContent("Loading sessions");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("renders guidance instead of a zero-row table when no sessions exist (E3-S1-AC4)", async () => {
    fetchMock.mockResolvedValue(jsonResponse([]));

    render(<SessionListStates />);

    expect(await screen.findByText("No recorded sessions")).toBeInTheDocument();
    expect(screen.getByText("Start an Oh My Pi session to see it here.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("explains an unreadable sessions root and that no existing data is usable (E3-S1-AC5)", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: "EACCES: permission denied, scandir ~/.omp/agent/sessions" }, 500),
    );

    render(<SessionListStates />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Could not load sessions");
    expect(alert).toHaveTextContent("EACCES: permission denied, scandir ~/.omp/agent/sessions");
    expect(alert).toHaveTextContent("No previously loaded session data is available.");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("re-requests the session list when retrying an unreadable root (E3-S1-AC5)", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ error: "EACCES: permission denied, scandir ~/.omp/agent/sessions" }, 500),
      )
      .mockResolvedValueOnce(jsonResponse([fixtureSession]));
    const user = userEvent.setup();

    render(<SessionListStates />);

    await screen.findByRole("alert");
    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByRole("table")).toBeInTheDocument();
    expect(screen.getByText(fixtureSession.title)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
