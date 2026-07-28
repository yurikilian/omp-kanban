import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ReturnToLive } from "./return-to-live";

describe("ReturnToLive", () => {
  it("appears while the timeline is scrolled away and restores following when activated (E3-S9-AC3)", async () => {
    const user = userEvent.setup();
    const onReturn = vi.fn();
    const { rerender } = render(<ReturnToLive isVisible={false} onReturn={onReturn} />);

    expect(screen.queryByRole("button", { name: "Return to live" })).not.toBeInTheDocument();

    rerender(<ReturnToLive isVisible onReturn={onReturn} />);
    await user.click(screen.getByRole("button", { name: "Return to live" }));

    expect(onReturn).toHaveBeenCalledOnce();
  });
});
