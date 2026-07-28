import { render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

// Importing the real stylesheet is the point: vitest.config.ts's css:true
// makes PostCSS/Tailwind process this exactly as the app build does, so a
// token that stops resolving - or a selector that stops matching - fails
// this test instead of passing vacuously. See the rendered-geometry-tests
// skill and panel/tests/css-canary.test.tsx.
import "../app/globals.css";

// DESIGN-SYSTEM.md section 3.1, copied verbatim so this test fails the
// moment tokens.css (or globals.css's use of it) drifts from the spec.
const LIGHT_TOKENS: Record<string, string> = {
  "--background": "220 20% 98%",
  "--surface-1": "0 0% 100%",
  "--surface-2": "220 18% 96%",
  "--surface-3": "220 15% 93%",
  "--border": "220 14% 88%",
  "--muted": "220 15% 95%",
  "--muted-foreground": "220 9% 43%",
  "--primary": "217 91% 56%",
};

const DARK_TOKENS: Record<string, string> = {
  "--background": "225 16% 7%",
  "--surface-1": "224 15% 9%",
  "--surface-2": "224 14% 12%",
  "--surface-3": "224 13% 15%",
  "--border": "220 11% 19%",
  "--muted": "224 13% 13%",
  "--muted-foreground": "218 10% 61%",
  "--primary": "213 94% 68%",
};

function readTokens(names: string[]): Record<string, string> {
  const styles = getComputedStyle(document.documentElement);
  const result: Record<string, string> = {};
  for (const name of names) {
    result[name] = styles.getPropertyValue(name).trim();
  }
  return result;
}

/** The lightness channel of an "H S% L%" token, e.g. "225 16% 7%" -> 7. */
function lightnessOf(hslTriplet: string): number {
  const match = hslTriplet.match(/(-?\d+(?:\.\d+)?)%\s*$/);
  if (!match) {
    throw new Error(`not an "H S% L%" triplet: "${hslTriplet}"`);
  }
  return Number(match[1]);
}

describe("OMP Prism surface tokens (DESIGN-SYSTEM.md section 3.1)", () => {
  afterEach(() => {
    document.documentElement.classList.remove("dark");
  });

  it("every light-theme surface token resolves to its DESIGN-SYSTEM 3.1 value", () => {
    render(<div />);

    expect(readTokens(Object.keys(LIGHT_TOKENS))).toEqual(LIGHT_TOKENS);
  });

  it("every dark-theme surface token resolves to its DESIGN-SYSTEM 3.1 value", () => {
    render(<div />);
    document.documentElement.classList.add("dark");

    expect(readTokens(Object.keys(DARK_TOKENS))).toEqual(DARK_TOKENS);
  });

  it("the dark background is not pure black", () => {
    render(<div />);
    document.documentElement.classList.add("dark");

    const background = readTokens(["--background"])["--background"];

    expect(lightnessOf(background)).toBeGreaterThan(0);
  });
});
