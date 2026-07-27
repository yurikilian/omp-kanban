import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

// This must be the real stylesheet: vitest.config.ts enables css:true, so a
// selector that no longer matches produces the browser default instead of
// the DESIGN-SYSTEM.md section 5.1 rules and fails the test. See the
// rendered-geometry-tests skill and panel/tests/css-canary.test.tsx.
import "@/styles/shell.css";
import { GlobalBar } from "@/components/layout/global-bar";

describe("GlobalBar (DESIGN-SYSTEM.md section 5.1)", () => {
  afterEach(() => {
    document.documentElement.classList.remove("dark");
  });

  it("[E2-S2-AC1] shows the project name and a theme switch that toggles the document theme", async () => {
    const user = userEvent.setup();
    render(<GlobalBar projectName="OMP Panel" />);

    expect(screen.getByText("OMP Panel")).toBeInTheDocument();

    const toggle = screen.getByRole("button", { name: /theme/i });
    expect(document.documentElement.classList.contains("dark")).toBe(false);

    await user.click(toggle);
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    await user.click(toggle);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});
