// @vitest-environment node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isEventInTranscript, readEvidenceRecords, resolveEvidenceForFinding } from "./evidence";

const AUDIT_ID = "audit-1";
const SESSION_ID = "2026-07-22T10-15-00-aaaa1111";

function evidenceRecord(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    sessionId: SESSION_ID,
    eventRef: "main:m1",
    agentId: "main",
    timestamp: "2026-07-22T10:16:40Z",
    eventType: "tool_call",
    measured: { inputTokens: 100 },
    explanation: "Example evidence.",
    excerpt: "An excerpt.",
    sourceLocation: "session.jsonl:10",
    ...overrides,
  };
}

async function writeEvidenceFile(bundleDirectory: string, lines: unknown[]) {
  await fs.writeFile(path.join(bundleDirectory, "evidence.jsonl"), lines.map((line) => JSON.stringify(line)).join("\n"), "utf8");
}

function manifestFor(auditId: string, sessionId: string, status: "completed" | "failed" | "insufficient_signal" = "completed") {
  return {
    schemaVersion: 1,
    auditId,
    status,
    target: { sessionId, transcriptPath: `~/.omp/agent/sessions/proj/${sessionId}.jsonl` },
    fingerprint: "sha256:aaaa1111bbbb2222cccc3333dddd4444eeee5555ffff6666aaaa7777bbbb8888",
    analyzer: { name: "kb-forensics", version: "1.0" },
    createdAt: "2026-07-22T10:18:00Z",
    startedAt: "2026-07-22T10:18:02Z",
    completedAt: "2026-07-22T10:19:47Z",
    artifacts: { manifest: "manifest.json", audit: "audit.json", report: "report.md", evidence: "evidence.jsonl" },
  };
}

function auditReportFor(auditId: string, evidenceIds: string[]) {
  return {
    schemaVersion: 1,
    auditId,
    coverageGaps: [],
    sessionTotals: { inputTokens: 100, outputTokens: 10, cost: null, currency: null },
    findings: [
      {
        id: "finding-1",
        category: "large_tool_result",
        title: "Example finding",
        severity: "low",
        confidence: "medium",
        summary: "An example finding summary.",
        observedImpact: { inputTokens: 100, outputTokens: 0, cost: null },
        estimatedSavings: { inputTokens: { minimum: 1, likely: 2, maximum: 3 }, cost: null },
        evidenceIds,
        causalChain: [],
        limitations: [],
        proposalIds: [],
      },
    ],
    proposals: [],
    methodology: "Example methodology.",
  };
}

async function writeBundle(
  bundleDirectory: string,
  options: { auditId: string; sessionId: string; evidenceIds: string[]; evidenceLines: unknown[] },
) {
  await fs.writeFile(
    path.join(bundleDirectory, "manifest.json"),
    JSON.stringify(manifestFor(options.auditId, options.sessionId)),
    "utf8",
  );
  await fs.writeFile(
    path.join(bundleDirectory, "audit.json"),
    JSON.stringify(auditReportFor(options.auditId, options.evidenceIds)),
    "utf8",
  );
  await writeEvidenceFile(bundleDirectory, options.evidenceLines);
}

async function writeSession(sessionsRoot: string, sessionId: string, eventLines: string[]) {
  const projectDirectory = path.join(sessionsRoot, "omp-kanban");
  await fs.mkdir(projectDirectory, { recursive: true });
  await fs.writeFile(path.join(projectDirectory, `${sessionId}.jsonl`), eventLines.join("\n"), "utf8");
}

function userMessageLine(id: string, timestamp: string, text: string): string {
  return JSON.stringify({
    type: "message",
    id,
    parentId: null,
    timestamp,
    message: { role: "user", content: [{ type: "text", text }] },
  });
}

