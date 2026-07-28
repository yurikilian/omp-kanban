import { describe, expect, it } from "vitest";
import { createAuditJob, getLatestAuditJobForSession } from "./job-store";

describe("audit job store", () => {
  it("keeps a queued audit available for its session after the caller returns (E4-S1-AC2, E4-S1-AC3)", async () => {
    const sessionId = "2026-01-01T09-00-00-000Z_00000000-0000-7000-8000-00000000000a";

    const created = await createAuditJob(sessionId);

    expect(created).toMatchObject({ sessionId, status: "queued" });
    expect(created.id).toMatch(/^audit_/);
    expect(await getLatestAuditJobForSession(sessionId)).toEqual(created);
  });
});