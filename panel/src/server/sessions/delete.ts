import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { isSafeSessionId } from "./detail";

const DEFAULT_SESSIONS_ROOT = path.join(os.homedir(), ".omp", "agent", "sessions");

function errorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object" || !("code" in error)) return undefined;
  return typeof error.code === "string" ? error.code : undefined;
}

async function findTranscriptPath(root: string, sessionId: string): Promise<string | null> {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const projectDirectories = entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  for (const projectDirectory of projectDirectories) {
    const transcriptPath = path.join(root, projectDirectory, `${sessionId}.jsonl`);

    try {
      if ((await fs.lstat(transcriptPath)).isFile()) return transcriptPath;
    } catch (error) {
      if (errorCode(error) === "ENOENT") continue;
      throw error;
    }
  }

  return null;
}

export async function deleteSession(sessionId: string, root: string = DEFAULT_SESSIONS_ROOT): Promise<boolean> {
  if (!isSafeSessionId(sessionId)) return false;

  const transcriptPath = await findTranscriptPath(root, sessionId);
  if (!transcriptPath) return false;

  await fs.rm(path.join(path.dirname(transcriptPath), sessionId), { recursive: true, force: true });
  await fs.unlink(transcriptPath);
  return true;
}
