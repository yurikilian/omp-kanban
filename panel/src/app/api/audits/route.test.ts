// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuditJob } from "@/server/audits/types";
import type * as SessionDetailModule from "@/server/sessions/detail";

const getSessionDetail = vi.fn();
const createAuditJob = vi.fn();
const getLatestAuditJobForSession = vi.fn();
const getAuditJobsForSession = vi.fn();

vi.mock("@/server/sessions/detail", async (importOriginal) => {
  const actual = await importOriginal<typeof SessionDetailModule>();
  return {
    ...actual,
    getSessionDetail: (...args: unknown[]) => getSessionDetail(...args),
  };
});

vi.mock("@/server/audits/job-store", () => ({
  createAuditJob: (...args: unknown[]) => createAuditJob(...args),
  getLatestAuditJobForSession: (...args: unknown[]) => getLatestAuditJobForSession(...args),
  getAuditJobsForSession: (...args: unknown[]) => getAuditJobsForSession(...args),
}));

import { GET, POST } from "./route";

const SESSION_ID = "2026-01-01T09-00-00-000Z_00000000-0000-7000-8000-00000000000a";
const AUDIT_JOB: AuditJob = {
  id: "audit_00000000-0000-4000-8000-000000000001",
  sessionId: SESSION_ID,
  status: "queued",
  createdAt: "2026-01-01T09:11:00.000Z",
};

function createAuditRequest(body: unknown) {
  return new Request("http://panel.test/api/audits", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  getSessionDetail.mockReset();
  createAuditJob.mockReset();
  getLatestAuditJobForSession.mockReset();
  getAuditJobsForSession.mockReset();
});

describe("POST /api/audits", () => {
  it("resolves the requested session, marks omitted pricing unavailable, and returns its queued id without waiting for analysis (E4-S1-AC2, E4-S1-AC4, E4-S1-AC5)", async () => {
    getSessionDetail.mockResolvedValue({ id: SESSION_ID });
    createAuditJob.mockResolvedValue(AUDIT_JOB);

    const response = await POST(createAuditRequest({ sessionId: SESSION_ID }));

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual(AUDIT_JOB);
    expect(getSessionDetail).toHaveBeenCalledWith(SESSION_ID);
    expect(createAuditJob).toHaveBeenCalledWith(SESSION_ID, undefined, {
      pricing: { available: false, pricing: null },
      rerun: false,
    });
  });

  it("forwards nonblank user-supplied pricing verbatim (E4-S1-AC4)", async () => {
    const pricing = "input tokens: $1.25 / million\noutput tokens: $5.00 / million";
    getSessionDetail.mockResolvedValue({ id: SESSION_ID });
    createAuditJob.mockResolvedValue(AUDIT_JOB);

    const response = await POST(createAuditRequest({ sessionId: SESSION_ID, pricing }));

    expect(response.status).toBe(201);
    expect(createAuditJob).toHaveBeenCalledWith(SESSION_ID, undefined, {
      pricing: { available: true, pricing },
      rerun: false,
    });
  });

  it("marks whitespace-only pricing unavailable (E4-S1-AC4)", async () => {
    getSessionDetail.mockResolvedValue({ id: SESSION_ID });
    createAuditJob.mockResolvedValue(AUDIT_JOB);

    const response = await POST(createAuditRequest({ sessionId: SESSION_ID, pricing: " \n\t " }));

    expect(response.status).toBe(201);
    expect(createAuditJob).toHaveBeenCalledWith(SESSION_ID, undefined, {
      pricing: { available: false, pricing: null },
      rerun: false,
    });
  });

  it("treats non-string pricing as unavailable without failing the request (E4-S1-AC4)", async () => {
    getSessionDetail.mockResolvedValue({ id: SESSION_ID });
    createAuditJob.mockResolvedValue(AUDIT_JOB);

    const response = await POST(createAuditRequest({ sessionId: SESSION_ID, pricing: { input: "$1.25" } }));

    expect(response.status).toBe(201);
    expect(createAuditJob).toHaveBeenCalledWith(SESSION_ID, undefined, {
      pricing: { available: false, pricing: null },
      rerun: false,
    });
  });

  it("rejects an unsafe session target before resolving or creating an audit (E4-S1-AC1)", async () => {
    const response = await POST(createAuditRequest({ sessionId: "../outside-session" }));

    expect(response.status).toBe(400);
    expect(getSessionDetail).not.toHaveBeenCalled();
    expect(createAuditJob).not.toHaveBeenCalled();
  });

  it("does not create an audit when the safe session cannot be resolved (E4-S1-AC1)", async () => {
    getSessionDetail.mockResolvedValue(null);

    const response = await POST(createAuditRequest({ sessionId: SESSION_ID }));

    expect(response.status).toBe(404);
    expect(createAuditJob).not.toHaveBeenCalled();
  });
});

describe("GET /api/audits", () => {
  it("returns failed and cancelled durable history with their reasons after a browser reload (E4-S6-AC4)", async () => {
    const failedAudit: AuditJob = {
      ...AUDIT_JOB,
      id: "audit_00000000-0000-4000-8000-000000000002",
      status: "failed",
      failureSummary: "the analyzer exited before writing a bundle",
    };
    const cancelledAudit: AuditJob & { reason: string } = {
      ...AUDIT_JOB,
      id: "audit_00000000-0000-4000-8000-000000000003",
      status: "cancelled",
      reason: "the user stopped the analyzer",
    };
    const history = [failedAudit, cancelledAudit];
    getLatestAuditJobForSession.mockResolvedValue(cancelledAudit);
    getAuditJobsForSession.mockResolvedValue(history);

    const response = await GET(new Request(`http://panel.test/api/audits?sessionId=${SESSION_ID}`));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(history);
    expect(getAuditJobsForSession).toHaveBeenCalledWith(SESSION_ID);
    expect(getLatestAuditJobForSession).not.toHaveBeenCalled();
  });
});