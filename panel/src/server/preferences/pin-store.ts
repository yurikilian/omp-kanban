import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// Pins are a server-side, runtime-owned concept rather than browser storage
// (see T50's decision log): a session is a real file under the OMP sessions
// root, not a per-browser preference, so its pinned state stays correct
// across a page reload, a panel runtime restart, and any browser or device
// that opens this loopback-only panel. Every read/write below goes straight
// to this file with no in-memory cache, which is what makes a runtime
// restart indistinguishable from a reload as far as durability goes.
const DEFAULT_PIN_STORE_PATH = path.join(os.homedir(), ".omp", "panel", "pinned-sessions.json");

interface StoredPins {
  pinnedSessionIds: string[];
}

function isStoredPins(value: unknown): value is StoredPins {
  if (typeof value !== "object" || value === null) return false;

  const candidate = value as Record<string, unknown>;
  return Array.isArray(candidate.pinnedSessionIds) && candidate.pinnedSessionIds.every((id) => typeof id === "string");
}

/**
 * Reads the persisted pin set. A missing file, unreadable file or malformed
 * content is treated as "no pins" rather than thrown - the pin store is
 * never allowed to take the rest of the session list down with it.
 */
export async function readPinnedSessionIds(storePath: string = DEFAULT_PIN_STORE_PATH): Promise<string[]> {
  try {
    const raw = await fs.readFile(storePath, "utf8");
    const parsed: unknown = JSON.parse(raw);
    return isStoredPins(parsed) ? [...new Set(parsed.pinnedSessionIds)] : [];
  } catch {
    return [];
  }
}

/** Persists exactly this set of session ids as the pinned set, replacing whatever was stored before. */
export async function writePinnedSessionIds(
  ids: readonly string[],
  storePath: string = DEFAULT_PIN_STORE_PATH,
): Promise<void> {
  await fs.mkdir(path.dirname(storePath), { recursive: true });

  const body: StoredPins = { pinnedSessionIds: [...new Set(ids)] };
  await fs.writeFile(storePath, JSON.stringify(body, null, 2));
}

/** Pins or unpins one session id and returns the resulting full pinned set. */
export async function setSessionPinned(
  sessionId: string,
  pinned: boolean,
  storePath: string = DEFAULT_PIN_STORE_PATH,
): Promise<string[]> {
  const current = await readPinnedSessionIds(storePath);
  const next = pinned ? [...new Set([...current, sessionId])] : current.filter((id) => id !== sessionId);

  await writePinnedSessionIds(next, storePath);
  return next;
}