describe("readEvidenceRecords", () => {
  let bundleDirectory: string;

  beforeEach(async () => {
    bundleDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "omp-evidence-records-"));
  });

  afterEach(async () => {
    await fs.rm(bundleDirectory, { recursive: true, force: true });
  });

  it("returns only the requested evidence records, not every record in the file (E4-S9-AC4)", async () => {
    await writeEvidenceFile(bundleDirectory, [evidenceRecord("evidence-1"), evidenceRecord("evidence-2"), evidenceRecord("evidence-3")]);

    const records = await readEvidenceRecords(bundleDirectory, new Set(["evidence-2"]));

    expect(records.map((record) => record.id)).toEqual(["evidence-2"]);
  });

  it("still returns the requested record when an unrequested line elsewhere in a large file is malformed (E4-S9-AC4)", async () => {
    const content = [
      JSON.stringify(evidenceRecord("evidence-1")),
      "{ this is not valid JSON and belongs to evidence-2 }",
      JSON.stringify(evidenceRecord("evidence-3")),
    ].join("\n");
    await fs.writeFile(path.join(bundleDirectory, "evidence.jsonl"), content, "utf8");

    const records = await readEvidenceRecords(bundleDirectory, new Set(["evidence-1"]));

    expect(records.map((record) => record.id)).toEqual(["evidence-1"]);
  });

  it("returns every record sharing a requested id, so a caller can detect a duplicate", async () => {
    await writeEvidenceFile(bundleDirectory, [
      evidenceRecord("evidence-1", { eventRef: "main:m1" }),
      evidenceRecord("evidence-1", { eventRef: "main:m2" }),
    ]);

    const records = await readEvidenceRecords(bundleDirectory, new Set(["evidence-1"]));

    expect(records).toHaveLength(2);
  });

  it("returns nothing for an id that names no record in the file", async () => {
    await writeEvidenceFile(bundleDirectory, [evidenceRecord("evidence-1")]);

    const records = await readEvidenceRecords(bundleDirectory, new Set(["evidence-missing"]));

    expect(records).toEqual([]);
  });
});

describe("isEventInTranscript", () => {
  let sessionsRoot: string;

  beforeEach(async () => {
    sessionsRoot = await fs.mkdtemp(path.join(os.tmpdir(), "omp-evidence-sessions-"));
    await writeSession(sessionsRoot, SESSION_ID, [userMessageLine("m1", "2026-07-22T10:16:00.000Z", "Go.")]);
  });

  afterEach(async () => {
    await fs.rm(sessionsRoot, { recursive: true, force: true });
  });

  it("reports true when the referenced event is still present in the transcript (E4-S9-AC3)", async () => {
    await expect(isEventInTranscript(SESSION_ID, "main:m1", sessionsRoot)).resolves.toBe(true);
  });

  it("reports false when the referenced event is no longer present in the transcript (E4-S9-AC3)", async () => {
    await expect(isEventInTranscript(SESSION_ID, "main:gone", sessionsRoot)).resolves.toBe(false);
  });

  it("reports null, not false, when the session itself cannot be found", async () => {
    await expect(isEventInTranscript("does-not-exist", "main:m1", sessionsRoot)).resolves.toBeNull();
  });

  it("reports null, not false, when the sessions root itself is unreachable", async () => {
    await expect(isEventInTranscript(SESSION_ID, "main:m1", path.join(sessionsRoot, "missing-root"))).resolves.toBeNull();
  });
});

