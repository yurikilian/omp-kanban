import type { TranscriptStats } from "./transcript";

/**
 * A session's combined metrics: the main transcript folded together with
 * every sibling sub-agent transcript (E3-S1-AC3). Pure data transformation
 * - no filesystem access - so the repository layer owns finding the
 * sub-agent files and this module only ever folds what it is handed.
 */
export interface FoldedMetrics {
  agentCount: number;
  toolCallCount: number;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
  lastActivityAt: string;
}

/**
 * Fold the main session transcript with its sub-agent transcripts (if any).
 * Agent count is always one (the main log) plus the sub-agent count.
 * Tool calls always sum, since a transcript recording zero tool calls is a
 * real, known zero.
 *
 * Token and cost totals are `null` only when *none* of the main log or its
 * sub-agents ever recorded a `usage` object (E3-S1-AC2) - not when any
 * single constituent happens to lack it. A sub-agent that produced no
 * billable turns contributes nothing to a total that other agents did
 * report real numbers for; that is an honest sum, not a fabricated one.
 */
export function foldTranscriptStats(main: TranscriptStats, subAgents: TranscriptStats[]): FoldedMetrics {
  const all = [main, ...subAgents];

  const toolCallCount = all.reduce((sum, entry) => sum + entry.toolCallCount, 0);

  const hasUsage = all.some(
    (entry) => entry.inputTokens !== null || entry.outputTokens !== null || entry.costUsd !== null,
  );
  const sumField = (pick: (entry: TranscriptStats) => number | null): number | null =>
    hasUsage ? all.reduce((sum, entry) => sum + (pick(entry) ?? 0), 0) : null;

  const lastActivityAt = all.reduce<string | null>((latest, entry) => {
    if (!entry.lastActivityAt) return latest;
    if (!latest || entry.lastActivityAt > latest) return entry.lastActivityAt;
    return latest;
  }, null);

  return {
    agentCount: 1 + subAgents.length,
    toolCallCount,
    inputTokens: sumField((entry) => entry.inputTokens),
    outputTokens: sumField((entry) => entry.outputTokens),
    costUsd: sumField((entry) => entry.costUsd),
    // The repository layer only folds a main transcript that already has a
    // non-null lastActivityAt (itself defaulted from startedAt in
    // transcript.ts), so this is never actually null in practice - the
    // empty-string fallback exists purely to keep the return type honest.
    lastActivityAt: lastActivityAt ?? "",
  };
}
