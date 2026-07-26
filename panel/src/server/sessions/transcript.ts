import fs from "node:fs/promises";

/**
 * Numbers pulled straight from one session transcript's raw JSONL entries -
 * the parent log or a single sibling sub-agent log, never both. Folding
 * several of these into one session's combined metrics is `metrics.ts`'s
 * job, not this module's.
 *
 * `inputTokens`, `outputTokens` and `costUsd` are `null` when the transcript
 * never recorded a single `usage` object, so the caller can tell "no data"
 * apart from "genuinely zero" (E3-S1-AC2) instead of defaulting to 0.
 */
export interface TranscriptStats {
  title: string | null;
  cwd: string | null;
  startedAt: string | null;
  lastActivityAt: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
  toolCallCount: number;
}

// A structural subset of the real OMP session-entry schema - just the
// fields this module reads. The full schema is much larger and versioned;
// parsing it fully is `@earendil-works/pi-coding-agent`'s job for the CLI
// itself; the panel only ever needs these few fields to build the list.
interface RawEntry {
  type?: string;
  timestamp?: string;
  title?: string;
  cwd?: string;
  message?: {
    role?: string;
    usage?: {
      input?: number;
      output?: number;
      cost?: { total?: number };
    };
  };
  data?: {
    toolName?: string;
  };
}

/**
 * Parse one session transcript (`.jsonl`, one JSON object per line) into
 * the raw numbers a session-list row needs. Tolerates a torn trailing line
 * (an in-progress write) by skipping it - only a fully unreadable file
 * rejects, so the repository layer can decide whether to drop the whole
 * session.
 */
export async function parseTranscript(filePath: string): Promise<TranscriptStats> {
  const content = await fs.readFile(filePath, "utf8");

  let title: string | null = null;
  let cwd: string | null = null;
  let startedAt: string | null = null;
  let lastActivityAt: string | null = null;
  let inputTokens = 0;
  let outputTokens = 0;
  let costUsd = 0;
  let sawUsage = false;
  let toolCallCount = 0;

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let entry: RawEntry;
    try {
      entry = JSON.parse(trimmed) as RawEntry;
    } catch {
      // A live session's last line can be a torn, partially-flushed write.
      continue;
    }

    if (typeof entry.timestamp === "string") {
      if (!lastActivityAt || entry.timestamp > lastActivityAt) lastActivityAt = entry.timestamp;
    }

    switch (entry.type) {
      case "title":
        // Rewritten in place as the title changes, so the single `title`
        // entry always reflects the latest value by the time the whole
        // file has been read.
        if (typeof entry.title === "string" && entry.title.trim()) title = entry.title.trim();
        break;
      case "session":
        if (typeof entry.cwd === "string") cwd = entry.cwd;
        if (typeof entry.timestamp === "string") startedAt = entry.timestamp;
        break;
      case "message": {
        const usage = entry.message?.role === "assistant" ? entry.message.usage : undefined;
        if (usage) {
          sawUsage = true;
          if (typeof usage.input === "number") inputTokens += usage.input;
          if (typeof usage.output === "number") outputTokens += usage.output;
          if (typeof usage.cost?.total === "number") costUsd += usage.cost.total;
        }
        break;
      }
      case "custom":
        if (typeof entry.data?.toolName === "string") toolCallCount += 1;
        break;
      default:
        break;
    }
  }

  return {
    title,
    cwd,
    startedAt,
    lastActivityAt: lastActivityAt ?? startedAt,
    inputTokens: sawUsage ? inputTokens : null,
    outputTokens: sawUsage ? outputTokens : null,
    costUsd: sawUsage ? costUsd : null,
    toolCallCount,
  };
}
