// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

const { dispatchQueuedAudit } = vi.hoisted(() => ({ dispatchQueuedAudit: vi.fn() }));

vi.mock("./dispatch", () => ({ dispatchQueuedAudit }));

import { createAuditJob, getLatestAuditJobForSession } from "./job-store";

const SESSION_ID = "2026-07-28T16-10-00-000Z_00000000-0000-7000-8000-000000000053";

afterEach(() => {
  dispatchQueuedAudit.mockReset();
});

describe("startup audit recovery", () => {
  it("keeps a dispatched audit running for its session after a browser reload (E4-S7-AC1)", async () => {
    dispatchQueuedAudit.mockResolvedValue({ once: vi.fn() });

    const created = await createAuditJob(SESSION_ID);

    await vi.waitFor(async () => {
      await expect(getLatestAuditJobForSession(SESSION_ID)).resolves.toMatchObject({
        id: created.id,
        status: "running",
      });
    });
  });
});
