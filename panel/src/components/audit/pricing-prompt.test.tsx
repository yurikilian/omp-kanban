import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuditJob } from "@/server/audits/types";
import { GenerateAuditButton } from "./generate-audit-button";

const SESSION_ID = "2026-01-01T09-00-00-000Z_00000000-0000-7000-8000-00000000000a";
const SESSION_TITLE = "Refactor billing module";
const AUDIT_JOB: AuditJob = {
  id: "audit_00000000-0000-4000-8000-000000000001",
  sessionId: SESSION_ID,
  status: "queued",
  createdAt: "2026-01-01T09:11:00.000Z",
};

function mockJsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("audit eligibility and pricing", () => {
  it("disables an ineligible session's action and states why before it can activate (E4-S1-AC6)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse(null));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(
      <GenerateAuditButton
        sessionId={SESSION_ID}
        sessionTitle={SESSION_TITLE}
        eligibility={{ eligible: false, reason: "The session transcript is empty." }}
      />,
    );

    const button = screen.getByRole("button", { name: `Generate audit for ${SESSION_TITLE}` });
    expect(button).toBeDisabled();
    expect(screen.getByText("The session transcript is empty.")).toBeInTheDocument();
    await user.click(button);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("lets the user supply pricing and sends that value without inventing another price (E4-S1-AC4)", async () => {
    const fetchMock = vi.fn((_: string, options?: RequestInit) =>
      Promise.resolve(options?.method === "POST" ? mockJsonResponse(AUDIT_JOB) : mockJsonResponse(null)),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<GenerateAuditButton sessionId={SESSION_ID} sessionTitle={SESSION_TITLE} />);

    const pricing = screen.getByLabelText("Optional pricing");
    await user.type(pricing, "$15 / million input tokens");
    await user.click(screen.getByRole("button", { name: `Generate audit for ${SESSION_TITLE}` }));

    expect(fetchMock).toHaveBeenCalledWith("/api/audits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: SESSION_ID, pricing: "$15 / million input tokens" }),
    });
  });

  it("proceeds token-only when pricing is left blank (E4-S1-AC4)", async () => {
    const fetchMock = vi.fn((_: string, options?: RequestInit) =>
      Promise.resolve(options?.method === "POST" ? mockJsonResponse(AUDIT_JOB) : mockJsonResponse(null)),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<GenerateAuditButton sessionId={SESSION_ID} sessionTitle={SESSION_TITLE} />);
    await user.click(screen.getByRole("button", { name: `Generate audit for ${SESSION_TITLE}` }));

    expect(fetchMock).toHaveBeenCalledWith("/api/audits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: SESSION_ID }),
    });
  });
});