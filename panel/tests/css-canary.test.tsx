import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

// Importing the real stylesheet is the whole point: with vitest.config.ts's
// `css: true`, PostCSS/Tailwind processes this exactly as the app build does,
// so a selector that stops matching makes this test fail. Without `css:
// true`, CSS imports are stubbed and every selector "matches" nothing is
// distinguishable from everything - see the rendered-geometry-tests skill.
import "../src/app/globals.css";

describe("css processing canary", () => {
  it("resolves a computed value produced only by a real stylesheet rule", () => {
    const { container } = render(<div className="css-canary-probe" />);
    const probe = container.querySelector(".css-canary-probe");
    expect(probe).not.toBeNull();

    const { width } = getComputedStyle(probe as Element);

    // 137px is an arbitrary, distinctive value that cannot come from any
    // browser/jsdom default. A non-matching selector resolves width to
    // 'auto' (jsdom performs no layout, so this is the only two outcomes).
    expect(width).toBe("137px");
    expect(width).not.toBe("auto");
  });
});
