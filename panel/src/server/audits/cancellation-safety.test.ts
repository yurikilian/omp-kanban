// @vitest-environment node
import { type ChildProcess } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { dispatchAudit } from "./dispatch";
import { validateAuditBundle } from "./validate";

const partialBundleAnalyzerPath = fileURLToPath(
  new URL("../../../tests/fakes/partial-bundle-analyzer.mjs", import.meta.url),
);
const originalAnalyzerCommand = process.env.OMP_PANEL_ANALYZER_COMMAND;
const spawnedChildren: ChildProcess[] = [];

interface ChildExit {
  code: number | null;
  signal: NodeJS.Signals | null;
}

function waitForExit(child: ChildProcess): Promise<ChildExit> {
  const { promise, resolve } = Promise.withResolvers<ChildExit>();
  child.once("exit", (code, signal) => resolve({ code, signal }));
  return promise;
}

async function waitForPartialBundle(bundleDirectory: string): Promise<void> {
  await vi.waitFor(async () => {
    await expect(fs.readFile(path.join(bundleDirectory, ".partial-bundle-started"), "utf8")).resolves.toBe(
      "started\n",
    );
  });
}

afterEach(() => {
  if (originalAnalyzerCommand === undefined) delete process.env.OMP_PANEL_ANALYZER_COMMAND;
  else process.env.OMP_PANEL_ANALYZER_COMMAND = originalAnalyzerCommand;

  for (const child of spawnedChildren.splice(0)) {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
  }
});

describe("partial analyzer cancellation safety (E4-S6-AC6)", () => {
  it("classifies a SIGTERM-interrupted partial analyzer bundle as incomplete rather than complete (E4-S6-AC6)", async () => {
    const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "panel-partial-bundle-"));

    try {
      const targetTranscript = path.join(temporaryDirectory, "session.jsonl");
      const bundleDirectory = path.join(temporaryDirectory, "bundle");
      const input = {
        auditId: "audit_partial-bundle-cancellation",
        targetTranscript,
        bundleDirectory,
        pricing: { available: false, pricing: null },
      };
      await fs.writeFile(targetTranscript, "{}\n");
      process.env.OMP_PANEL_ANALYZER_COMMAND = partialBundleAnalyzerPath;

      const child = dispatchAudit(input);
      spawnedChildren.push(child);
      await waitForPartialBundle(bundleDirectory);

      const exited = waitForExit(child);
      expect(child.kill("SIGTERM")).toBe(true);
      await expect(exited).resolves.toEqual({ code: null, signal: "SIGTERM" });

      expect(validateAuditBundle(bundleDirectory)).toEqual({
        status: "incomplete",
        missingFiles: ["report.md", "evidence.jsonl"],
      });
    } finally {
      await fs.rm(temporaryDirectory, { recursive: true, force: true });
    }
  });
});
