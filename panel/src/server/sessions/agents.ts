import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { deriveSessionStatus, isSafeSessionId } from "./detail";
import type { SessionStatus } from "./detail";

const DEFAULT_SESSIONS_ROOT = path.join(os.homedir(), ".omp", "agent", "sessions");

// The main transcript's own agent name everywhere else in the panel (see
// timeline.ts) - every session's hierarchy root.
const ROOT_AGENT_NAME = "main";

// OMP's delegation ("spawn a sub-agent") tool results carry this name.
// Only a result from this tool can prove a parent-to-child relationship.
const DELEGATION_TOOL_NAME = "task";

export interface AgentMetrics {
  durationMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
}

export interface AgentHierarchyNode {
  name: string;
  path: string[];
  parentUnknown: boolean;
  status: SessionStatus;
  metrics: AgentMetrics;
  children: AgentHierarchyNode[];
}

export interface RawAgentTranscript {
  name: string;
  raw: string;
}

// A structural subset of the real OMP session-entry schema - just the
// fields this module reads to find a transcript's own start/last-activity
// time, usage totals and explicit delegation results. Mirrors the
// equivalent private types in timeline.ts and transcript.ts, each of
// which reads this same schema for its own different purpose.
interface RawContentBlock {
  type?: string;
  text?: string;
}

