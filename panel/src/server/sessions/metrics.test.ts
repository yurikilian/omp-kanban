// @vitest-environment node
import { describe, expect, it } from "vitest";
import { foldTranscriptStats } from "./metrics";
import type { TranscriptStats } from "./transcript";

function stats(overrides: Partial<TranscriptStats> = {}): TranscriptStats {
  return {
    title: "Agent",
    cwd: "/work/alpha",
    startedAt: "2026-01-01T10:00:00.000Z",
    lastActivityAt: "2026-01-01T10:05:00.000Z",
    inputTokens: 0,
    outputTokens: 0,
    costUsd: 0,
    toolCallCount: 0,
    ...overrides,
  };
}

describe("foldTranscriptStats", () => {
  it("counts the agent as just the main transcript when there are no sub-agents", () => {
    const main = stats({ toolCallCount: 2 });

    const folded = foldTranscriptStats(main, []);

    expect(folded.agentCount).toBe(1);
    expect(folded.toolCallCount).toBe(2);
  });

  it("sets agent count to one plus the sub-agent transcripts and includes their tokens, cost and tool calls (E3-S1-AC3)", () => {
    const main = stats({
      lastActivityAt: "2026-01-01T10:05:00.000Z",
      inputTokens: 2000,
      outputTokens: 400,
      costUsd: 0.02,
      toolCallCount: 1,
    });
    const worker = stats({
      lastActivityAt: "2026-01-01T10:07:00.000Z",
      inputTokens: 800,
      outputTokens: 150,
      costUsd: 0.008,
      toolCallCount: 3,
    });
    const helper = stats({
      lastActivityAt: "2026-01-01T10:04:30.000Z",
      inputTokens: 300,
      outputTokens: 50,
      costUsd: 0.003,
      toolCallCount: 1,
    });

    const folded = foldTranscriptStats(main, [worker, helper]);

    expect(folded.agentCount).toBe(3);
    expect(folded.toolCallCount).toBe(5);
    expect(folded.inputTokens).toBe(3100);
    expect(folded.outputTokens).toBe(600);
    expect(folded.costUsd).toBeCloseTo(0.031, 10);
  });

  it("takes the latest activity time across the main log and every sub-agent, even when a sub-agent ran later", () => {
    const main = stats({ lastActivityAt: "2026-01-01T10:05:00.000Z" });
    const worker = stats({ lastActivityAt: "2026-01-01T10:07:00.000Z" });
    const helper = stats({ lastActivityAt: "2026-01-01T10:04:30.000Z" });

    const folded = foldTranscriptStats(main, [worker, helper]);

    expect(folded.lastActivityAt).toBe("2026-01-01T10:07:00.000Z");
  });

  it("reports unavailable, not zero, when neither the main log nor any sub-agent recorded usage (E3-S1-AC2)", () => {
    const main = stats({ inputTokens: null, outputTokens: null, costUsd: null });
    const sub = stats({ inputTokens: null, outputTokens: null, costUsd: null });

    const folded = foldTranscriptStats(main, [sub]);

    expect(folded.inputTokens).toBeNull();
    expect(folded.outputTokens).toBeNull();
    expect(folded.costUsd).toBeNull();
  });

  it("sums whatever usage is available rather than nulling the total when only some transcripts recorded it", () => {
    const main = stats({ inputTokens: 100, outputTokens: 20, costUsd: 0.01 });
    const silentSubAgent = stats({ inputTokens: null, outputTokens: null, costUsd: null });

    const folded = foldTranscriptStats(main, [silentSubAgent]);

    expect(folded.inputTokens).toBe(100);
    expect(folded.outputTokens).toBe(20);
    expect(folded.costUsd).toBeCloseTo(0.01, 10);
  });

  it("sums tool calls across agents independently of whether usage is available", () => {
    const main = stats({ inputTokens: null, outputTokens: null, costUsd: null, toolCallCount: 2 });
    const sub = stats({ inputTokens: null, outputTokens: null, costUsd: null, toolCallCount: 3 });

    const folded = foldTranscriptStats(main, [sub]);

    expect(folded.toolCallCount).toBe(5);
  });
});
