import { watch } from "node:fs";
import os from "node:os";
import path from "node:path";

const DEFAULT_SESSIONS_ROOT = path.join(os.homedir(), ".omp", "agent", "sessions");

export interface SessionChange {
  sessionId: string;
}

export interface SessionWatcher {
  close(): void;
}

function sessionIdFromFilename(filename: string): string | null {
  const segments = filename.replace(/\\/g, "/").split("/").filter(Boolean);
  const transcript = segments[segments.length - 1];

  if (!transcript?.endsWith(".jsonl")) return null;
  if (segments.length > 2) return segments[segments.length - 2] ?? null;

  return transcript.slice(0, -".jsonl".length);
}

export function watchSessions(
  onSessionChange: (change: SessionChange) => void,
  root: string = DEFAULT_SESSIONS_ROOT,
): SessionWatcher {
  const watcher = watch(root, { recursive: true }, (_eventType, filename) => {
    if (typeof filename !== "string") return;

    const sessionId = sessionIdFromFilename(filename);
    if (sessionId) onSessionChange({ sessionId });
  });

  return { close: () => watcher.close() };
}