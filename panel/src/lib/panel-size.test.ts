import { describe, expect, it } from "vitest";
import {
  CONTEXT_PANEL_DEFAULT_WIDTH,
  CONTEXT_PANEL_MAX_WIDTH,
  CONTEXT_PANEL_MIN_WIDTH,
  clampContextPanelWidth,
} from "@/lib/panel-size";

describe("clampContextPanelWidth (DESIGN-SYSTEM.md section 5.3, E2-S2-AC5)", () => {
  it("[E2-S2-AC5] leaves a width already within 280px-360px unchanged", () => {
    expect(clampContextPanelWidth(300)).toBe(300);
    expect(clampContextPanelWidth(CONTEXT_PANEL_MIN_WIDTH)).toBe(CONTEXT_PANEL_MIN_WIDTH);
    expect(clampContextPanelWidth(CONTEXT_PANEL_MAX_WIDTH)).toBe(CONTEXT_PANEL_MAX_WIDTH);
  });

  it("[E2-S2-AC5] clamps a width below the minimum up to 280px", () => {
    expect(clampContextPanelWidth(100)).toBe(CONTEXT_PANEL_MIN_WIDTH);
    expect(clampContextPanelWidth(-50)).toBe(CONTEXT_PANEL_MIN_WIDTH);
  });

  it("[E2-S2-AC5] clamps a width above the maximum down to 360px", () => {
    expect(clampContextPanelWidth(1000)).toBe(CONTEXT_PANEL_MAX_WIDTH);
    expect(clampContextPanelWidth(Number.MAX_SAFE_INTEGER)).toBe(CONTEXT_PANEL_MAX_WIDTH);
  });

  it("the documented default width already sits inside its own clamped range", () => {
    expect(CONTEXT_PANEL_DEFAULT_WIDTH).toBeGreaterThanOrEqual(CONTEXT_PANEL_MIN_WIDTH);
    expect(CONTEXT_PANEL_DEFAULT_WIDTH).toBeLessThanOrEqual(CONTEXT_PANEL_MAX_WIDTH);
    expect(clampContextPanelWidth(CONTEXT_PANEL_DEFAULT_WIDTH)).toBe(CONTEXT_PANEL_DEFAULT_WIDTH);
  });
});