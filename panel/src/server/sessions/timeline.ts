import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { isSafeSessionId } from "./detail";

const DEFAULT_SESSIONS_ROOT = path.join(os.homedir(), ".omp", "agent", "sessions");

export interface PromptTimelineEvent {
  type: "prompt";
  id: string;
  timestamp: string;
  text: string;
}

export interface ResponseTimelineEvent {
  type: "response";
  id: string;
  timestamp: string;
  agent: string;
  text: string;
  model: string | null;
  durationMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
}

export type ToolCallOutcome = "success" | "error" | "pending";

export interface ToolCallTimelineEvent {
  type: "tool_call";
  id: string;
  timestamp: string;
  agent: string;
  toolName: string;
  summary: string | null;
  input: string | null;
  output: string | null;
  durationMs: number | null;
  outcome: ToolCallOutcome;
}

export interface DelegationTimelineEvent {
  type: "delegation";
  id: string;
  timestamp: string;
  parentAgent: string;
  childAgent: string;
  task: string | null;
}

export interface StatusTimelineEvent {
  type: "status";
  id: string;
  timestamp: string;
  label: string;
}

export interface ErrorTimelineEvent {
  type: "error";
  id: string;
  timestamp: string;
  agent: string;
  text: string;
}

export type TimelineEvent =
  | PromptTimelineEvent
  | ResponseTimelineEvent
  | ToolCallTimelineEvent
  | DelegationTimelineEvent
  | StatusTimelineEvent
  | ErrorTimelineEvent;

export interface SubAgentTranscript {
  name: string;
  raw: string;
}

// A structural subset of the real OMP session-entry schema, mirroring the
// fields transcript.ts and detail.ts already read - just extended with the
// message content, tool-call correlation and exit-reason fields the
// timeline needs that a plain usage/status summary does not.
interface RawContentBlock {
  type?: string;
  text?: string;
}

interface RawMessage {
  role?: string;
  content?: RawContentBlock[];
  model?: string;
  usage?: { input?: number; output?: number; cost?: { total?: number } };
  toolCallId?: string;
  toolName?: string;
  stopReason?: string;
  errorMessage?: string;
  isError?: boolean;
}

interface RawEntry {
  type?: string;
  customType?: string;
  id?: string;
  parentId?: string | null;
  timestamp?: string;
  message?: RawMessage;
  data?: {
    toolCallId?: string;
    toolName?: string;
    startedAt?: string;
    intent?: string;
    reason?: string;
    kind?: string;
  };
}

interface PendingToolCall {
  id: string;
  toolName: string;
  summary: string | null;
  startedAt: string;
}

function parseLines(raw: string): RawEntry[] {
  const entries: RawEntry[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      entries.push(JSON.parse(trimmed) as RawEntry);
    } catch {
      // A live session's last line can be a torn, partially-flushed write.
      continue;
    }
  }
  return entries;
}

function extractText(content: RawContentBlock[] | undefined): string {
  if (!content) return "";
  return content
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("\n\n");
}

const SESSION_EXIT_STATUS_LABEL: Record<string, string> = {
  normal: "Session completed",
  signal: "Session interrupted",
};

/**
 * Parses one transcript's raw JSONL content (the main log, or a single
 * sub-agent's own log - never both at once) into the timeline events that
 * transcript alone contributes, tagged with `agent` so a merged view can
 * still tell which agent a response, tool call or error belongs to
 * (E3-S7-AC1). Delegation events are not produced here - synthesising a
 * hand-off requires correlating a spawning transcript with the sub-agent
 * transcript it produced, which is `buildSessionTimeline`'s job.
 *
 * Tolerates an unparseable trailing line (an in-progress write) the same
 * way `transcript.ts` does: skip it, keep everything that came before.
 */
