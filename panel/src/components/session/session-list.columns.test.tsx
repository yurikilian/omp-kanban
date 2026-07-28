import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import "../../app/globals.css";
import type { SessionSummary } from "@/server/sessions/types";
import { SessionList } from "./session-list";

const session: SessionSummary = {
  id: "session-1",
  title: "Numeric metrics",
  project: "alpha",
  startedAt: "2026-01-01T09:00:00.000Z",
  lastActivityAt: "2026-01-01T09:10:00.000Z",
  durationMs: 600_000,
  costUsd: 12.5,
  inputTokens: 1_500,
  outputTokens: 300,
  agentCount: 2,
  toolCallCount: 3,
};

describe("SessionList numeric columns", () => {
  it("resolves tabular numerals and right alignment for numeric values (E3-S3-AC5)", () => {
    render(<SessionList sessions={[session]} />);

    const row = screen.getAllByRole("row")[1];
    for (const value of ["10m 00s", "$12.50", "1.5K", "300", "2", "3"]) {
      const cell = within(row).getByText(value).closest("td");
      expect(cell).not.toBeNull();
      expect(getComputedStyle(cell!).fontVariantNumeric).toBe("tabular-nums");
      expect(getComputedStyle(cell!).textAlign).toBe("right");
    }
  });
});