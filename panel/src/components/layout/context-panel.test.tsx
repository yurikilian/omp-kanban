import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

// This must be the real stylesheet: vitest.config.ts enables css:true, so a
// selector that no longer matches produces the browser default ("auto")
// instead of the DESIGN-SYSTEM.md section 5.3 default width and fails the
// test. See the rendered-geometry-tests skill and
// panel/tests/css-canary.test.tsx.
import "@/styles/shell.css";
import { ContextPanel } from "@/components/layout/context-panel";
import { PreferencesProvider } from "@/components/layout/preferences-provider";
import { CONTEXT_PANEL_DEFAULT_WIDTH, CONTEXT_PANEL_MAX_WIDTH, CONTEXT_PANEL_MIN_WIDTH } from "@/lib/panel-size";

function renderShellBody() {
  return render(
    <PreferencesProvider>
      <div className="app-shell__body">
        <ContextPanel />
        <main className="app-shell__main">Workspace</main>
      </div>
    </PreferencesProvider>,
  );
}

function getPanel() {
  return screen.getByRole("complementary", { name: "Context" });
}

function getDivider() {
  return screen.getByRole("separator", { name: /resize context panel/i });
}

/** Drags from the divider's current position to an absolute pointer X. */
function dragDividerTo(clientX: number) {
  const divider = getDivider();
  fireEvent.pointerDown(divider, { clientX: 0, pointerId: 1 });
  fireEvent.pointerMove(window, { clientX, pointerId: 1 });
  fireEvent.pointerUp(window, { clientX, pointerId: 1 });
}

describe("ContextPanel (DESIGN-SYSTEM.md section 5.3, E2-S2-AC5)", () => {
  it("[E2-S2-AC5] renders at the documented default width before any drag", () => {
    renderShellBody();

    expect(getComputedStyle(getPanel()).width).toBe(`${CONTEXT_PANEL_DEFAULT_WIDTH}px`);
  });

  it("[E2-S2-AC5] dragging the divider to either extreme resizes both panes", () => {
    renderShellBody();
    const panel = getPanel();
    const main = screen.getByRole("main");

    // The main workspace fills whatever the context panel does not use -
    // verified once here so the width assertions below stand in for both
    // panes resizing without needing jsdom's absent layout engine.
    expect(getComputedStyle(main).flexGrow).toBe("1");
    expect(getComputedStyle(main).minWidth).toBe("0px");

    dragDividerTo(-2000);
    expect(getComputedStyle(panel).width).toBe(`${CONTEXT_PANEL_MIN_WIDTH}px`);

    dragDividerTo(2000);
    expect(getComputedStyle(panel).width).toBe(`${CONTEXT_PANEL_MAX_WIDTH}px`);
  });

  it("[E2-S2-AC5] the context panel's resulting computed width stays within 280px and 360px", () => {
    renderShellBody();
    const panel = getPanel();

    for (const clientX of [-100000, -1, 0, 1, 100000]) {
      dragDividerTo(clientX);

      const width = parseFloat(getComputedStyle(panel).width);
      expect(width).toBeGreaterThanOrEqual(CONTEXT_PANEL_MIN_WIDTH);
      expect(width).toBeLessThanOrEqual(CONTEXT_PANEL_MAX_WIDTH);
      expect(getComputedStyle(panel).width).not.toBe("auto");
    }
  });
});