export function parseAgentTimeline(raw: string, agent: string): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  const timestampById = new Map<string, string>();
  const pendingToolCalls = new Map<string, PendingToolCall>();

  for (const entry of parseLines(raw)) {
    if (entry.id && typeof entry.timestamp === "string") {
      timestampById.set(entry.id, entry.timestamp);
    }
    const timestamp = entry.timestamp ?? "";

    if (entry.type === "session") {
      events.push({ type: "status", id: `${agent}:session-start`, timestamp, label: "Session started" });
      continue;
    }

    if (entry.type === "custom" && entry.customType === "tool_execution_start" && entry.data?.toolCallId) {
      pendingToolCalls.set(entry.data.toolCallId, {
        id: entry.id ?? entry.data.toolCallId,
        toolName: entry.data.toolName ?? "unknown",
        summary: entry.data.intent ?? null,
        startedAt: entry.data.startedAt ?? timestamp,
      });
      continue;
    }

    if (entry.type === "custom" && entry.customType === "session_exit") {
      const kind = entry.data?.kind;
      if (kind === "fatal") {
        const reason = entry.data?.reason;
        events.push({
          type: "error",
          id: `${agent}:session-exit`,
          timestamp,
          agent,
          text: reason ? `Session failed: ${reason}` : "Session failed",
        });
      } else {
        events.push({
          type: "status",
          id: `${agent}:session-exit`,
          timestamp,
          label: kind && SESSION_EXIT_STATUS_LABEL[kind] ? SESSION_EXIT_STATUS_LABEL[kind] : "Session ended",
        });
      }
      continue;
    }

    if (entry.type !== "message" || !entry.message) continue;
    const { message } = entry;

    if (message.role === "user") {
      events.push({ type: "prompt", id: `${agent}:${entry.id}`, timestamp, text: extractText(message.content) });
      continue;
    }

    if (message.role === "assistant" && message.stopReason === "error") {
      events.push({
        type: "error",
        id: `${agent}:${entry.id}`,
        timestamp,
        agent,
        text: message.errorMessage ?? "The model call failed.",
      });
      continue;
    }

    if (message.role === "assistant") {
      const parentTimestamp = entry.parentId ? timestampById.get(entry.parentId) : undefined;
      const durationMs =
        parentTimestamp !== undefined ? Date.parse(timestamp) - Date.parse(parentTimestamp) : null;
      events.push({
        type: "response",
        id: `${agent}:${entry.id}`,
        timestamp,
        agent,
        text: extractText(message.content),
        model: message.model ?? null,
        durationMs,
        inputTokens: message.usage?.input ?? null,
        outputTokens: message.usage?.output ?? null,
        costUsd: message.usage?.cost?.total ?? null,
      });
      continue;
    }

    if (message.role === "toolResult" && message.toolCallId) {
      const pending = pendingToolCalls.get(message.toolCallId);
      pendingToolCalls.delete(message.toolCallId);
      events.push({
        type: "tool_call",
        id: `${agent}:tool:${message.toolCallId}`,
        timestamp: pending?.startedAt ?? timestamp,
        agent,
        toolName: message.toolName ?? pending?.toolName ?? "unknown",
        summary: pending?.summary ?? null,
        input: pending?.summary ?? null,
        output: extractText(message.content),
        durationMs: pending ? Date.parse(timestamp) - Date.parse(pending.startedAt) : null,
        outcome: message.isError ? "error" : "success",
      });
    }
  }

  for (const [toolCallId, pending] of pendingToolCalls) {
    events.push({
      type: "tool_call",
      id: `${agent}:tool:${toolCallId}`,
      timestamp: pending.startedAt,
      agent,
      toolName: pending.toolName,
      summary: pending.summary,
      input: pending.summary,
      output: null,
      durationMs: null,
      outcome: "pending",
    });
  }

  return events;
}

// The tool name OMP's delegation ("spawn a sub-agent") tool call is
// recorded under. Only a call under this name is a candidate hand-off a
// delegation event can correlate its task description with.
const DELEGATION_TOOL_NAME = "task";

function earliestTimestamp(raw: string): string | null {
  let earliest: string | null = null;
  for (const entry of parseLines(raw)) {
    if (typeof entry.timestamp !== "string") continue;
    if (!earliest || entry.timestamp < earliest) earliest = entry.timestamp;
  }
  return earliest;
}

