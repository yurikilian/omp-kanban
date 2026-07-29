#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

const receivedArgs = process.argv.slice(2);
const printFlagIndex = receivedArgs.indexOf("-p");
const prompt = printFlagIndex === -1 ? null : receivedArgs[printFlagIndex + 1];

if (!prompt) process.exitCode = 1;
else {
  const field = (label) => {
    const line = prompt.split("\n").find((candidate) => candidate.startsWith(`${label}: `));
    if (!line) throw new Error(`Missing ${label}`);
    return line.slice(label.length + 2);
  };
  const auditId = field("Audit ID");
  const targetTranscript = field("Target session transcript");
  const bundleDirectory = field("Output bundle directory");

  await fs.mkdir(bundleDirectory, { recursive: true });
  await fs.writeFile(
    path.join(bundleDirectory, "manifest.json"),
    JSON.stringify({
      schemaVersion: 1,
      auditId,
      status: "completed",
      target: { sessionId: "partial-bundle-session", transcriptPath: targetTranscript },
      fingerprint: "partial-bundle-fingerprint",
      analyzer: { name: "kb-forensics", version: "test" },
      createdAt: "2026-07-29T00:00:00.000Z",
      startedAt: "2026-07-29T00:00:00.000Z",
      completedAt: "2026-07-29T00:00:00.000Z",
      artifacts: {
        manifest: "manifest.json",
        audit: "audit.json",
        report: "report.md",
        evidence: "evidence.jsonl",
      },
    }),
  );
  await fs.writeFile(
    path.join(bundleDirectory, "audit.json"),
    JSON.stringify({
      schemaVersion: 1,
      auditId,
      coverageGaps: [],
      sessionTotals: { inputTokens: null, outputTokens: null, cost: null, currency: null },
      findings: [],
      proposals: [],
      methodology: "partial bundle test",
    }),
  );
  await fs.writeFile(path.join(bundleDirectory, ".partial-bundle-started"), "started\n");
  setInterval(() => {}, 1_000);
}
