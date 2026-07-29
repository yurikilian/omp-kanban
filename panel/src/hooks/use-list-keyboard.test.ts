import { fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { useListKeyboard } from "./use-list-keyboard";

/** A minimal 3-row list wired to the hook, close enough to SessionList's own row shape for these tests. */
function TestList({ itemCount = 3, onConfirm = vi.fn() }: { itemCount?: number; onConfirm?: (index: number) => void }) {
  const { focusedIndex, getItemProps, containerKeyDownProps } = useListKeyboard(itemCount, onConfirm);

  return createElement(
    "ul",
    { "data-testid": "list", ...containerKeyDownProps },
    Array.from({ length: itemCount }, (_, index) =>
      createElement(
        "li",
        { key: index, "data-testid": `row-${index}`, ...getItemProps(index) },
        `Row ${index}${index === focusedIndex ? " (focused)" : ""}`,
      ),
    ),
  );
}

describe("useListKeyboard", () => {
  it("starts with the first row as the only tabbable item (roving tabindex)", () => {
    render(createElement(TestList));

    expect(screen.getByTestId("row-0")).toHaveAttribute("tabindex", "0");
    expect(screen.getByTestId("row-1")).toHaveAttribute("tabindex", "-1");
    expect(screen.getByTestId("row-2")).toHaveAttribute("tabindex", "-1");
  });

  it("moves focus one row per ArrowDown/ArrowUp press, scrolling the row into view with a visible focus indicator (E3-S11-AC1)", () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    render(createElement(TestList));

    fireEvent.keyDown(screen.getByTestId("list"), { key: "ArrowDown" });

    expect(screen.getByTestId("row-1")).toHaveAttribute("tabindex", "0");
    expect(screen.getByTestId("row-1")).toHaveFocus();
    expect(scrollIntoView).toHaveBeenCalled();

    fireEvent.keyDown(screen.getByTestId("list"), { key: "ArrowDown" });
    expect(screen.getByTestId("row-2")).toHaveFocus();

    fireEvent.keyDown(screen.getByTestId("list"), { key: "ArrowUp" });
    expect(screen.getByTestId("row-1")).toHaveFocus();
  });

  it("clamps at the last row rather than wrapping around", () => {
    render(createElement(TestList, { itemCount: 2 }));

    fireEvent.keyDown(screen.getByTestId("list"), { key: "ArrowDown" });
    fireEvent.keyDown(screen.getByTestId("list"), { key: "ArrowDown" });
    fireEvent.keyDown(screen.getByTestId("list"), { key: "ArrowDown" });

    expect(screen.getByTestId("row-1")).toHaveFocus();
  });

  it("clamps at the first row rather than wrapping around", () => {
    render(createElement(TestList));

    fireEvent.keyDown(screen.getByTestId("list"), { key: "ArrowUp" });

    expect(screen.getByTestId("row-0")).toHaveFocus();
  });

  it("opens the focused row when the confirm key is pressed (E3-S11-AC1)", () => {
    const onConfirm = vi.fn();
    render(createElement(TestList, { onConfirm }));

    fireEvent.keyDown(screen.getByTestId("list"), { key: "ArrowDown" });
    fireEvent.keyDown(screen.getByTestId("list"), { key: "Enter" });

    expect(onConfirm).toHaveBeenCalledExactlyOnceWith(1);
  });

  it("does nothing for an empty list", () => {
    const onConfirm = vi.fn();
    render(createElement(TestList, { itemCount: 0, onConfirm }));

    fireEvent.keyDown(screen.getByTestId("list"), { key: "ArrowDown" });
    fireEvent.keyDown(screen.getByTestId("list"), { key: "Enter" });

    expect(onConfirm).not.toHaveBeenCalled();
  });
});