/**
 * Correlates a sub-agent's hand-off with the most recent delegation-tool
 * call in the parent transcript that started no later than the
 * sub-agent's own first recorded timestamp. Two sub-agents spawned by the
 * same call (a single "spawn Worker and Helper" tool call, say) correctly
 * share that call's task text - this looks for the responsible call, not
 * a call reserved for one child alone.
 */
function correlateDelegationTask(parentRaw: string, childStart: string | null): string | null {
  if (!childStart) return null;
  let task: string | null = null;
  let bestStartedAt: string | null = null;

  for (const entry of parseLines(parentRaw)) {
    if (entry.type !== "custom" || entry.customType !== "tool_execution_start") continue;
    if (entry.data?.toolName !== DELEGATION_TOOL_NAME) continue;
    const startedAt = entry.data.startedAt ?? entry.timestamp;
    if (!startedAt || startedAt > childStart) continue;
    if (!bestStartedAt || startedAt > bestStartedAt) {
      bestStartedAt = startedAt;
      task = entry.data.intent ?? null;
    }
  }

  return task;
}

/**
 * Merges the main session transcript with every sub-agent transcript it
 * spawned into one chronologically-ordered timeline (E3-S7-AC1). Each
 * sub-agent contributes exactly one delegation event, positioned at that
 * sub-agent's own first recorded timestamp, plus its own prompt, response,
 * tool-call and status/error events tagged with its name. Nesting is one
 * level deep - every sub-agent's delegation is always shown as coming
 * from "main" - which matches how OMP records sub-agent transcripts today
 * (a flat sibling directory, not a recursive tree).
 */
export function buildSessionTimeline(mainRaw: string, subAgents: SubAgentTranscript[] = []): TimelineEvent[] {
  const events: TimelineEvent[] = [...parseAgentTimeline(mainRaw, "main")];

  for (const sub of subAgents) {
    const childStart = earliestTimestamp(sub.raw);
    events.push({
      type: "delegation",
      id: `delegation:${sub.name}`,
      timestamp: childStart ?? "",
      parentAgent: "main",
      childAgent: sub.name,
      task: correlateDelegationTask(mainRaw, childStart),
    });
    events.push(...parseAgentTimeline(sub.raw, sub.name));
  }

  return events.sort((a, b) => (a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0));
}

async function listJsonlFiles(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries.filter((entry) => entry.isFile() && entry.name.endsWith(".jsonl")).map((entry) => entry.name);
  } catch {
    // A main transcript having no sibling directory is the ordinary,
    // single-agent case.
    return [];
  }
}

function errorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object" || !("code" in error)) return undefined;
  return typeof error.code === "string" ? error.code : undefined;
}

async function findSessionTranscriptFile(root: string, sessionId: string): Promise<{ filePath: string; subAgentDir: string } | null> {
  const projects = await fs.readdir(root, { withFileTypes: true });

  for (const project of projects.filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))) {
    const projectPath = path.join(root, project.name);
    const filePath = path.join(projectPath, `${sessionId}.jsonl`);
    try {
      if ((await fs.lstat(filePath)).isFile()) {
        return { filePath, subAgentDir: path.join(projectPath, sessionId) };
      }
    } catch (error) {
      if (errorCode(error) === "ENOENT") continue;
      throw error;
    }
  }

  return null;
}

/**
 * Reads one recorded session's main transcript plus every sub-agent
 * transcript it spawned from disk and returns the fully merged timeline,
 * or `null` when the session id is unsafe or no such session exists.
 */
export async function getSessionTimeline(
  sessionId: string,
  root: string = DEFAULT_SESSIONS_ROOT,
): Promise<TimelineEvent[] | null> {
  if (!isSafeSessionId(sessionId)) return null;

  const found = await findSessionTranscriptFile(root, sessionId);
  if (!found) return null;

  const [mainRaw, subAgentFileNames] = await Promise.all([
    fs.readFile(found.filePath, "utf8"),
    listJsonlFiles(found.subAgentDir),
  ]);

  const subAgents = await Promise.all(
    subAgentFileNames.map(async (fileName) => ({
      name: fileName.replace(/\.jsonl$/, ""),
      raw: await fs.readFile(path.join(found.subAgentDir, fileName), "utf8"),
    })),
  );

  return buildSessionTimeline(mainRaw, subAgents);
}