import { afterEach, describe, expect, it, vi } from "vitest";
import { buildAnalyzerCommand } from "./analyzer-command";

const { dispatchQueuedAudit } = vi.hoisted(() => ({ dispatchQueuedAudit: vi.fn() }));

vi.mock("./dispatch", () => ({ dispatchQueuedAudit }));

import { createAuditJob } from "./job-store";

const AUDIT = {
  auditId: "audit_00000000-0000-4000-8000-000000000001",
  targetTranscript: "/tmp/target-session.jsonl",
  bundleDirectory: "/tmp/audits/audit_00000000-0000-4000-8000-000000000001",
};

const SESSION_ID = "2026-01-01T09-00-00-000Z_00000000-0000-7000-8000-00000000000a";

afterEach(() => {
  dispatchQueuedAudit.mockReset();
});

describe("audit analyzer command", () => {
  it("builds an OMP one-shot prompt with the skill, transcript, audit id and bundle directory (E4-S3-AC1)", () => {
    const command = buildAnalyzerCommand(AUDIT);

    expect(command.command).toBe("omp");
    expect(command.args[0]).toBe("-p");
    expect(command.args[1]).toContain("cost-forensics");
    expect(command.args[1]).toContain(AUDIT.targetTranscript);
    expect(command.args[1]).toContain(AUDIT.auditId);
    expect(command.args[1]).toContain(AUDIT.bundleDirectory);
  });

  it("uses token-only reporting and prohibits recalled pricing when pricing is unavailable (E4-S3-AC2)", () => {
    const command = buildAnalyzerCommand({
      ...AUDIT,
      pricing: { available: false, pricing: null },
    });

    expect(command.args[1]).toContain("token-only");
    expect(command.args[1]).toContain("Do not recall prices from model memory.");
  });

  it("carries user-supplied pricing verbatim into the prompt (E4-S3-AC2)", () => {
    const suppliedPricing = "input tokens: $1.25 / million\noutput tokens: $5.00 / million";
    const command = buildAnalyzerCommand({
      ...AUDIT,
      pricing: { available: true, pricing: suppliedPricing },
    });

    expect(command.args[1]).toContain(suppliedPricing);
    expect(command.args[1]).not.toContain("Pricing is unavailable.");
  });
});

describe("audit job dispatch", () => {
  it("returns the queued job before asynchronously starting its analyzer dispatch (E4-S3-AC1)", async () => {
    const { promise: dispatchNeverSettles } = Promise.withResolvers<void>();
    dispatchQueuedAudit.mockReturnValue(dispatchNeverSettles);

    const job = await createAuditJob(SESSION_ID);

    expect(job.status).toBe("queued");
    await vi.waitFor(
      () =>
        expect(dispatchQueuedAudit).toHaveBeenCalledWith({
          auditId: job.id,
          pricing: { available: false, pricing: null },
          sessionId: SESSION_ID,
        }),
      { interval: 10, timeout: 100 },
    );
  });
});