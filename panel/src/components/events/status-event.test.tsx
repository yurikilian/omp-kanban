import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import "../../app/globals.css";
import { StatusEvent } from "./status-event";

describe("StatusEvent", () => {
  it("renders as a compact separator rather than a card (E3-S7-AC1)", () => {
    const { container } = render(<StatusEvent timestamp="2026-01-01T10:00:00.000Z" label="Session started" />);

    expect(screen.getByText("Session started")).toBeInTheDocument();
    expect(screen.getByRole("separator")).toBeInTheDocument();
    // The shared card frame every other event type renders through must be
    // absent here - that distinction from a card is the entire point of a
    // status event (E3-S7-AC1).
    expect(container.querySelector('[data-slot="event-frame"]')).toBeNull();
  });

  it("shows the event's timestamp", () => {
    render(<StatusEvent timestamp="2026-01-01T10:00:00.000Z" label="Session started" />);

    const time = document.querySelector('time[datetime="2026-01-01T10:00:00.000Z"]');
    expect(time).not.toBeNull();
    expect(time).toHaveTextContent(/\S/);
  });
});