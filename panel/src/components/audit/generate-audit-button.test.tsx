import { render, screen, waitFor } from "@testing-library/react";
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

const EARLIER_AUDIT_JOB: AuditJob = {
  ...AUDIT_JOB,
  id: "audit_00000000-0000-4000-8000-000000000000",
  status: "completed",
  createdAt: "2026-01-01T09:10:00.000Z",
};

function mockJsonResponse(body: unknown, ok = true) {
  return { ok, status: ok ? 200 : 500, json: async () => body };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GenerateAuditButton", () => {
  it("names the detail session as its only audit target, hides status for empty canonical history, and offers no target picker (E4-S1-AC1, E4-S6-AC4)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse([]));
    vi.stubGlobal("fetch", fetchMock);

    render(<GenerateAuditButton sessionId={SESSION_ID} sessionTitle={SESSION_TITLE} />);

    expect(screen.getByText(`Audit target: ${SESSION_TITLE}`)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: `Generate audit for ${SESSION_TITLE}` })).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(`/api/audits?sessionId=${encodeURIComponent(SESSION_ID)}`),
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("posts only the detail session to receive a queued audit id without browser analysis (E4-S1-AC2, E4-S1-AC5)", async () => {
    const fetchMock = vi.fn((url: string, options?: RequestInit) =>
      Promise.resolve(options?.method === "POST" ? mockJsonResponse(AUDIT_JOB) : mockJsonResponse([])),
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
    expect(await screen.findByRole("status")).toHaveTextContent(`Audit ${AUDIT_JOB.id} is queued.`);
  });

  it("shows the latest durable audit from canonical history when the detail reloads (E4-S6-AC4)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse([EARLIER_AUDIT_JOB, AUDIT_JOB]));
    vi.stubGlobal("fetch", fetchMock);

    render(<GenerateAuditButton sessionId={SESSION_ID} sessionTitle={SESSION_TITLE} />);

    expect(await screen.findByRole("status")).toHaveTextContent(`Audit ${AUDIT_JOB.id} is queued.`);
  });
});