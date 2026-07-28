import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readPinnedSessionIds, setSessionPinned, writePinnedSessionIds } from "./pin-store";

let storePath: string;
let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "pin-store-test-"));
  storePath = path.join(tempDir, "pinned-sessions.json");
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

describe("readPinnedSessionIds", () => {
  it("returns an empty list when nothing has been persisted yet", async () => {
    expect(await readPinnedSessionIds(storePath)).toEqual([]);
  });

  it("returns an empty list, never throwing, for malformed stored content", async () => {
    await fs.mkdir(path.dirname(storePath), { recursive: true });
    await fs.writeFile(storePath, "not json");

    expect(await readPinnedSessionIds(storePath)).toEqual([]);
  });

  it("returns an empty list for well-formed JSON that is not the expected shape", async () => {
    await fs.mkdir(path.dirname(storePath), { recursive: true });
    await fs.writeFile(storePath, JSON.stringify({ somethingElse: true }));

    expect(await readPinnedSessionIds(storePath)).toEqual([]);
  });

  it("round-trips whatever writePinnedSessionIds persisted (E3-S4-AC2)", async () => {
    await writePinnedSessionIds(["session-a", "session-b"], storePath);

    expect(await readPinnedSessionIds(storePath)).toEqual(["session-a", "session-b"]);
  });

  it("survives being read again exactly as a runtime restart would - a fresh read call touches only disk, never in-memory state (E3-S4-AC2)", async () => {
    await writePinnedSessionIds(["session-a"], storePath);

    // No handle, cache or module-level state is threaded through here - each
    // call opens the file fresh, which is what makes this durable across a
    // panel runtime restart rather than merely across a page reload.
    expect(await readPinnedSessionIds(storePath)).toEqual(["session-a"]);
    expect(await readPinnedSessionIds(storePath)).toEqual(["session-a"]);
  });
});

describe("writePinnedSessionIds", () => {
  it("creates the containing directory when it does not exist yet", async () => {
    const nestedPath = path.join(tempDir, "nested", "dir", "pinned-sessions.json");

    await writePinnedSessionIds(["session-a"], nestedPath);

    expect(await readPinnedSessionIds(nestedPath)).toEqual(["session-a"]);
  });

  it("de-duplicates ids before persisting", async () => {
    await writePinnedSessionIds(["session-a", "session-a", "session-b"], storePath);

    expect(await readPinnedSessionIds(storePath)).toEqual(["session-a", "session-b"]);
  });

  it("replaces whatever was previously stored rather than merging", async () => {
    await writePinnedSessionIds(["session-a"], storePath);
    await writePinnedSessionIds(["session-b"], storePath);

    expect(await readPinnedSessionIds(storePath)).toEqual(["session-b"]);
  });
});

describe("setSessionPinned", () => {
  it("adds a session id when pinning, and returns the updated set", async () => {
    const result = await setSessionPinned("session-a", true, storePath);

    expect(result).toEqual(["session-a"]);
    expect(await readPinnedSessionIds(storePath)).toEqual(["session-a"]);
  });

  it("is idempotent when pinning an already-pinned session", async () => {
    await setSessionPinned("session-a", true, storePath);
    const result = await setSessionPinned("session-a", true, storePath);

    expect(result).toEqual(["session-a"]);
  });

  it("removes a session id when unpinning (E3-S4-AC3)", async () => {
    await setSessionPinned("session-a", true, storePath);
    await setSessionPinned("session-b", true, storePath);

    const result = await setSessionPinned("session-a", false, storePath);

    expect(result).toEqual(["session-b"]);
    expect(await readPinnedSessionIds(storePath)).toEqual(["session-b"]);
  });

  it("unpinning a session that was never pinned is a harmless no-op", async () => {
    const result = await setSessionPinned("session-a", false, storePath);

    expect(result).toEqual([]);
  });
});
