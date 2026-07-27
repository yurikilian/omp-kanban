import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

// This must be the real stylesheet: vitest.config.ts enables css:true, so a
// selector that no longer matches fails this test instead of passing
// vacuously. See the rendered-geometry-tests skill and
// panel/tests/css-canary.test.tsx.
import "@/styles/shell.css";
import { AppShell } from "@/components/layout/app-shell";

describe("AppShell (DESIGN-SYSTEM.md section 5)", () => {
  it("[E2-S2-AC1] renders the global bar and the application navigation around the given workspace content", () => {
    render(
      <AppShell projectName="OMP Panel" current="sessions">
        <p>Workspace content</p>
      </AppShell>,
    );

    expect(screen.getByText("OMP Panel")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /theme/i })).toBeInTheDocument();

    const nav = screen.getByRole("navigation", { name: /application/i });
    expect(nav).toContainElement(screen.getByRole("link", { name: "Sessions" }));
    expect(screen.getByRole("link", { name: "Sessions" })).toHaveAttribute("aria-current", "page");

    expect(screen.getByText("Workspace content")).toBeInTheDocument();
  });
});
