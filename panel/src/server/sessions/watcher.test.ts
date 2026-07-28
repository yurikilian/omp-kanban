// @vitest-environment node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { type SessionChange, type SessionWatcher, watchSessions } from "./watcher";

function waitForChange(sessionId: string): {
  notify: (change: SessionChange) => void;
  changed: Promise<SessionChange>;
} {
  let resolveChange!: (change: SessionChange) => void;
  const changed = new Promise<SessionChange>((resolve) => {
    resolveChange = resolve;
  });

  return {
    notify(change) {
      if (change.sessionId === sessionId) {
        resolveChange(change);
      }
    },
    changed,
  };
}

describe("watchSessions", () => {
  let root: string | undefined;
  let watcher: SessionWatcher | undefined;

  afterEach(async () => {
    watcher?.close();
    watcher = undefined;
    if (root) await fs.rm(root, { recursive: true, force: true });
    root = undefined;
  });

  it("emits the main transcript's session id when the transcript changes on disk (E3-S9-AC1)", async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "omp-session-watcher-"));
    const project = path.join(root, "project");
    const sessionId = "session-main";
    const transcript = path.join(project, `${sessionId}.jsonl`);
    await fs.mkdir(project);
    await fs.writeFile(transcript, "first record\n");

    const expected = waitForChange(sessionId);
    watcher = watchSessions(expected.notify, root);
    await fs.appendFile(transcript, "changed record\n");

    await expect(expected.changed).resolves.toEqual({ sessionId });
  });

  it("emits the parent session id when a sub-agent transcript changes on disk (E3-S9-AC1)", async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "omp-session-watcher-"));
    const project = path.join(root, "project");
    const sessionId = "session-parent";
    const transcript = path.join(project, sessionId, "agent.jsonl");
    await fs.mkdir(path.dirname(transcript), { recursive: true });
    await fs.writeFile(transcript, "first record\n");

    const expected = waitForChange(sessionId);
    watcher = watchSessions(expected.notify, root);
    await fs.appendFile(transcript, "changed record\n");

    await expect(expected.changed).resolves.toEqual({ sessionId });
  });
});