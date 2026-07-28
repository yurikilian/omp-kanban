import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import "../../app/globals.css";
import { ContentView } from "./content-view";

describe("ContentView", () => {
  it("renders a script tag as inert text instead of executing it (E3-S7-AC7)", () => {
    const probe = window as typeof window & { __pwned?: boolean };
    const { container } = render(
      <ContentView text={"Before <script>window.__pwned = true;</script> after"} />,
    );

    expect(container.querySelector("script")).toBeNull();
    expect(container.textContent).toBe("Before  after");
    expect(probe.__pwned).toBeUndefined();
  });

  it("strips a self-closing tag carrying an event-handler attribute down to inert text (E3-S7-AC7)", () => {
    const { container } = render(<ContentView text={'<img src="x" onerror="alert(1)">gotcha'} />);

    expect(container.innerHTML).not.toContain("onerror");
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toBe("gotcha");
  });

  it("passes ordinary prompt text through the reading column unchanged", () => {
    const { container } = render(<ContentView text="Please refactor the billing module." />);

    expect(container.textContent).toBe("Please refactor the billing module.");
  });

  it("constrains its content to a bounded reading column", () => {
    const { container } = render(<ContentView text="Hello" />);
    const view = container.firstElementChild as Element;

    const { maxWidth } = getComputedStyle(view);
    expect(maxWidth).toBe("672px");
    expect(maxWidth).not.toBe("auto");
  });
});