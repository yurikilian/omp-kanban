import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuditJob } from "@/server/audits/types";
import { GenerateAuditButton } from "./generate-audit-button";
import { createAuditJob } from "@/server/audits/job-store";
import type { AuditTarget } from "@/server/audits/fingerprint";

const SESSION_ID = "2026-01-01T09-00-00-000Z_00000000-0000-7000-8000-00000000000a";
const SESSION_TITLE = "Refactor billing module";
const AUDIT_JOB: AuditJob = {
  id: "audit_00000000-0000-4000-8000-000000000001",
  sessionId: SESSION_ID,
  status: "queued",
  createdAt: "2026-01-01T09:11:00.000Z",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GenerateAuditButton rerun flow", () => {
  it("offers the in-flight audit rather than starting another one (E4-S2-AC4)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => AUDIT_JOB }));

    render(<GenerateAuditButton sessionId={SESSION_ID} sessionTitle={SESSION_TITLE} />);

    expect(await screen.findByRole("status")).toHaveTextContent(`Audit ${AUDIT_JOB.id} is queued.`);
    expect(screen.getByRole("button", { name: `Rerun audit for ${SESSION_TITLE}` })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: `Generate audit for ${SESSION_TITLE}` })).not.toBeInTheDocument();
  });
  it("creates a new audit id when an explicit rerun is requested (E4-S2-AC2)", async () => {
    const target: AuditTarget = {
      targetContent: "same transcript for a forced rerun",
      analyzerVersion: "audit-analyzer@1.0.0",
    };
    const original = await createAuditJob("rerun-session", target);
    const rerun = await createAuditJob("rerun-session", target, { rerun: true });

    expect(rerun.id).not.toBe(original.id);
  });

  it("returns the in-flight audit for simultaneous activations of its fingerprint (E4-S2-AC4)", async () => {
    const target: AuditTarget = {
      targetContent: "same transcript for simultaneous activation",
      analyzerVersion: "audit-analyzer@1.0.0",
    };

    const [first, second] = await Promise.all([
      createAuditJob("simultaneous-session", target),
      createAuditJob("simultaneous-session", target),
    ]);

    expect(second).toEqual(first);
  });

  it("posts an explicit rerun and surfaces its new audit id (E4-S2-AC2)", async () => {
    const rerunJob = { ...AUDIT_JOB, id: "audit_00000000-0000-4000-8000-000000000002" };
    const fetchMock = vi.fn((_: string, options?: RequestInit) =>
      Promise.resolve({ ok: true, status: 200, json: async () => (options ? rerunJob : AUDIT_JOB) }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<GenerateAuditButton sessionId={SESSION_ID} sessionTitle={SESSION_TITLE} />);
    await screen.findByRole("status");
    await user.click(screen.getByRole("button", { name: `Rerun audit for ${SESSION_TITLE}` }));
    await user.click(screen.getByRole("button", { name: "Rerun audit" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/audits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: SESSION_ID, rerun: true }),
      }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(`Audit ${rerunJob.id} is queued.`);
  });
});
