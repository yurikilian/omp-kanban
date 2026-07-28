import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MissingEventNotice } from "./missing-event-notice";

describe("MissingEventNotice", () => {
  it("explicitly tells a deep-link visitor when the requested event is absent (E3-S10-AC3)", () => {
    render(<MissingEventNotice eventId="main:missing" />);

    expect(screen.getByRole("alert")).toHaveTextContent('The event "main:missing" could not be found in this session.');
  });
});