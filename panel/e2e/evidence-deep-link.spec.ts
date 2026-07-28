import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";

const sessionId = "e2e-session-evidence-deep-link";
const auditId = "e2e-audit-evidence-deep-link";
const evidenceId = "evidence-deep-link";
const agentId = "evidence-agent";
const eventId = `${agentId}:child-response`;
const projectPath = path.join(os.homedir(), ".omp", "agent", "sessions", "e2e-evidence-deep-link-project");
const sessionFilePath = path.join(projectPath, `${sessionId}.jsonl`);
const agentDirectoryPath = path.join(projectPath, sessionId);
const auditDirectoryPath = path.join(os.homedir(), ".omp", "forensics", "audits", auditId);

const mainTranscript = [
  JSON.stringify({ type: "title", title: "Evidence deep-link session", updatedAt: "2026-03-02T00:00:00.000Z" }),
  JSON.stringify({ type: "session", version: 3, id: sessionId, timestamp: "2026-03-02T00:00:00.000Z", cwd: "/work/evidence" }),
  JSON.stringify({
    type: "message",
    id: "spawn-evidence-agent",
    timestamp: "2026-03-02T00:01:00.000Z",
    message: {
      role: "toolResult",
      toolName: "task",
      content: [{ type: "text", text: "Spawned agent `evidence-agent`" }],
    },
  }),
].join("\n");

const agentTranscript = [
  JSON.stringify({ type: "session", version: 3, timestamp: "2026-03-02T00:02:00.000Z", cwd: "/work/evidence" }),
  JSON.stringify({
    type: "message",
    id: "child-response",
    timestamp: "2026-03-02T00:03:00.000Z",
    message: { role: "assistant", content: [{ type: "text", text: "Evidence child response" }] },
  }),
].join("\n");

const manifest = {
  schemaVersion: 1,
  auditId,
  status: "completed",
  target: { sessionId, transcriptPath: sessionFilePath },
  fingerprint: "sha256:evidence-deep-link",
  analyzer: { name: "kb-forensics", version: "1.0" },
  createdAt: "2026-03-02T00:04:00.000Z",
  startedAt: "2026-03-02T00:04:01.000Z",
  completedAt: "2026-03-02T00:04:02.000Z",
  artifacts: {
    manifest: "manifest.json",
    audit: "audit.json",
    report: "report.md",
    evidence: "evidence.jsonl",
  },
};

const audit = {
  schemaVersion: 1,
  auditId,
  coverageGaps: [],
  sessionTotals: { inputTokens: 1, outputTokens: 1, cost: null, currency: null },
  findings: [
    {
      id: "finding-evidence-deep-link",
      category: "evidence_navigation",
      title: "Evidence navigation finding",
      severity: "low",
      confidence: "high",
      summary: "The cited event can be reopened from its evidence record.",
      observedImpact: { inputTokens: 1, outputTokens: 1, cost: null },
      estimatedSavings: { cost: null },
      evidenceIds: [evidenceId],
      causalChain: [],
      limitations: [],
      proposalIds: [],
    },
  ],
  proposals: [],
  methodology: "Fixture audit for evidence navigation.",
};

const evidence = {
  id: evidenceId,
  sessionId,
  eventRef: eventId,
  agentId,
  timestamp: "2026-03-02T00:03:00.000Z",
  eventType: "message",
  measured: { inputTokens: 1 },
  explanation: "This response is the finding's cited evidence.",
  excerpt: "Evidence child response",
  sourceLocation: `${sessionFilePath}:2`,
};

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await Promise.all([fs.mkdir(agentDirectoryPath, { recursive: true }), fs.mkdir(auditDirectoryPath, { recursive: true })]);
  await Promise.all([
    fs.writeFile(sessionFilePath, mainTranscript, "utf8"),
    fs.writeFile(path.join(agentDirectoryPath, `${agentId}.jsonl`), agentTranscript, "utf8"),
    fs.writeFile(path.join(auditDirectoryPath, "manifest.json"), JSON.stringify(manifest), "utf8"),
    fs.writeFile(path.join(auditDirectoryPath, "audit.json"), JSON.stringify(audit), "utf8"),
    fs.writeFile(path.join(auditDirectoryPath, "report.md"), "# Fixture audit\n", "utf8"),
    fs.writeFile(path.join(auditDirectoryPath, "evidence.jsonl"), `${JSON.stringify(evidence)}\n`, "utf8"),
  ]);
});

test.afterAll(async () => {
  await Promise.all([
    fs.rm(projectPath, { recursive: true, force: true }),
    fs.rm(auditDirectoryPath, { recursive: true, force: true }),
  ]);
});

test("a resolved evidence link restores the cited session, agent, and event in a fresh browser context (E4-S9-AC1, E4-S9-AC2)", async ({
  browser,
  page,
}) => {
  await page.goto(`/api/audits/${auditId}/evidence?evidenceId=${evidenceId}`);

  const expectedUrl = new RegExp(`/sessions/${sessionId}\\?event=evidence-agent%3Achild-response&agent=evidence-agent$`);
  await expect(page).toHaveURL(expectedUrl);
  await expect(page.getByRole("button", { name: "Scope timeline to evidence-agent", pressed: true })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Selected event" })).toContainText("Evidence child response");

  const freshContext = await browser.newContext();
  try {
    const freshPage = await freshContext.newPage();
    await freshPage.goto(page.url());

    await expect(freshPage).toHaveURL(expectedUrl);
    await expect(freshPage.getByRole("button", { name: "Scope timeline to evidence-agent", pressed: true })).toBeVisible();
    await expect(freshPage.getByRole("complementary", { name: "Selected event" })).toContainText("Evidence child response");
  } finally {
    await freshContext.close();
  }
});
