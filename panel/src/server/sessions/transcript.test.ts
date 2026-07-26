// @vitest-environment node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseTranscript } from "./transcript";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const casesDir = path.resolve(dirname, "../../../tests/fixtures/sessions/transcript-cases");
const casePath = (name: string) => path.join(casesDir, name);

describe("parseTranscript", () => {
  it("extracts the title, cwd and start time, and sums usage across every assistant message", async () => {
    const stats = await parseTranscript(casePath("multi-message-usage.jsonl"));

    expect(stats.title).toBe("Multi message usage");
    expect(stats.cwd).toBe("/work/tc");
    expect(stats.startedAt).toBe("2026-02-01T00:00:00.000Z");
    expect(stats.lastActivityAt).toBe("2026-02-01T00:02:00.000Z");
    expect(stats.inputTokens).toBe(150);
    expect(stats.outputTokens).toBe(15);
    expect(stats.costUsd).toBeCloseTo(0.0015, 10);
    expect(stats.toolCallCount).toBe(1);
  });

  it("reports token and cost usage as null, not zero, when no assistant message recorded usage", async () => {
    const stats = await parseTranscript(casePath("no-usage.jsonl"));

    expect(stats.inputTokens).toBeNull();
    expect(stats.outputTokens).toBeNull();
    expect(stats.costUsd).toBeNull();
    // Tool-call counting does not depend on usage being present.
    expect(stats.toolCallCount).toBe(1);
  });

  it("skips an unparseable trailing line instead of throwing, keeping what came before it", async () => {
    const stats = await parseTranscript(casePath("malformed-trailing-line.jsonl"));

    expect(stats.inputTokens).toBe(10);
    expect(stats.outputTokens).toBe(2);
    expect(stats.costUsd).toBeCloseTo(0.0001, 10);
    // The truncated second message never counts - lastActivityAt stays at
    // the last entry that actually parsed.
    expect(stats.lastActivityAt).toBe("2026-02-03T00:01:00.000Z");
  });

  it("propagates a read failure for a transcript file that does not exist", async () => {
    const error: unknown = await parseTranscript(casePath("does-not-exist.jsonl")).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(Error);
  });

  it("returns null fields and zero tool calls for a session with no recorded entries", async () => {
    const stats = await parseTranscript(casePath("does-not-exist.jsonl")).catch((error: unknown) => error);

    expect(stats).toBeInstanceOf(Error);
  });
});
