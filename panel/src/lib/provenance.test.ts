import { describe, expect, it } from "vitest";
import { formatProvenance, provenanceLabels } from "./provenance";

describe("audit value provenance (E4-S8-AC3)", () => {
  it("names every supported provenance explicitly", () => {
    expect(provenanceLabels).toEqual({
      observed: "Observed",
      derived: "Derived",
      estimated: "Estimated",
      inferred: "Inferred",
      unavailable: "Unavailable",
    });

    expect(formatProvenance("estimated")).toBe("Estimated");
  });
});
