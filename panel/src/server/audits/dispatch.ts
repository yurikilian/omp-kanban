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

const runningAuditChildren = new Map<string, ChildProcess>();

/**
 * Registers the child process currently doing an audit's analysis, so
 * `cancel.ts` can find and stop it by audit id (E4-S6-AC6). Cleared
 * automatically once the child exits, whatever the reason - a stale entry
 * would hand a caller an already-dead process to "cancel". Exported as the
 * module boundary between dispatch's process bookkeeping and every reader
 * of it, rather than exposing the map itself.
 */
export function registerRunningAuditChild(auditId: string, child: ChildProcess): void {
  runningAuditChildren.set(auditId, child);
  child.once("exit", () => {
    if (runningAuditChildren.get(auditId) === child) runningAuditChildren.delete(auditId);
  });
}

/** The audit's currently running analyzer child, if any (E4-S6-AC6). */
export function getRunningAuditChild(auditId: string): ChildProcess | undefined {
  return runningAuditChildren.get(auditId);
}

export function dispatchAudit(input: AnalyzerCommandInput): ChildProcess {
  const analyzer = buildAnalyzerCommand(input);
  const child = spawn(analyzer.command, analyzer.args, { stdio: ["ignore", "ignore", "pipe"] });

  registerRunningAuditChild(input.auditId, child);

  return child;
}
export function getAuditBundleDirectory(auditId: string): string {
  return path.join(os.homedir(), ".omp", "forensics", "audits", auditId);
}


export async function dispatchQueuedAudit(
  input: QueuedAuditDispatchInput,
): Promise<ChildProcess | null> {
  const targetTranscript = await findSessionTranscript(input.sessionId);
  if (!targetTranscript) return null;

  const bundleDirectory = getAuditBundleDirectory(input.auditId);
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