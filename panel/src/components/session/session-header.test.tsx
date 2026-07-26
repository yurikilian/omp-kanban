import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import "../../app/globals.css";
import { SessionHeader } from "./session-header";

describe("SessionHeader", () => {
  it("renders title, status, start time and duration together on one compact header line (E3-S6-AC1)", () => {
    render(
      <SessionHeader
        title="Refactor billing module"
        status={{
          label: "Completed",
          derived: true,
          basis: "a normal session exit event",
        }}
        startedAt="2026-01-01T09:00:00.000Z"
        durationMs={10 * 60 * 1000}
      />,
    );

    const header = screen.getByRole("group", { name: "Session header" });
    expect(within(header).getByRole("heading", { name: "Refactor billing module" })).toBeInTheDocument();
    expect(within(header).getByText("Completed")).toBeInTheDocument();
    expect(within(header).getByText("10m 00s")).toBeInTheDocument();

    const startTime = header.querySelector('time[datetime="2026-01-01T09:00:00.000Z"]');
    expect(startTime).toHaveTextContent(/\S/);

    const style = getComputedStyle(header);
    expect(style.display).toBe("flex");
    expect(style.flexDirection).toBe("row");
    expect(style.flexWrap).toBe("nowrap");
  });

  it("labels an unrecorded status as derived and states its derivation basis (E3-S6-AC2)", () => {
    render(
      <SessionHeader
        title="Active session"
        status={{
          label: "Running",
          derived: true,
          basis: "no session exit event was recorded",
        }}
        startedAt="2026-01-01T09:00:00.000Z"
        durationMs={0}
      />,
    );

    const header = screen.getByRole("group", { name: "Session header" });
    expect(within(header).getByText("Running")).toBeInTheDocument();
    expect(
      within(header).getByText("Derived from no session exit event was recorded"),
    ).toBeInTheDocument();
  });
});
