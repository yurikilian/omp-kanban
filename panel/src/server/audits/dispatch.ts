import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  buildAnalyzerCommand,
  type AnalyzerCommandInput,
  type AuditPricing,
} from "./analyzer-command";

export interface QueuedAuditDispatchInput {
  auditId: string;
  sessionId: string;
  pricing: AuditPricing;
}

function isNotFound(error: unknown): error is NodeJS.ErrnoException {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

async function findSessionTranscript(sessionId: string): Promise<string | null> {
  const sessionsRoot = path.join(os.homedir(), ".omp", "agent", "sessions");

  try {
    const projects = (await fs.readdir(sessionsRoot, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
      .sort((left, right) => left.name.localeCompare(right.name));

    for (const project of projects) {
      const transcript = path.join(sessionsRoot, project.name, `${sessionId}.jsonl`);

      try {
        if ((await fs.lstat(transcript)).isFile()) return transcript;
      } catch (error) {
        if (!isNotFound(error)) throw error;
      }
    }
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }

  return null;
}

function waitForChildToSpawn(child: ChildProcess): Promise<void> {
  const { promise, reject, resolve } = Promise.withResolvers<void>();
  child.once("error", reject);
  child.once("spawn", resolve);
  return promise;
}

export function dispatchAudit(input: AnalyzerCommandInput): ChildProcess {
  const analyzer = buildAnalyzerCommand(input);

  return spawn(analyzer.command, analyzer.args, { stdio: "ignore" });
}

export async function dispatchQueuedAudit(
  input: QueuedAuditDispatchInput,
): Promise<ChildProcess | null> {
  const targetTranscript = await findSessionTranscript(input.sessionId);
  if (!targetTranscript) return null;

  const bundleDirectory = path.join(
    os.homedir(),
    ".omp",
    "forensics",
    "audits",
    input.auditId,
  );
  await fs.mkdir(bundleDirectory, { recursive: true });

  const child = dispatchAudit({
    auditId: input.auditId,
    bundleDirectory,
    pricing: input.pricing,
    targetTranscript,
  });
  await waitForChildToSpawn(child);

  return child;
}