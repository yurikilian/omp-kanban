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
  await Promise.all([
    fs.writeFile(
      path.join(bundleDirectory, "manifest.json"),
      JSON.stringify({ auditId, parentPid: process.ppid, receivedArgs, status: "completed", targetTranscript }),
    ),
    fs.writeFile(path.join(bundleDirectory, "audit.json"), JSON.stringify({ auditId })),
    fs.writeFile(path.join(bundleDirectory, "report.md"), "# Test audit\n"),
    fs.writeFile(path.join(bundleDirectory, "evidence.jsonl"), "{}\n"),
  ]);
}