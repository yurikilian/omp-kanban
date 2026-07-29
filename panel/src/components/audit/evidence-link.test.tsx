import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EvidenceLink } from "./evidence-link";

describe("EvidenceLink", () => {
  it("links an evidence record through the audit-scoped resolver (E4-S9-AC1)", () => {
    render(<EvidenceLink auditId="audit / 42" evidenceId="evidence #7" />);

    expect(screen.getByRole("link", { name: "Open evidence evidence #7" })).toHaveAttribute(
      "href",
      "/api/audits/audit%20%2F%2042/evidence?evidenceId=evidence+%237",
    );
  });
});
