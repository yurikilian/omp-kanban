import { type ChildProcess } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import type { AuditJob } from "./types";

export const MAX_STDERR_SUMMARY_BYTES = 4_096;

export interface ReconcileAuditInput {
  child: ChildProcess;
  bundleDirectory: string;
}

type ReconciledAudit = Pick<AuditJob, "status" | "exitStatus" | "stderrSummary">;

function readStderrSummary(child: ChildProcess): Promise<string> {
  const stderr = child.stderr;
  if (!stderr || stderr.readableEnded) return Promise.resolve("");

  const { promise, resolve } = Promise.withResolvers<string>();
  const chunks: Buffer[] = [];
  let remainingBytes = MAX_STDERR_SUMMARY_BYTES;

  stderr.on("data", (chunk: Buffer | string) => {
    if (remainingBytes === 0) return;

    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    const retained = bytes.subarray(0, remainingBytes);
    chunks.push(retained);
    remainingBytes -= retained.length;
  });
  stderr.once("end", () => resolve(Buffer.concat(chunks).toString("utf8")));

  return promise;
}

function waitForChildToClose(child: ChildProcess): Promise<number | null> {
  const { promise, resolve } = Promise.withResolvers<number | null>();

  child.once("close", (exitStatus) => resolve(exitStatus));
  if (typeof child.exitCode === "number" || child.signalCode !== null) resolve(child.exitCode);

  return promise;
}

async function hasManifest(bundleDirectory: string): Promise<boolean> {
  try {
    return (await fs.lstat(path.join(bundleDirectory, "manifest.json"))).isFile();
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

export async function reconcileAudit({ child, bundleDirectory }: ReconcileAuditInput): Promise<ReconciledAudit> {
  const stderrSummary = readStderrSummary(child);
  const exitStatus = await waitForChildToClose(child);
  const [summary, manifestExists] = await Promise.all([stderrSummary, hasManifest(bundleDirectory)]);

  if (exitStatus === 0 && manifestExists) return { status: "completed" };

  return { exitStatus, status: "failed", stderrSummary: summary };
}