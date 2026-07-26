import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

// This must be the real stylesheet: vitest.config.ts enables css:true, so a
// selector that no longer matches produces the browser default and fails.
import "./typography.css";

describe("OMP Prism typography (DESIGN-SYSTEM.md section 15)", () => {
  it("[E2-S1-AC4] resolves body text to the local UI family and code to the local mono family", () => {
    const { container } = render(
      <div>
        <p className="typography-body">Readable interface text</p>
        <pre>
          <code className="typography-code">{"{\"session\": \"local\"}"}</code>
        </pre>
      </div>,
    );

    const bodyText = container.querySelector("p.typography-body");
    const codeBlock = container.querySelector("code.typography-code");

    if (!bodyText || !codeBlock) {
      throw new Error("typography probes did not render");
    }

    expect(getComputedStyle(bodyText).fontFamily).toContain("Geist Sans");
    expect(getComputedStyle(codeBlock).fontFamily).toContain("Geist Mono");
  });
});
