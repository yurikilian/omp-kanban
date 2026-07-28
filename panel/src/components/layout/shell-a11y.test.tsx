import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

// This must be the real stylesheet: vitest.config.ts enables css:true, so a
// selector that no longer matches produces the browser default instead of a
// real value and fails these tests. See the rendered-geometry-tests skill
// and panel/tests/css-canary.test.tsx.
import "@/styles/shell.css";
import { AppShell } from "@/components/layout/app-shell";
import { NAV_AREAS } from "@/components/layout/app-nav";

/**
 * jsdom has no `window.matchMedia` and its computed-style resolver never
 * re-evaluates a live `@media` condition (or a dynamic pseudo-class like
 * `:focus-visible` - `Element.matches()` tracks it correctly, but
 * `getComputedStyle` does not), so the reduced-motion tests below drive the
 * app-nav-visible `data-reduced-motion` attribute through a scriptable
 * `matchMedia` stub instead of a real media query.
 */
interface ReducedMotionQuery {
  matches: boolean;
  media: string;
  addEventListener: (type: string, listener: (event: MediaQueryListEvent) => void) => void;
  removeEventListener: (type: string, listener: (event: MediaQueryListEvent) => void) => void;
}

function stubMatchMedia(initialMatches: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const query: ReducedMotionQuery = {
    matches: initialMatches,
    media: "(prefers-reduced-motion: reduce)",
    addEventListener: (_type, listener) => {
      listeners.add(listener);
    },
    removeEventListener: (_type, listener) => {
      listeners.delete(listener);
    },
  };

  // `query` only implements the members app-nav.tsx actually calls, not the
  // full MediaQueryList interface - standard for a test double of a DOM type.
  window.matchMedia = vi.fn().mockReturnValue(query as unknown as MediaQueryList);

  return {
    setMatches(matches: boolean) {
      query.matches = matches;
      for (const listener of listeners) {
        listener({ matches } as MediaQueryListEvent);
      }
    },
  };
}

/** Finds a rule by the exact selector text the stylesheet declares it with. */
function findRule(selectorText: string): CSSStyleRule {
  for (const sheet of Array.from(document.styleSheets)) {
    for (const rule of Array.from(sheet.cssRules)) {
      if ("selectorText" in rule && (rule as CSSStyleRule).selectorText === selectorText) {
        return rule as CSSStyleRule;
      }
    }
  }
  throw new Error(`No rule found for selector "${selectorText}"`);
}

describe("Shell keyboard accessibility and reduced motion (DESIGN-SYSTEM.md section 5)", () => {
  afterEach(() => {
    document.documentElement.classList.remove("dark");
    vi.unstubAllGlobals();
    // @ts-expect-error - undo the per-test matchMedia stub.
    delete window.matchMedia;
  });

  it("[E2-S2-AC4] gives every global bar and navigation control an accessible name", () => {
    render(
      <AppShell projectName="OMP Panel" current="sessions">
        <p>Workspace content</p>
      </AppShell>,
    );

    expect(screen.getByRole("button", { name: "Switch to dark theme" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Collapse navigation" })).toBeInTheDocument();

    for (const area of NAV_AREAS) {
      expect(screen.getByRole("link", { name: area.label })).toBeInTheDocument();
    }
  });

  it("[E2-S2-AC4] shows a visible, non-default focus indicator on every global bar and navigation control", () => {
    render(
      <AppShell projectName="OMP Panel" current="sessions">
        <p>Workspace content</p>
      </AppShell>,
    );

    const controls = [
      { element: screen.getByRole("button", { name: "Switch to dark theme" }), selector: ".global-bar__theme-toggle:focus-visible" },
      { element: screen.getByRole("button", { name: "Collapse navigation" }), selector: ".app-nav__toggle:focus-visible" },
      { element: screen.getByRole("link", { name: "Sessions" }), selector: ".app-nav__link:focus-visible" },
    ];

    for (const { element, selector } of controls) {
      // The rule is declared with a real, visible outline (not the "none" a
      // non-matching selector would leave getComputedStyle reporting).
      const rule = findRule(selector);
      expect(rule.style.outlineStyle).toBe("solid");
      expect(rule.style.outlineWidth).not.toBe("0px");
      expect(rule.style.outlineWidth).not.toBe("");

      // The keyboard-focused element is the exact element the rule's base
      // class targets. `Element.matches()` (unlike jsdom's computed-style
      // resolver) tracks live `:focus` state; jsdom's `:focus-visible`
      // support is partial for anchors, so `:focus` is the portable check
      // here - the declared rule above is what proves the indicator is
      // wired to that same class.
      element.focus();
      expect(document.activeElement).toBe(element);
      expect(element.matches(":focus")).toBe(true);
      expect(element.matches(selector.replace(":focus-visible", ""))).toBe(true);
      element.blur();
    }
  });

  it("[E2-S2-AC4] reaches the global bar and every navigation control by tabbing in document order", async () => {
    const user = userEvent.setup();
    render(
      <AppShell projectName="OMP Panel" current="sessions">
        <p>Workspace content</p>
      </AppShell>,
    );

    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Switch to dark theme" }));
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Collapse navigation" }));
    for (const area of NAV_AREAS) {
      await user.tab();
      expect(document.activeElement).toBe(screen.getByRole("link", { name: area.label }));
    }
  });


  it("[E2-S2-AC4] exposes the navigation as a landmark with the current item programmatically marked current", () => {
    render(
      <AppShell projectName="OMP Panel" current="observability">
        <p>Workspace content</p>
      </AppShell>,
    );

    const nav = screen.getByRole("navigation", { name: "Application" });
    expect(nav.tagName).toBe("NAV");

    expect(screen.getByRole("link", { name: "Observability" })).toHaveAttribute("aria-current", "page");

    for (const area of NAV_AREAS.filter((candidate) => candidate.key !== "observability")) {
      expect(screen.getByRole("link", { name: area.label })).not.toHaveAttribute("aria-current");
    }
  });

  it("[E2-S2-AC6] applies no width transition to the navigation when reduced motion is preferred", () => {
    const media = stubMatchMedia(true);
    render(
      <AppShell projectName="OMP Panel" current="sessions">
        <p>Workspace content</p>
      </AppShell>,
    );
    media.setMatches(true);

    const nav = screen.getByRole("navigation", { name: "Application" });
    expect(nav).toHaveAttribute("data-reduced-motion", "true");
    expect(getComputedStyle(nav).transitionDuration).toBe("0s");
  });

  it("[E2-S2-AC6] animates the navigation width transition when reduced motion is not preferred", () => {
    stubMatchMedia(false);
    render(
      <AppShell projectName="OMP Panel" current="sessions">
        <p>Workspace content</p>
      </AppShell>,
    );

    const nav = screen.getByRole("navigation", { name: "Application" });
    expect(nav).toHaveAttribute("data-reduced-motion", "false");
    expect(getComputedStyle(nav).transitionProperty).toBe("width");
    expect(getComputedStyle(nav).transitionDuration).not.toBe("0s");
  });
});