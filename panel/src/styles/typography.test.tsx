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

  it("[E2-S1-AC5] resolves body, secondary metadata, and long-form response text to their section 15 role sizes", () => {
    const { container } = render(
      <div>
        <p className="typography-body">Readable interface text</p>
        <span className="typography-metadata">Secondary metadata</span>
        <article className="typography-response">Long-form agent response</article>
      </div>,
    );

    const bodyText = container.querySelector("p.typography-body");
    const metadata = container.querySelector("span.typography-metadata");
    const response = container.querySelector("article.typography-response");

    if (!bodyText || !metadata || !response) {
      throw new Error("typography size probes did not render");
    }

    expect(getComputedStyle(bodyText).fontSize).toBe("0.875rem");
    expect(getComputedStyle(metadata).fontSize).toBe("0.8125rem");
    expect(getComputedStyle(response).fontSize).toBe("1rem");
  });
});
