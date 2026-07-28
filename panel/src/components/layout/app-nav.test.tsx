import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

// This must be the real stylesheet: vitest.config.ts enables css:true, so a
// selector that no longer matches produces the browser default ("auto")
// instead of the DESIGN-SYSTEM.md section 5.2 width and fails the test. See
// the rendered-geometry-tests skill and panel/tests/css-canary.test.tsx.
import "@/styles/shell.css";
import { AppNav, NAV_AREAS } from "@/components/layout/app-nav";
import { PreferencesProvider } from "@/components/layout/preferences-provider";

describe("AppNav (DESIGN-SYSTEM.md section 5.2)", () => {
  it("[E2-S2-AC1] lists Sessions, Agents, Observability, Audits and Configurations with Sessions marked current", () => {
    render(
      <PreferencesProvider>
        <AppNav current="sessions" />
      </PreferencesProvider>,
    );

    expect(NAV_AREAS.map((area) => area.label)).toEqual([
      "Sessions",
      "Agents",
      "Observability",
      "Audits",
      "Configurations",
    ]);

    for (const area of NAV_AREAS) {
      expect(screen.getByRole("link", { name: area.label })).toBeInTheDocument();
    }

    expect(screen.getByRole("link", { name: "Sessions" })).toHaveAttribute("aria-current", "page");

    for (const area of NAV_AREAS.filter((candidate) => candidate.key !== "sessions")) {
      expect(screen.getByRole("link", { name: area.label })).not.toHaveAttribute("aria-current");
    }
  });

  it("[E2-S2-AC2] resolves computed width to 208px expanded and 64px collapsed, never auto", async () => {
    const user = userEvent.setup();
    render(
      <PreferencesProvider>
        <AppNav current="sessions" />
      </PreferencesProvider>,
    );

    const nav = screen.getByRole("navigation", { name: /application/i });

    expect(getComputedStyle(nav).width).toBe("208px");
    expect(getComputedStyle(nav).width).not.toBe("auto");

    await user.click(screen.getByRole("button", { name: /collapse navigation/i }));

    expect(getComputedStyle(nav).width).toBe("64px");
    expect(getComputedStyle(nav).width).not.toBe("auto");

    await user.click(screen.getByRole("button", { name: /expand navigation/i }));

    expect(getComputedStyle(nav).width).toBe("208px");
    expect(getComputedStyle(nav).width).not.toBe("auto");
  });
});