describe("resolveEvidenceForFinding", () => {
  let bundleDirectory: string;
  let sessionsRoot: string;

  beforeEach(async () => {
    bundleDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "omp-evidence-bundle-"));
    sessionsRoot = await fs.mkdtemp(path.join(os.tmpdir(), "omp-evidence-sessions-"));
  });

  afterEach(async () => {
    await fs.rm(bundleDirectory, { recursive: true, force: true });
    await fs.rm(sessionsRoot, { recursive: true, force: true });
  });

  it("resolves a cited evidence record whose event is present in the transcript", async () => {
    await writeBundle(bundleDirectory, {
      auditId: AUDIT_ID,
      sessionId: SESSION_ID,
      evidenceIds: ["evidence-1"],
      evidenceLines: [evidenceRecord("evidence-1", { eventRef: "main:m1" })],
    });
    await writeSession(sessionsRoot, SESSION_ID, [userMessageLine("m1", "2026-07-22T10:16:00.000Z", "Go.")]);

    const result = await resolveEvidenceForFinding({ bundleDirectory, auditId: AUDIT_ID, evidenceId: "evidence-1", sessionsRoot });

    expect(result.status).toBe("resolved");
    expect(result.status === "resolved" && result.evidence.id).toBe("evidence-1");
  });

  it("reports the referenced event as missing while still identifying the evidence, so the finding stays readable (E4-S9-AC3)", async () => {
    await writeBundle(bundleDirectory, {
      auditId: AUDIT_ID,
      sessionId: SESSION_ID,
      evidenceIds: ["evidence-1"],
      evidenceLines: [evidenceRecord("evidence-1", { eventRef: "main:gone" })],
    });
    await writeSession(sessionsRoot, SESSION_ID, [userMessageLine("m1", "2026-07-22T10:16:00.000Z", "Go.")]);

    const result = await resolveEvidenceForFinding({ bundleDirectory, auditId: AUDIT_ID, evidenceId: "evidence-1", sessionsRoot });

    expect(result.status).toBe("event-missing");
    expect(result.status === "event-missing" && result.evidence.id).toBe("evidence-1");
  });

  it("treats an unreadable session as resolvable rather than reporting a false missing event", async () => {
    await writeBundle(bundleDirectory, {
      auditId: AUDIT_ID,
      sessionId: SESSION_ID,
      evidenceIds: ["evidence-1"],
      evidenceLines: [evidenceRecord("evidence-1", { eventRef: "main:m1" })],
    });
    // No session file is ever written under sessionsRoot for SESSION_ID.

    const result = await resolveEvidenceForFinding({ bundleDirectory, auditId: AUDIT_ID, evidenceId: "evidence-1", sessionsRoot });

    expect(result.status).toBe("resolved");
  });

  it("reports not-found for an evidence record no finding cites", async () => {
    await writeBundle(bundleDirectory, {
      auditId: AUDIT_ID,
      sessionId: SESSION_ID,
      evidenceIds: ["evidence-1"],
      evidenceLines: [evidenceRecord("evidence-1"), evidenceRecord("evidence-uncited")],
    });

    const result = await resolveEvidenceForFinding({ bundleDirectory, auditId: AUDIT_ID, evidenceId: "evidence-uncited", sessionsRoot });

    expect(result.status).toBe("not-found");
  });

  it("reports not-found when the evidence targets a session outside the audit's target", async () => {
    await writeBundle(bundleDirectory, {
      auditId: AUDIT_ID,
      sessionId: SESSION_ID,
      evidenceIds: ["evidence-1"],
      evidenceLines: [evidenceRecord("evidence-1", { sessionId: "unrelated-session" })],
    });

    const result = await resolveEvidenceForFinding({ bundleDirectory, auditId: AUDIT_ID, evidenceId: "evidence-1", sessionsRoot });

    expect(result.status).toBe("not-found");
  });

  it("reports not-found when duplicate evidence records share the requested id", async () => {
    await writeBundle(bundleDirectory, {
      auditId: AUDIT_ID,
      sessionId: SESSION_ID,
      evidenceIds: ["evidence-1"],
      evidenceLines: [evidenceRecord("evidence-1", { eventRef: "main:m1" }), evidenceRecord("evidence-1", { eventRef: "main:m2" })],
    });

    const result = await resolveEvidenceForFinding({ bundleDirectory, auditId: AUDIT_ID, evidenceId: "evidence-1", sessionsRoot });

    expect(result.status).toBe("not-found");
  });

  it("only loads the one evidence record a finding references, even when another line in a large file is malformed (E4-S9-AC4)", async () => {
    await fs.writeFile(
      path.join(bundleDirectory, "manifest.json"),
      JSON.stringify(manifestFor(AUDIT_ID, SESSION_ID)),
      "utf8",
    );
    await fs.writeFile(
      path.join(bundleDirectory, "audit.json"),
      JSON.stringify(auditReportFor(AUDIT_ID, ["evidence-1"])),
      "utf8",
    );
    const content = [
      JSON.stringify(evidenceRecord("evidence-1", { eventRef: "main:m1" })),
      "{ this is not valid JSON and belongs to evidence-999 }",
    ].join("\n");
    await fs.writeFile(path.join(bundleDirectory, "evidence.jsonl"), content, "utf8");
    await writeSession(sessionsRoot, SESSION_ID, [userMessageLine("m1", "2026-07-22T10:16:00.000Z", "Go.")]);

    const result = await resolveEvidenceForFinding({ bundleDirectory, auditId: AUDIT_ID, evidenceId: "evidence-1", sessionsRoot });

    expect(result.status).toBe("resolved");
  });
});
