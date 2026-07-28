import { describe, expect, it } from "vitest";
import { resolveAuditPricing } from "./pricing";

describe("resolveAuditPricing", () => {
  it("marks pricing unavailable when the user supplies none instead of manufacturing a price (E4-S1-AC4)", () => {
    expect(resolveAuditPricing(undefined)).toEqual({ available: false, pricing: null });
    expect(resolveAuditPricing("   ")).toEqual({ available: false, pricing: null });
  });

  it("retains only pricing supplied by the user verbatim (E4-S1-AC4)", () => {
    expect(resolveAuditPricing("$15 / million input tokens")).toEqual({
      available: true,
      pricing: "$15 / million input tokens",
    });
  });
});