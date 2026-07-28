// @vitest-environment node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = path.resolve(dirname, "../../../../../../tests/fixtures/audits");
const auditId = "bundle-valid";
const sessionId = "2026-07-22T10-15-00-aaaa1111";
let homeDirectory: string;
let evidenceFilePath: string;

async function copyAuditFixture() {
  await fs.cp(path.join(fixtureRoot, auditId), path.join(homeDirectory, ".omp", "forensics", "audits", auditId), {
    recursive: true,
  });
}

function resolveEvidence(evidenceId: string) {
  return GET(new Request(`http://panel.test/api/audits/${auditId}/evidence?evidenceId=${encodeURIComponent(evidenceId)}`), {
    params: Promise.resolve({ auditId }),
  });
}

beforeEach(async () => {
  homeDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "omp-audit-evidence-route-"));
  evidenceFilePath = path.join(homeDirectory, ".omp", "forensics", "audits", auditId, "evidence.jsonl");
  vi.spyOn(os, "homedir").mockReturnValue(homeDirectory);
  await copyAuditFixture();
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(homeDirectory, { recursive: true, force: true });
});

describe("GET /api/audits/[auditId]/evidence", () => {
  it("redirects cited evidence to its target session, agent, and event (E4-S9-AC1)", async () => {
    const response = await resolveEvidence("evidence-1");

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      `http://panel.test/sessions/${sessionId}?event=msg_0007%23tool_call_2&agent=main`,
    );
  });

  it("does not resolve a valid but uncited evidence record (E4-S9-AC1)", async () => {
    const uncitedEvidence = {
      id: "evidence-unrelated",
      sessionId,
      eventRef: "main:unrelated-event",
      agentId: "main",
      timestamp: "2026-07-22T10:16:41Z",
      eventType: "message",
      measured: { inputTokens: 1 },
      explanation: "This record is not cited by a finding.",
      excerpt: "Unrelated evidence.",
      sourceLocation: "session.jsonl:72",
    };
    await fs.appendFile(evidenceFilePath, `${JSON.stringify(uncitedEvidence)}\n`, "utf8");

    const response = await resolveEvidence(uncitedEvidence.id);

    expect(response.status).toBe(404);
  });

  it("does not redirect cited evidence to a session outside the audit target (E4-S9-AC1)", async () => {
    const evidence = JSON.parse(await fs.readFile(evidenceFilePath, "utf8")) as Record<string, unknown>;
    await fs.writeFile(evidenceFilePath, `${JSON.stringify({ ...evidence, sessionId: "unrelated-session" })}\n`, "utf8");

    const response = await resolveEvidence("evidence-1");

    expect(response.status).toBe(404);
  });
});
