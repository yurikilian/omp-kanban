import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";

const sessionId = "e2e-session-evidence-lazy-load";
const auditId = "e2e-audit-evidence-lazy-load";
const evidenceId = "evidence-lazy-load";
const agentId = "lazy-evidence-agent";
const eventId = `${agentId}:child-response`;
const runtimePort = 4175;
const runtimeUrl = `http://127.0.0.1:${runtimePort}`;
const fixtureHome = path.join(os.tmpdir(), `omp-panel-evidence-lazy-load-${process.pid}`);
const projectPath = path.join(fixtureHome, ".omp", "agent", "sessions", "e2e-evidence-lazy-load-project");
const sessionFilePath = path.join(projectPath, `${sessionId}.jsonl`);
const agentDirectoryPath = path.join(projectPath, sessionId);
const auditsRoot = path.join(fixtureHome, ".omp", "forensics", "audits");
const auditDirectoryPath = path.join(auditsRoot, auditId);

const mainTranscript = [
  JSON.stringify({ type: "title", title: "Lazy evidence session", updatedAt: "2026-03-03T00:00:00.000Z" }),
  JSON.stringify({ type: "session", version: 3, id: sessionId, timestamp: "2026-03-03T00:00:00.000Z", cwd: "/work/evidence" }),
  JSON.stringify({
    type: "message",
    id: "spawn-lazy-evidence-agent",
    timestamp: "2026-03-03T00:01:00.000Z",
    message: {
      role: "toolResult",
      toolName: "task",
      content: [{ type: "text", text: "Spawned agent `lazy-evidence-agent`" }],
    },
  }),
].join("\n");

const agentTranscript = [
  JSON.stringify({ type: "session", version: 3, timestamp: "2026-03-03T00:02:00.000Z", cwd: "/work/evidence" }),
  JSON.stringify({
    type: "message",
    id: "child-response",
    timestamp: "2026-03-03T00:03:00.000Z",
    message: { role: "assistant", content: [{ type: "text", text: "Lazy evidence child response" }] },
  }),
].join("\n");

const manifest = {
  schemaVersion: 1,
  auditId,
  status: "completed",
  target: { sessionId, transcriptPath: sessionFilePath },
  fingerprint: "sha256:evidence-lazy-load",
  analyzer: { name: "kb-forensics", version: "1.0" },
  createdAt: "2026-03-03T00:04:00.000Z",
  startedAt: "2026-03-03T00:04:01.000Z",
  completedAt: "2026-03-03T00:04:02.000Z",
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
      id: "finding-evidence-lazy-load",
      category: "evidence_navigation",
      title: "Lazy evidence navigation finding",
      severity: "low",
      confidence: "high",
      summary: "The cited event is loaded only after the user opens this link.",
      observedImpact: { inputTokens: 1, outputTokens: 1, cost: null },
      estimatedSavings: { cost: null },
      evidenceIds: [evidenceId],
      causalChain: [],
      limitations: [],
      proposalIds: [],
    },
  ],
  proposals: [],
  methodology: "Fixture audit for lazy evidence loading.",
};

const citedEvidence = {
  id: evidenceId,
  sessionId,
  eventRef: eventId,
  agentId,
  timestamp: "2026-03-03T00:03:00.000Z",
  eventType: "message",
  measured: { inputTokens: 1 },
  explanation: "This response is the finding's cited evidence.",
  excerpt: "Lazy evidence child response",
  sourceLocation: `${sessionFilePath}:2`,
};

// A completed job record is available before the runtime starts. The bundle
// appears afterward with one cited record followed by a large malformed tail:
// page render must not parse that tail, while the targeted resolver can ignore
// it because no later line names the cited id.
const largeMalformedEvidenceTail = `${"not-json".repeat(256)}\n`.repeat(1_024);

let runtime: ChildProcess | undefined;

test.describe.configure({ mode: "serial" });
test.setTimeout(30_000);

test.beforeAll(async () => {
  await fs.rm(fixtureHome, { recursive: true, force: true });
  await Promise.all([
    fs.mkdir(agentDirectoryPath, { recursive: true }),
    fs.mkdir(auditsRoot, { recursive: true }),
  ]);
  await Promise.all([
    fs.writeFile(sessionFilePath, mainTranscript, "utf8"),
    fs.writeFile(path.join(agentDirectoryPath, `${agentId}.jsonl`), agentTranscript, "utf8"),
    fs.writeFile(
      path.join(auditsRoot, ".omp-panel-audit-jobs.json"),
      JSON.stringify([
        {
          id: auditId,
          sessionId,
          status: "completed",
          createdAt: manifest.createdAt,
          findings: audit.findings,
          fingerprint: manifest.fingerprint,
        },
      ]),
      "utf8",
    ),
  ]);

  runtime = spawn(process.execPath, ["runtime/start.mjs"], {
    cwd: path.resolve(__dirname, ".."),
    env: { ...process.env, HOME: fixtureHome, PORT: String(runtimePort) },
    stdio: "ignore",
  });

  await expect
    .poll(
      async () => {
        try {
          return (await fetch(`${runtimeUrl}/internal/health`)).status;
        } catch {
          return 0;
        }
      },
      { timeout: 15_000 },
    )
    .toBe(200);

  await fs.mkdir(auditDirectoryPath, { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(auditDirectoryPath, "manifest.json"), JSON.stringify(manifest), "utf8"),
    fs.writeFile(path.join(auditDirectoryPath, "audit.json"), JSON.stringify(audit), "utf8"),
    fs.writeFile(path.join(auditDirectoryPath, "report.md"), "# Fixture audit\n", "utf8"),
    fs.writeFile(path.join(auditDirectoryPath, "evidence.jsonl"), `${JSON.stringify(citedEvidence)}\n${largeMalformedEvidenceTail}`, "utf8"),
  ]);
});

test.afterAll(async () => {
  if (runtime?.exitCode === null) {
    runtime.kill("SIGTERM");
    await once(runtime, "exit");
  }
  await fs.rm(fixtureHome, { recursive: true, force: true });
});

test("a large evidence page visit stays lazy until its rendered finding link is opened (E4-S9-AC4)", async ({ page }) => {
  const evidenceHref = `/api/audits/${auditId}/evidence?evidenceId=${evidenceId}`;
  const evidenceRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === `/api/audits/${auditId}/evidence`) {
      evidenceRequests.push(request.url());
    }
  });

  await page.goto(`${runtimeUrl}/sessions/${sessionId}`);

  const evidenceLink = page.getByRole("link", { name: `Open evidence ${evidenceId}` });
  await expect(evidenceLink).toBeVisible();
  await expect(evidenceLink).toHaveAttribute("href", evidenceHref);
  expect(evidenceRequests).toEqual([]);

  await evidenceLink.click();

  const expectedUrl = new RegExp(`/sessions/${sessionId}\\?event=${agentId}%3Achild-response&agent=${agentId}$`);
  await expect(page).toHaveURL(expectedUrl);
  await expect(page.getByRole("complementary", { name: "Selected event" })).toContainText("Lazy evidence child response");
  expect(evidenceRequests).toEqual([`${runtimeUrl}${evidenceHref}`]);
});
