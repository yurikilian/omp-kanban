"use server";

import type { ChildProcess } from "node:child_process";
import { getRunningAuditChild } from "./dispatch";

/**
 * Cancelling an audit stops the analyzer child and records the audit
 * cancelled (`panel/docs/audit-bundle.md`, "Status values"). The bundle
 * directory a killed child leaves behind is never treated as this record's
 * substitute: `validate.ts` already resolves a directory missing any of the
 * four canonical files to `status: "incomplete"`, so a cancelled run's
 * partial (or absent) bundle reads as unfinished rather than as a second,
 * ambiguous "cancelled" bundle shape. This is the job service's own record,
 * kept independent of `dispatch.ts`'s running-child registry so it survives
 * after the child (and its registry entry) is gone.
 */
export interface AuditCancellation {
  auditId: string;
  status: "cancelled";
  reason: string;
  cancelledAt: string;
}

export type CancelAuditResult =
  | (AuditCancellation & { ok: true })
  | { ok: false; auditId: string; reason: string };

const DEFAULT_CANCELLATION_REASON = "the user stopped the analyzer";

/** How long to wait for a graceful SIGTERM exit before escalating to SIGKILL. */
const GRACEFUL_EXIT_TIMEOUT_MS = 3000;

const auditCancellations = new Map<string, AuditCancellation>();

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

/**
 * Stops the running analyzer child for `auditId` and records the audit
 * cancelled. Fails, rather than fabricating a record, when no child is
 * currently running for that audit id - there is nothing to cancel.
 */
export async function cancelAudit(auditId: string, reason?: string): Promise<CancelAuditResult> {
  const child = getRunningAuditChild(auditId);
  if (!child || hasExited(child)) {
    return { ok: false, auditId, reason: "no running analyzer child for this audit" };
  }

  await terminate(child);

  const cancellation: AuditCancellation = {
    auditId,
    status: "cancelled",
    reason: reason ?? DEFAULT_CANCELLATION_REASON,
    cancelledAt: new Date().toISOString(),
  };
  auditCancellations.set(auditId, cancellation);

  return { ok: true, ...cancellation };
}

/** The recorded cancellation for `auditId`, if it was ever cancelled. */
export async function getAuditCancellation(auditId: string): Promise<AuditCancellation | null> {
  return auditCancellations.get(auditId) ?? null;
}