interface RawEntry {
  type?: string;
  timestamp?: string;
  message?: {
    role?: string;
    toolName?: string;
    content?: RawContentBlock[];
    usage?: { input?: number; output?: number; cost?: { total?: number } };
  };
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

/** The earliest timestamp recorded anywhere in one transcript. */
function earliestTimestamp(raw: string): string | null {
  let earliest: string | null = null;
  for (const entry of parseLines(raw)) {
    if (typeof entry.timestamp !== "string") continue;
    if (!earliest || entry.timestamp < earliest) earliest = entry.timestamp;
  }
  return earliest;
}

interface AgentTranscriptStats {
  startedAt: string | null;
  lastActivityAt: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
}

/**
 * One transcript's own start time, last-activity time and usage totals -
 * `null`, never `0`, for any field the transcript never recorded
 * (E3-S8-AC2). `startedAt` stays `null` when the transcript never carried
 * a `session` entry, which also keeps the derived duration honestly
 * unavailable rather than a nonsensical negative or zero span.
 */
function parseAgentStats(raw: string): AgentTranscriptStats {
  let startedAt: string | null = null;
  let lastActivityAt: string | null = null;
  let inputTokens = 0;
  let outputTokens = 0;
  let costUsd = 0;
  let sawInputTokens = false;
  let sawOutputTokens = false;
  let sawCost = false;

  for (const entry of parseLines(raw)) {
    if (typeof entry.timestamp === "string") {
      if (!lastActivityAt || entry.timestamp > lastActivityAt) lastActivityAt = entry.timestamp;
      if (entry.type === "session") startedAt = entry.timestamp;
    }

    const usage = entry.type === "message" && entry.message?.role === "assistant" ? entry.message.usage : undefined;
    if (typeof usage?.input === "number") {
      inputTokens += usage.input;
      sawInputTokens = true;
    }
    if (typeof usage?.output === "number") {
      outputTokens += usage.output;
      sawOutputTokens = true;
    }
    if (typeof usage?.cost?.total === "number") {
      costUsd += usage.cost.total;
      sawCost = true;
    }
  }

  return {
    startedAt,
    lastActivityAt,
    inputTokens: sawInputTokens ? inputTokens : null,
    outputTokens: sawOutputTokens ? outputTokens : null,
    costUsd: sawCost ? costUsd : null,
  };
}

function toMetrics(stats: AgentTranscriptStats): AgentMetrics {
  const durationMs =
    stats.startedAt && stats.lastActivityAt
      ? Math.max(0, Date.parse(stats.lastActivityAt) - Date.parse(stats.startedAt))
      : null;

  return {
    durationMs,
    inputTokens: stats.inputTokens,
    outputTokens: stats.outputTokens,
    costUsd: stats.costUsd,
  };
}

/**
 * Returns the transcript that explicitly recorded spawning `childName`.
 * A preceding generic `task` call only proves that its caller delegated
 * *something*; it does not prove which sibling transcript came from that
 * call. The task result's `Spawned agent \`name\`` text is therefore the
 * parent evidence this hierarchy accepts. Without it, the caller places
 * the sub-agent at the root and marks its parent unknown rather than
 * attaching it to a timestamp-based guess (E3-S8-AC6).
 */
function findSpawningAgent(candidates: RawAgentTranscript[], childName: string): string | null {
  const spawnRecord = `Spawned agent \`${childName}\``;

  for (const candidate of candidates) {
    if (candidate.name === childName) continue;

    for (const entry of parseLines(candidate.raw)) {
      const { message } = entry;
      if (
        entry.type !== "message" ||
        message?.role !== "toolResult" ||
        message.toolName !== DELEGATION_TOOL_NAME ||
        !Array.isArray(message.content)
      ) {
        continue;
      }
      if (message.content.some((block) => block.type === "text" && block.text?.includes(spawnRecord))) {
        return candidate.name;
      }
    }
  }

  return null;
}

function byEarliestTimestamp(a: RawAgentTranscript, b: RawAgentTranscript): number {
  const left = earliestTimestamp(a.raw) ?? "";
  const right = earliestTimestamp(b.raw) ?? "";
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * Builds the session's agent hierarchy from the main transcript plus every
 * sub-agent transcript it spawned (E3-S8-AC1). A session with no
 * sub-agents at all contributes no nodes, so the UI can tell "nothing to
 * nest" apart from a hierarchy that simply has not loaded yet (E3-S8-AC4).
 *
 * Each sub-agent's spawning parent is accepted only when another
 * transcript explicitly records that agent's task-tool spawn result (see
 * `findSpawningAgent`). A sub-agent no transcript names is placed at the
 * root, alongside main, and marked `parentUnknown` rather than attached to
 * a time-adjacent but unproven task call (E3-S8-AC6).
 */
export function buildAgentHierarchy(main: RawAgentTranscript, subAgents: RawAgentTranscript[]): AgentHierarchyNode[] {
  if (subAgents.length === 0) return [];

  const all = [main, ...subAgents];
  const childrenByParent = new Map<string, RawAgentTranscript[]>();
  const unknownParents: RawAgentTranscript[] = [];

  for (const sub of subAgents) {
    const parentName = findSpawningAgent(all, sub.name);
    if (parentName) {
      const siblings = childrenByParent.get(parentName) ?? [];
      siblings.push(sub);
      childrenByParent.set(parentName, siblings);
    } else {
      unknownParents.push(sub);
    }
  }

  // Guards against a cycle in malformed/adversarial transcript data
  // recursing forever instead of just stopping that branch.
  function toNode(agent: RawAgentTranscript, parentPath: string[], parentUnknown: boolean, ancestors: Set<string>): AgentHierarchyNode {
    const nodePath = [...parentPath, agent.name];
    const withSelf = new Set(ancestors).add(agent.name);
    const children = (childrenByParent.get(agent.name) ?? [])
      .filter((child) => !withSelf.has(child.name))
      .sort(byEarliestTimestamp)
      .map((child) => toNode(child, nodePath, false, withSelf));

    return {
      name: agent.name,
      path: nodePath,
      parentUnknown,
      status: deriveSessionStatus(agent.raw),
      metrics: toMetrics(parseAgentStats(agent.raw)),
      children,
    };
  }

  return [
    toNode(main, [], false, new Set()),
    ...unknownParents.sort(byEarliestTimestamp).map((agent) => toNode(agent, [], true, new Set())),
  ];
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
 * transcript it spawned from disk and returns its agent hierarchy, or
 * `null` when the session id is unsafe or no such session exists.
 */
export async function getSessionAgents(
  sessionId: string,
  root: string = DEFAULT_SESSIONS_ROOT,
): Promise<AgentHierarchyNode[] | null> {
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

  return buildAgentHierarchy({ name: ROOT_AGENT_NAME, raw: mainRaw }, subAgents);
}