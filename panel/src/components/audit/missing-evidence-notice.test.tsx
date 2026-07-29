import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MissingEvidenceNotice } from "./missing-evidence-notice";

describe("MissingEvidenceNotice", () => {
  it("states that the referenced event could not be located, naming the evidence it came from, so the finding stays readable (E4-S9-AC3)", () => {
    render(<MissingEvidenceNotice evidenceId="evidence-1" />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      'The event referenced by evidence "evidence-1" could not be located in the transcript.',
    );
  });
});
