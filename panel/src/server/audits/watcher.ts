import { watch } from "node:fs";
import os from "node:os";
import path from "node:path";

const DEFAULT_AUDITS_ROOT = path.join(os.homedir(), ".omp", "forensics", "audits");

export interface AuditChange {
  sessionId: string;
  status: "queued" | "running" | "completed" | "failed";
}

export interface AuditWatcher {
  close(): void;
}

/**
 * Extracts session ID from an audit file path.
 * Audit files are stored at: ~/.omp/forensics/audits/{sessionId}/*.json
 */
function sessionIdFromAuditPath(filename: string): string | null {
  const segments = filename.replace(/\\/g, "/").split("/").filter(Boolean);
  if (segments.length >= 2) {
    return segments[segments.length - 2];
  }
  return null;
}

/**
 * Monitors the audits directory for file changes and emits audit change events
 * as audits transition between states (queued, running, completed, failed).
 */
export function watchAudits(
  onAuditChange: (change: AuditChange) => void,
  root: string = DEFAULT_AUDITS_ROOT,
): AuditWatcher {
  const watcher = watch(root, { recursive: true }, (_eventType, filename) => {
    if (typeof filename !== "string") return;

    const sessionId = sessionIdFromAuditPath(filename);
    if (!sessionId) return;

    // Infer status from file presence and name patterns
    // For now, emit as "running" for any update (status detection can be enhanced later)
    onAuditChange({ sessionId, status: "running" });
  });

  return { close: () => watcher.close() };
}
