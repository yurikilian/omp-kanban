import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { foldTranscriptStats } from "./metrics";
import { parseTranscript } from "./transcript";
import type { SessionSummary } from "./types";

// Oh My Pi writes one project directory per real working directory under
// this root, and one `<sessionId>.jsonl` file per session inside it. A
// hub-spawned session also gets a sibling `<sessionId>/` directory holding
// one `.jsonl` per sub-agent (see `subAgentDir` below).
const DEFAULT_SESSIONS_ROOT = path.join(os.homedir(), ".omp", "agent", "sessions");

async function listDirectories(root: string): Promise<string[]> {
  const entries = await fs.readdir(root, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory() && !entry.name.startsWith(".")).map((entry) => entry.name);
}

/** Never throws: a missing sub-agent directory (the common case) is just zero sub-agents. */
async function listJsonlFiles(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries.filter((entry) => entry.isFile() && entry.name.endsWith(".jsonl")).map((entry) => entry.name);
  } catch {
    return [];
  }
}

async function buildSessionSummary(
  projectDir: string,
  projectPath: string,
  fileName: string,
): Promise<SessionSummary | null> {
  const sessionId = fileName.replace(/\.jsonl$/, "");
  const filePath = path.join(projectPath, fileName);
  const subAgentDir = path.join(projectPath, sessionId);

  try {
    const [main, subAgentFileNames] = await Promise.all([parseTranscript(filePath), listJsonlFiles(subAgentDir)]);

    // No session header means the file never finished being created (e.g.
    // a write interrupted before the header line was flushed) - it is not
    // a real, listable session.
    if (!main.startedAt) return null;

    const subAgents = await Promise.all(
      subAgentFileNames.map((name) => parseTranscript(path.join(subAgentDir, name))),
    );

    const folded = foldTranscriptStats(main, subAgents);
    const startedAt = main.startedAt;
    const durationMs = Math.max(0, Date.parse(folded.lastActivityAt) - Date.parse(startedAt));
    // The last path segment of the session's real cwd, e.g.
    // "/work/alpha" -> "alpha", falling back to the on-disk project
    // directory slug when the transcript never recorded a cwd.
    const project =
      main.cwd
        ?.split(/[\\/]/)
        .filter(Boolean)
        .pop() || projectDir;

    return {
      id: sessionId,
      title: main.title?.trim() ? main.title.trim() : sessionId,
      project,
      startedAt,
      lastActivityAt: folded.lastActivityAt,
      durationMs,
      costUsd: folded.costUsd,
      inputTokens: folded.inputTokens,
      outputTokens: folded.outputTokens,
      agentCount: folded.agentCount,
      toolCallCount: folded.toolCallCount,
    };
  } catch (error) {
    console.error(`omp panel: failed to read session "${sessionId}":`, error);
    return null;
  }
}

/**
 * List every recorded OMP session under `root` (default: the real OMP
 * sessions root on this machine) as the panel's normalised
 * `SessionSummary` contract, newest first by last activity.
 *
 * Rejects if `root` itself cannot be read, so a genuinely unreadable
 * sessions root stays distinguishable from a root that reads fine and
 * simply holds no sessions (E3-S1-AC4 vs AC5 - the two states T11 renders
 * are only distinguishable if this layer does not collapse them into the
 * same empty array). A single unreadable or malformed session transcript,
 * by contrast, is logged and skipped so it cannot take the rest of the
 * list down with it.
 */
export async function listSessionSummaries(root: string = DEFAULT_SESSIONS_ROOT): Promise<SessionSummary[]> {
  const projectDirs = await listDirectories(root);

  const perProject = await Promise.all(
    projectDirs.map(async (projectDir) => {
      const projectPath = path.join(root, projectDir);
      const sessionFiles = await listJsonlFiles(projectPath);
      const summaries = await Promise.all(
        sessionFiles.map((fileName) => buildSessionSummary(projectDir, projectPath, fileName)),
      );
      return summaries.filter((summary): summary is SessionSummary => summary !== null);
    }),
  );

  return perProject.flat().sort((a, b) => Date.parse(b.lastActivityAt) - Date.parse(a.lastActivityAt));
}
