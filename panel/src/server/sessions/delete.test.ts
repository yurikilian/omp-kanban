// @vitest-environment node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { deleteSession } from "./delete";

const sessionId = "2026-01-01T09-00-00-000Z_00000000-0000-7000-8000-000000000001";
let root: string;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "panel-delete-session-"));
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe("deleteSession", () => {
  it("removes a transcript and its sibling sub-agent directory (E3-S5-AC3)", async () => {
    const projectPath = path.join(root, "project");
    const transcriptPath = path.join(projectPath, `${sessionId}.jsonl`);
    const subAgentPath = path.join(projectPath, sessionId);
    await fs.mkdir(subAgentPath, { recursive: true });
    await Promise.all([
      fs.writeFile(transcriptPath, "{\"type\":\"session\"}\n"),
      fs.writeFile(path.join(subAgentPath, "agent.jsonl"), "{\"type\":\"session\"}\n"),
    ]);

    await expect(deleteSession(sessionId, root)).resolves.toBe(true);
    await expect(fs.lstat(transcriptPath)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(fs.lstat(subAgentPath)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
