import { describe, expect, it, vi } from "vitest";
import {
  createAuditJob,
  getAuditJobByFingerprint,
  getAuditJobById,
} from "./job-store";
import { fingerprintAuditTarget } from "./fingerprint";

const analyzerVersion = "audit-analyzer@1.0.0";
const transcript = '{"type":"session","id":"session-a"}\n{"type":"message","text":"Review me"}\n';

describe("audit target fingerprints", () => {
  it("offers an existing audit for an unchanged transcript and analyzer version without creating another job (E4-S2-AC1)", async () => {
    const sessionId = "fingerprint-unchanged-session";
    const targetContent = `${transcript}${sessionId}`;
    const fingerprint = fingerprintAuditTarget(targetContent, analyzerVersion);
    expect(fingerprint).toMatch(/^[a-f0-9]{64}$/);

    const created = await createAuditJob(sessionId, { targetContent, analyzerVersion });
    const offered = await createAuditJob(sessionId, { targetContent, analyzerVersion });

    expect(offered).toEqual(created);
    expect(await getAuditJobByFingerprint(fingerprint)).toEqual(created);
  });

  it("gives a changed transcript a different fingerprint and a separately dispatchable job (E4-S2-AC3)", async () => {
    const sessionId = "fingerprint-changed-session";
    const targetContent = `${transcript}${sessionId}`;
    const changedTargetContent = targetContent.replace("Review me", "Review me again");
    const original = await createAuditJob(sessionId, { targetContent, analyzerVersion });
    const changed = await createAuditJob(sessionId, { targetContent: changedTargetContent, analyzerVersion });

    expect(fingerprintAuditTarget(changedTargetContent, analyzerVersion)).not.toBe(
      fingerprintAuditTarget(targetContent, analyzerVersion),
    );
    expect(fingerprintAuditTarget(targetContent, "audit-analyzer@1.0.1")).not.toBe(
      fingerprintAuditTarget(targetContent, analyzerVersion),
    );
    expect(changed.id).not.toBe(original.id);
  });

  it("keeps audits for one session distinguishable by their ids (E4-S2-AC3)", async () => {
    const sessionId = "fingerprint-distinguishable-session";
    const targetContent = `${transcript}${sessionId}`;
    const first = await createAuditJob(sessionId, { targetContent, analyzerVersion });
    const second = await createAuditJob(sessionId, {
      targetContent: targetContent.replace("Review me", "Review the changed target"),
      analyzerVersion,
    });

    expect(first.id).not.toBe(second.id);
    expect(await getAuditJobById(first.id)).toEqual(first);
    expect(await getAuditJobById(second.id)).toEqual(second);
  });

  it("produces the same fingerprint after a runtime restart (E4-S2-AC5)", async () => {
    const beforeRestartFingerprint = fingerprintAuditTarget(transcript, analyzerVersion);

    vi.resetModules();
    // Module cache reset is the runtime-restart boundary this test verifies.
    const { fingerprintAuditTarget: afterRestartFingerprint } = await import("./fingerprint");

    expect(afterRestartFingerprint(transcript, analyzerVersion)).toBe(beforeRestartFingerprint);
  });
});