import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionListStates } from "./session-list-states";

const fetchMock = vi.fn();

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
});
