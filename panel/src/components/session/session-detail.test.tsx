import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { SessionDetail as SessionDetailData } from "@/server/sessions/detail";
import { SessionDetail } from "./session-detail";

const session: SessionDetailData = {
  id: "2026-01-01T09-00-00-000Z_00000000-0000-7000-8000-00000000000a",
  title: "Refactor billing module",
  project: "alpha",
  startedAt: "2026-01-01T09:00:00.000Z",
  lastActivityAt: "2026-01-01T09:10:00.000Z",
  durationMs: 10 * 60 * 1000,
  costUsd: 0.015,
  inputTokens: 1500,
  outputTokens: 300,
  agentCount: 1,
  toolCallCount: 1,
  status: {
    label: "Completed",
    derived: true,
    basis: "a normal session exit event",
  },
};

describe("SessionDetail", () => {
  it("combines the compact header with one inline metric strip (E3-S6-AC1)", () => {
    render(<SessionDetail session={session} />);

    const detail = screen.getByRole("region", { name: "Session detail" });
    expect(within(detail).getByRole("heading", { name: "Refactor billing module" })).toBeInTheDocument();
    expect(within(detail).getByText("Completed")).toBeInTheDocument();
    expect(within(detail).getByText("10m 00s")).toBeInTheDocument();
    expect(within(detail).getByText("Derived from a normal session exit event")).toBeInTheDocument();
    expect(within(detail).getByRole("region", { name: "Session metrics" })).toBeInTheDocument();
  });
});
