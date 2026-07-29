"use server";

import type { ChildProcess } from "node:child_process";
import { getRunningAuditChild } from "./dispatch";
import { cancelAuditJob } from "./job-store";

export type CancelAuditResult =
  | { ok: true; auditId: string; status: "cancelled"; reason: string; cancelledAt: string }
  | { ok: false; auditId: string; reason: string };

const DEFAULT_CANCELLATION_REASON = "the user stopped the analyzer";

/** How long to wait for a graceful SIGTERM exit before escalating to SIGKILL. */
const GRACEFUL_EXIT_TIMEOUT_MS = 3000;


function hasExited(child: ChildProcess): boolean {
  return child.exitCode !== null || child.signalCode !== null;
}

async function terminate(child: ChildProcess): Promise<void> {
  if (hasExited(child)) return;

  const { promise, resolve } = Promise.withResolvers<void>();
  child.once("exit", () => resolve());
  child.kill("SIGTERM");

  const timeout = setTimeout(() => {
    if (!hasExited(child)) child.kill("SIGKILL");
  }, GRACEFUL_EXIT_TIMEOUT_MS);

  try {
    await promise;
  } finally {
    clearTimeout(timeout);
  }
}

export async function cancelAudit(auditId: string, reason?: string): Promise<CancelAuditResult> {
  const child = getRunningAuditChild(auditId);
  if (!child || hasExited(child)) {
    return { ok: false, auditId, reason: "no running analyzer child for this audit" };
  }

  const cancellationReason = reason ?? DEFAULT_CANCELLATION_REASON;
  await terminate(child);
  const job = cancelAuditJob(auditId, cancellationReason);
  if (!job) {
    return { ok: false, auditId, reason: "no cancellable canonical audit job for this audit" };
  }

  return {
    ok: true,
    auditId,
    status: "cancelled",
    reason: cancellationReason,
    cancelledAt: new Date().toISOString(),
  };
}
