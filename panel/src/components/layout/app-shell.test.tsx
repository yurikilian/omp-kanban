import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

// This must be the real stylesheet: vitest.config.ts enables css:true, so a
// selector that no longer matches fails this test instead of passing
// vacuously. See the rendered-geometry-tests skill and
// panel/tests/css-canary.test.tsx.
import "@/styles/shell.css";
import { AppShell } from "@/components/layout/app-shell";
import { PreferencesProvider } from "@/components/layout/preferences-provider";

describe("AppShell (DESIGN-SYSTEM.md section 5)", () => {
  it("[E2-S2-AC1] renders the global bar and the application navigation around the given workspace content", () => {
    render(
      <PreferencesProvider>
        <AppShell projectName="OMP Panel" current="sessions">
          <p>Workspace content</p>
        </AppShell>
      </PreferencesProvider>,
    );

    expect(screen.getByText("OMP Panel")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /theme/i })).toBeInTheDocument();

    const nav = screen.getByRole("navigation", { name: /application/i });
    expect(nav).toContainElement(screen.getByRole("link", { name: "Sessions" }));
    expect(screen.getByRole("link", { name: "Sessions" })).toHaveAttribute("aria-current", "page");

    expect(screen.getByText("Workspace content")).toBeInTheDocument();
  });
  it("[E3-S7-AC5] lets the document scroll instead of clamping the viewport and hiding the workspace scrollbar", () => {
    const { container } = render(
      <PreferencesProvider>
        <AppShell projectName="OMP Panel" current="sessions">
          <p>Workspace content</p>
        </AppShell>
      </PreferencesProvider>,
    );

    const shell = container.querySelector<HTMLElement>(".app-shell");
    const workspace = container.querySelector<HTMLElement>(".app-shell__main");

    expect(shell).not.toBeNull();
    expect(workspace).not.toBeNull();

    const shellStyle = getComputedStyle(shell!);
    const workspaceStyle = getComputedStyle(workspace!);

    expect(shellStyle.height).not.toBe("100dvh");
    expect(workspaceStyle.overflowY).not.toBe("auto");
    expect(shellStyle.minHeight).toBe("100dvh");
    expect(workspaceStyle.flexGrow).toBe("1");
  });
  it("[E3-S7-AC5] keeps navigation and context panel widths while the page scrolls", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <PreferencesProvider>
        <AppShell projectName="OMP Panel" current="sessions">
          <div style={{ height: "2000px" }}>Long workspace content</div>
        </AppShell>
      </PreferencesProvider>,
    );

    const nav = screen.getByRole("navigation", { name: /application/i });
    const contextPanel = container.querySelector<HTMLElement>(".context-panel");

    expect(contextPanel).not.toBeNull();

    const expandedNavStyle = getComputedStyle(nav);
    const contextPanelStyle = getComputedStyle(contextPanel!);

    expect(expandedNavStyle.width).toBe("208px");
    expect(expandedNavStyle.height).toBe("calc(100dvh - 48px)");
    expect(expandedNavStyle.overflowY).toBe("auto");
    expect(contextPanelStyle.width).toBe("320px");
    expect(contextPanelStyle.height).toBe("calc(100dvh - 48px)");
    expect(contextPanelStyle.overflowY).toBe("auto");

    await user.click(screen.getByRole("button", { name: /collapse navigation/i }));

    expect(getComputedStyle(nav).width).toBe("64px");
  });
});