import { describe, expect, it } from "vitest";
import { resolveAgentIdentity } from "@/lib/agent-identity";

const DESIGN_SYSTEM_IDENTITIES = [
  ["coordinator", "Coordinator", "--agent-blue"],
  ["planner", "Planner", "--agent-violet"],
  ["developer", "Developer", "--agent-green"],
  ["reviewer", "Reviewer", "--agent-amber"],
  ["qa", "QA", "--agent-pink"],
  ["research", "Research", "--agent-teal"],
  ["fixer", "Fixer", "--agent-orange"],
  ["unknown", "Unknown", "--agent-gray"],
] as const;

describe("agent identity resolver", () => {
  it("E2-S1-AC3: maps every documented family to its labelled accent token", () => {
    for (const [family, label, accentToken] of DESIGN_SYSTEM_IDENTITIES) {
      expect(resolveAgentIdentity(family)).toMatchObject({
        family,
        label,
        accentToken,
      });
    }
  });

  it("E2-S1-AC3: recognizes the documented Root and Custom aliases", () => {
    expect(resolveAgentIdentity(" Root ")).toMatchObject({
      family: "coordinator",
      label: "Coordinator",
      accentToken: "--agent-blue",
    });
    expect(resolveAgentIdentity("CUSTOM")).toMatchObject({
      family: "unknown",
      label: "Unknown",
      accentToken: "--agent-gray",
    });
  });

  it("E2-S1-AC3: gives missing and unrecognized roles the labelled Unknown fallback", () => {
    for (const family of [undefined, null, "observer"]) {
      expect(resolveAgentIdentity(family)).toMatchObject({
        family: "unknown",
        label: "Unknown",
        accentToken: "--agent-gray",
      });
    }
  });

  it("E2-S1-AC3: keeps agent identity separate from the primary interaction token", () => {
    for (const [family] of DESIGN_SYSTEM_IDENTITIES) {
      expect(resolveAgentIdentity(family).accentToken).not.toBe("--primary");
    }
  });
});
