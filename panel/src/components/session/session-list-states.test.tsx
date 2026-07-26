import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionListStates } from "./session-list-states";

const fetchMock = vi.fn();

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
});
