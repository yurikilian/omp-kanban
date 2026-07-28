import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { foldTranscriptStats } from "./metrics";
import { parseTranscript } from "./transcript";
import type { SessionSummary } from "./types";

const DEFAULT_SESSIONS_ROOT = path.join(os.homedir(), ".omp", "agent", "sessions");

export type SessionStatusLabel = "Completed" | "Failed" | "Interrupted" | "Running" | "Unknown";

export interface SessionStatus {
  label: SessionStatusLabel;
  basis: string;
  derived: true;
}

export interface SessionDetail extends SessionSummary {
  status: SessionStatus;
}

interface SessionExitEntry {
  type?: unknown;
  customType?: unknown;
  data?: {
    kind?: unknown;
  };
}

interface SessionFile {
  projectDir: string;
  projectPath: string;
  filePath: string;
}

function errorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object" || !("code" in error)) return undefined;
  return typeof error.code === "string" ? error.code : undefined;
}

async function listJsonlFiles(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries.filter((entry) => entry.isFile() && entry.name.endsWith(".jsonl")).map((entry) => entry.name);
  } catch {
    // A main transcript having no sibling directory is the ordinary,
    // single-agent case. This mirrors the list repository's semantics.
    return [];
  }
}

async function findSessionFile(root: string, sessionId: string): Promise<SessionFile | null> {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const projects = entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .sort((left, right) => left.name.localeCompare(right.name));

  for (const project of projects) {
    const projectPath = path.join(root, project.name);
    const filePath = path.join(projectPath, `${sessionId}.jsonl`);

    try {
      // lstat deliberately refuses symlinked transcript files, so a route
      // parameter can never turn a session-root lookup into an outside read.
      if ((await fs.lstat(filePath)).isFile()) {
        return { projectDir: project.name, projectPath, filePath };
      }
    } catch (error) {
      if (errorCode(error) === "ENOENT") continue;
      throw error;
    }
  }

  return null;
}

/**
 * Keeps untrusted route parameters as a single filename segment before any
 * filesystem lookup. Session IDs do not need a narrower schema than this:
 * OMP's filename is the authoritative identifier format.
 */
export function isSafeSessionId(sessionId: string): boolean {
  return (
    sessionId.length > 0 &&
    sessionId !== "." &&
    sessionId !== ".." &&
    !sessionId.includes("/") &&
    !sessionId.includes("\\") &&
    !sessionId.includes("\0")
  );
}

/**
 * Session transcripts do not carry a first-class status field. We therefore
 * expose an explicit, derived status whose basis tells the UI exactly which
 * terminal event supported it (E3-S6-AC2).
 */
export function deriveSessionStatus(content: string): SessionStatus {
  let exitKind: string | null = null;

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let entry: SessionExitEntry;
    try {
      entry = JSON.parse(trimmed) as SessionExitEntry;
    } catch {
      // A live transcript can end with a partially flushed JSON line.
      continue;
    }

    if (entry.type === "custom" && entry.customType === "session_exit") {
      exitKind = typeof entry.data?.kind === "string" ? entry.data.kind : "";
    }
  }

  switch (exitKind) {
    case null:
      return { label: "Running", derived: true, basis: "no session exit event was recorded" };
    case "normal":
      return { label: "Completed", derived: true, basis: "a normal session exit event" };
    case "signal":
      return { label: "Interrupted", derived: true, basis: "a signal session exit event" };
    case "fatal":
      return { label: "Failed", derived: true, basis: "a fatal session exit event" };
    default:
      return { label: "Unknown", derived: true, basis: "an unrecognized session exit event" };
  }
}

/**
 * Reads one recorded session from the OMP sessions root. Filesystem paths are
 * assembled only after `sessionId` has been constrained to one safe segment;
 * sub-agent totals follow the exact folding semantics used by the list.
 */
export async function getSessionDetail(
  sessionId: string,
  root: string = DEFAULT_SESSIONS_ROOT,
): Promise<SessionDetail | null> {
  if (!isSafeSessionId(sessionId)) return null;

  const found = await findSessionFile(root, sessionId);
  if (!found) return null;

  const subAgentDir = path.join(found.projectPath, sessionId);
  const [main, rawMain, subAgentFileNames] = await Promise.all([
    parseTranscript(found.filePath),
    fs.readFile(found.filePath, "utf8"),
    listJsonlFiles(subAgentDir),
  ]);

  // An incomplete file with no session header is not an openable session,
  // matching the list repository's behavior.
  if (!main.startedAt) return null;

  const subAgents = await Promise.all(
    subAgentFileNames.map((fileName) => parseTranscript(path.join(subAgentDir, fileName))),
  );
  const folded = foldTranscriptStats(main, subAgents);
  const startedAt = main.startedAt;
  const project =
    main.cwd
      ?.split(/[\\/]/)
      .filter(Boolean)
      .pop() || found.projectDir;

  return {
    id: sessionId,
    title: main.title?.trim() ? main.title.trim() : sessionId,
    project,
    startedAt,
    lastActivityAt: folded.lastActivityAt,
    durationMs: Math.max(0, Date.parse(folded.lastActivityAt) - Date.parse(startedAt)),
    costUsd: folded.costUsd,
    inputTokens: folded.inputTokens,
    outputTokens: folded.outputTokens,
    agentCount: folded.agentCount,
    toolCallCount: folded.toolCallCount,
    status: deriveSessionStatus(rawMain),
  };
}
