import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { loadEntries, readCwd } from './piSession.js';

/**
 * Normalize a timestamp (epoch-int or ISO string) to an ISO string.
 */
function toIso(ts) {
  if (typeof ts === 'number') return new Date(ts).toISOString();
  if (typeof ts === 'string' && ts) return ts;
  return null;
}

/**
 * Parse a JSONL file and extract message transcript
 */
async function parseSessionJSONL(filePath) {
  const messages = [];
  // Counters for the sessions-overview KPI cards, tallied straight from the
  // raw entries as we scan — NOT from `messages` below, which drops
  // tool-only assistant turns (no text content) and would silently lose
  // their token/cost usage otherwise.
  const stats = { messageCount: 0, toolCallCount: 0, inputTokens: 0, outputTokens: 0, cost: 0 };
  const entries = await loadEntries(filePath);
  for (const entry of entries) {
    // Extract title
    if (entry.type === 'title') {
      messages.push({
        role: 'system',
        content: `Session: ${entry.title}`,
        timestamp: entry.updatedAt
      });
    }
    
    // Extract messages
    if (entry.type === 'message' && entry.message) {
      const msg = entry.message;
      if (msg.role === 'user') {
        const content = msg.content?.[0]?.text || msg.content || '';
        if (content) {
          stats.messageCount++;
          messages.push({
            role: 'user',
            content,
            timestamp: entry.timestamp,
            id: entry.id,
            parentId: entry.parentId
          });
        }
      } else if (msg.role === 'assistant') {
        const textParts = (msg.content || [])
          .filter(c => c.type === 'text')
          .map(c => c.text)
          .join('\n');
        const usage = msg.usage;
        // Every assistant turn counts toward the KPI totals, even
        // tool-only turns with no visible text (usage is still real).
        stats.messageCount++;
        if (usage) {
          if (typeof usage.input === 'number') stats.inputTokens += usage.input;
          if (typeof usage.output === 'number') stats.outputTokens += usage.output;
          if (typeof usage.cost?.total === 'number') stats.cost += usage.cost.total;
        }
        if (textParts) {
          messages.push({
            role: 'assistant',
            content: textParts.substring(0, 4000),
            timestamp: entry.timestamp,
            id: entry.id,
            parentId: entry.parentId,
            model: msg.model,
            ...(usage ? {
              tokensIn: usage.input,
              tokensOut: usage.output,
              cost: usage.cost?.total
            } : {})
          });
        }
      } else if (msg.role === 'toolResult') {
        const raw = msg.content?.[0]?.text || msg.content || '';
        const content = typeof raw === 'string' ? raw : JSON.stringify(raw);
        if (content) {
          // Detect nested sub-task names from hub-style summaries, e.g.
          // "- `ServerGo` [task] — ServerGo"
          const subtaskMatches = [...content.matchAll(/`([^`]+)`\s*\[task\]/g)];
          const subtasks = [...new Set(subtaskMatches.map(m => m[1]))];
          const capped = content.length > 8000 ? content.substring(0, 8000) + '\n…[truncated]' : content;
          messages.push({
            role: 'tool_result',
            toolName: msg.toolName,
            toolCallId: msg.toolCallId,
            isError: !!msg.isError,
            content: capped,
            subtasks: subtasks.length > 0 ? subtasks : undefined,
            timestamp: entry.timestamp,
            parentId: entry.parentId
          });
        }
      }
    }
    
    // Extract tool executions
    if (entry.type === 'custom' && entry.data?.toolName) {
      const data = entry.data;
      stats.toolCallCount++;
      messages.push({
        role: 'tool_execution',
        toolName: data.toolName,
        toolCallId: data.toolCallId,
        intent: data.intent || '',
        args: JSON.stringify(data.args || {}),
        timestamp: toIso(data.startedAt),
        id: entry.id,
        parentId: entry.parentId
      });
    }
  }
  
  return { messages, stats };
}

/**
 * Fold every nested sub-task transcript's stats (hub-spawned agents) into
 * a session's own main-log stats, and set agentCount = 1 (main) plus one
 * per nested sub-task log.
 */
async function foldSubtaskStats(stats, sessionId) {
  const combined = { ...stats };
  const subtaskNames = await listSubtasks(sessionId);
  if (subtaskNames.length > 0) {
    const location = await findSessionLocation(sessionId);
    if (location) {
      for (const name of subtaskNames) {
        const { stats: sub } = await parseSessionJSONL(path.join(location.dirPath, `${name}.jsonl`));
        combined.messageCount += sub.messageCount;
        combined.toolCallCount += sub.toolCallCount;
        combined.inputTokens += sub.inputTokens;
        combined.outputTokens += sub.outputTokens;
        combined.cost += sub.cost;
      }
    }
  }
  combined.agentCount = 1 + subtaskNames.length;
  return combined;
}

/**
 * Load agent session transcripts from the Mnemopi .omp directory
 */
export async function loadAgentSessions() {
  const sessions = [];
  
  try {
    const sessionsDir = path.join(os.homedir(), '.omp', 'agent', 'sessions');
    const projectDirs = await fs.readdir(sessionsDir);
    
    for (const projectDir of projectDirs) {
      if (projectDir.startsWith('.')) continue;
      
      const projectPath = path.join(sessionsDir, projectDir);
      const stat = await fs.stat(projectPath);
      if (!stat.isDirectory()) continue;
      
      const sessionFiles = await fs.readdir(projectPath);
      
      for (const file of sessionFiles) {
        if (!file.endsWith('.jsonl')) continue;
        
        const sessionPath = path.join(projectPath, file);
        const sessionId = file.replace('.jsonl', '');
        
        try {
          const { messages: transcript, stats: mainStats } = await parseSessionJSONL(sessionPath);
          const stat = await fs.stat(sessionPath);
          const title = transcript.find(m => m.role === 'system')?.content || sessionId;
          
          // Parse timestamp from session ID format: YYYY-MM-DDTHH-mm-ss-SSSZ_UUID
          const timestampPart = sessionId.split('_')[0];
          // Convert hyphens after date: 2026-07-21T14-28-43-649Z -> 2026-07-21T14:28:43.649Z
          const isoTime = timestampPart.replace(/(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/, '$1:$2:$3.$4Z');
          const timestamp = new Date(isoTime).toISOString();
          
          const model = transcript.find(m => m.role === 'assistant' && m.model)?.model || 'unknown';
          const stats = await foldSubtaskStats(mainStats, sessionId);

          sessions.push({
            id: sessionId,
            name: title.replace('Session: ', ''),
            timestamp: timestamp,
            modifiedAt: stat.mtime.toISOString(),
            model,
            project: projectDir,
            stats,
            transcript: transcript.slice(0, 50), // Limit to first 50 messages for UI
            active: (Date.now() - stat.mtime.getTime()) < ACTIVE_WINDOW_MS
          });
        } catch (err) {
          console.error(`Error loading session ${sessionId}:`, err.message);
        }
      }
    }
  } catch (err) {
    console.error('Error loading sessions directory:', err.message);
  }
  
  // Sort by timestamp descending (newest first)
  sessions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  return sessions;
}

const ACTIVE_WINDOW_MS = 30000;

const SESSIONS_ROOT = path.join(os.homedir(), '.omp', 'agent', 'sessions');

/**
 * Find which project directory owns a given top-level session ID, and
 * resolve the sibling directory where nested sub-task JSONL logs live
 * (e.g. hub-spawned agents like `ServerGo.jsonl`, `WebFrontend.jsonl`).
 */
async function findSessionLocation(sessionId, root = SESSIONS_ROOT) {
  let projectDirs;
  try {
    projectDirs = await fs.readdir(root);
  } catch {
    return null;
  }

  for (const projectDir of projectDirs) {
    if (projectDir.startsWith('.')) continue;
    const projectPath = path.join(root, projectDir);
    const stat = await fs.stat(projectPath).catch(() => null);
    if (!stat || !stat.isDirectory()) continue;

    const filePath = path.join(projectPath, `${sessionId}.jsonl`);
    try {
      await fs.access(filePath);
      return {
        project: projectDir,
        filePath,
        dirPath: path.join(projectPath, sessionId)
      };
    } catch {
      // not in this project, keep looking
    }
  }
  return null;
}

/**
 * Permanently delete a session: removes its `.jsonl` transcript file and,
 * best-effort, the sibling directory holding any nested sub-task logs
 * (e.g. hub-spawned agents). Returns false if the session doesn't exist.
 */
export async function deleteSession(sessionId, root = SESSIONS_ROOT) {
  const location = await findSessionLocation(sessionId, root);
  if (!location) return false;

  try {
    await fs.unlink(location.filePath);
  } catch {
    return false;
  }

  await fs.rm(location.dirPath, { recursive: true, force: true }).catch(() => {});
  return true;
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Resolve the viewer's session id (the `<TIMESTAMP>_<uuid>` file stem used
 * throughout this app) for a bare ACP session UUID, by scanning project
 * directories for the matching `.jsonl` file. Returns null if not found.
 */
export async function findViewerIdByUuid(uuid, root = SESSIONS_ROOT) {
  let projectDirs;
  try {
    projectDirs = await fs.readdir(root);
  } catch {
    return null;
  }

  const pattern = new RegExp(`_${escapeRegExp(uuid)}\\.jsonl$`);
  for (const projectDir of projectDirs) {
    if (projectDir.startsWith('.')) continue;
    const projectPath = path.join(root, projectDir);
    const stat = await fs.stat(projectPath).catch(() => null);
    if (!stat || !stat.isDirectory()) continue;

    let files;
    try {
      files = await fs.readdir(projectPath);
    } catch {
      continue;
    }
    const match = files.find((f) => pattern.test(f));
    if (match) return match.replace(/\.jsonl$/, '');
  }
  return null;
}

/**
 * Resolve a viewer session id to the {uuid, cwd} pair needed to hand off to a NEW
 * `omp acp` process via session/load or session/fork. Returns null if the session
 * doesn't exist or its cwd cannot be resolved.
 */
export async function resolveSessionForAcp(viewerId, root = SESSIONS_ROOT) {
  const location = await findSessionLocation(viewerId, root);
  if (!location) return null;
  
  const underscore = viewerId.indexOf('_');
  if (underscore === -1) return null;
  const uuid = viewerId.slice(underscore + 1);
  
  const cwd = await readCwd(location.filePath);
  if (!cwd) return null;
  
  return { uuid, cwd };
}


/**
 * List known project working directories, derived from the real `cwd`
 * recorded in each project's most recent session file (NOT the lossy
 * slash-to-dash directory slug). Used to populate the Agent Console's
 * required project picker with real, spawnable paths. Sorted by most
 * recently used first.
 */
export async function listProjects(root = SESSIONS_ROOT) {
  const projects = [];
  let projectDirs;
  try {
    projectDirs = await fs.readdir(root);
  } catch {
    return projects;
  }

  for (const projectDir of projectDirs) {
    if (projectDir.startsWith('.')) continue;
    const projectPath = path.join(root, projectDir);
    const stat = await fs.stat(projectPath).catch(() => null);
    if (!stat || !stat.isDirectory()) continue;

    let files;
    try {
      files = (await fs.readdir(projectPath)).filter((f) => f.endsWith('.jsonl'));
    } catch {
      continue;
    }
    if (files.length === 0) continue;

    // Newest file by the timestamp encoded in its name (same sort as loadAgentSessions).
    files.sort().reverse();
    const newestFile = files[0];
    const timestampPart = newestFile.split('_')[0];
    const isoTime = timestampPart.replace(/(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/, '$1:$2:$3.$4Z');
    const lastUsedDate = new Date(isoTime);
    const lastUsed = isNaN(lastUsedDate) ? null : lastUsedDate.toISOString();

    const cwd = await readCwd(path.join(projectPath, newestFile));
    if (!cwd) continue;

    const label = cwd.split('/').filter(Boolean).pop() || cwd;
    projects.push({ cwd, label, lastUsed });
  }

  projects.sort((a, b) => new Date(b.lastUsed || 0) - new Date(a.lastUsed || 0));
  return projects;
}

/**
 * List nested sub-task session files stored alongside a parent session
 * (Oh My Pi writes one JSONL per hub-spawned sub-agent into a directory
 * named after the parent session ID).
 */
export async function listSubtasks(sessionId) {
  const location = await findSessionLocation(sessionId);
  if (!location) return [];

  try {
    const entries = await fs.readdir(location.dirPath);
    return entries
      .filter(f => f.endsWith('.jsonl'))
      .map(f => f.replace(/\.jsonl$/, ''))
      .sort();
  } catch {
    return [];
  }
}

/**
 * Load and parse a single nested sub-task's transcript by name.
 */
export async function loadSubtaskTranscript(sessionId, taskName) {
  const location = await findSessionLocation(sessionId);
  if (!location) return null;

  const taskPath = path.join(location.dirPath, `${taskName}.jsonl`);
  try {
    await fs.access(taskPath);
  } catch {
    return null;
  }

  const { messages: transcript } = await parseSessionJSONL(taskPath);
  const title = transcript.find(m => m.role === 'system')?.content || taskName;

  return {
    id: taskName,
    name: title.replace('Session: ', '') || taskName,
    transcript: transcript.slice(0, 50)
  };
}

/**
 * Build a chronological, per-agent session timeline as a TREE: the main
 * agent's own events, with every nested sub-agent's own timeline attached
 * directly to the exact event that spawned it (rather than merged into one
 * flat, globally-sorted list). Tool calls are paired with their results by
 * `toolCallId` (within each agent) and folded into a single 'tool' row
 * carrying the elapsed duration.
 *
 * Spawn linkage is derived from the spawning `task` tool call's own result
 * text, which enumerates exactly which agents it spawned, e.g.:
 *   "- `BackendScout` (job `BackendScout`)"
 * This is unambiguous and covers every spawn wave (unlike the hub polling
 * output's `` `Name` [task] `` mentions, which repeat across every poll and
 * are missing for some agents/format variants). A nearest-preceding
 * `task`-call-by-timestamp fallback covers any agent the regex still misses.
 */
export async function loadSessionTimeline(sessionId) {
  const loc = await findSessionLocation(sessionId);
  if (!loc) return null;

  const { messages: mainMsgsRaw } = await parseSessionJSONL(loc.filePath);
  const mainMsgs = mainMsgsRaw.map(m => ({ ...m, agent: 'main' }));

  const taskNames = await listSubtasks(sessionId);
  const subMsgsByAgent = new Map();
  await Promise.all(taskNames.map(async (name) => {
    const { messages: msgs } = await parseSessionJSONL(path.join(loc.dirPath, `${name}.jsonl`));
    subMsgsByAgent.set(name, msgs.map(m => ({ ...m, agent: name })));
  }));

  // Normalize timestamps (monotonic fallback) and fold tool_execution/
  // tool_result pairs (by toolCallId) into single chronological 'tool' rows,
  // independently per agent's own log.
  function buildEvents(msgs) {
    let lastTsMs = Date.now();
    for (const m of msgs) {
      const iso = toIso(m.timestamp);
      const parsed = iso ? Date.parse(iso) : NaN;
      m.tsMs = Number.isNaN(parsed) ? lastTsMs : parsed;
      lastTsMs = m.tsMs;
    }

    const starts = new Map();
    for (const m of msgs) {
      if (m.role === 'tool_execution' && m.toolCallId) starts.set(m.toolCallId, m);
    }
    const foldedIds = new Set();
    for (const m of msgs) {
      if (m.role === 'tool_result' && m.toolCallId && starts.has(m.toolCallId)) {
        const start = starts.get(m.toolCallId);
        start.role = 'tool';
        start.durationMs = m.tsMs - start.tsMs;
        start.isError = m.isError;
        start.resultPreview = (m.content || '').slice(0, 200);
        start.resultContent = m.content;
        foldedIds.add(m.toolCallId);
      }
    }

    const events = [];
    for (const m of msgs) {
      if (m.role === 'tool_result' && m.toolCallId && foldedIds.has(m.toolCallId)) continue;
      events.push(m);
    }
    events.sort((a, b) => a.tsMs - b.tsMs);
    return events;
  }

  const mainEvents = buildEvents(mainMsgs);
  const subEventsByAgent = new Map();
  for (const [name, msgs] of subMsgsByAgent) subEventsByAgent.set(name, buildEvents(msgs));
  const allAgentEvents = [['main', mainEvents], ...subEventsByAgent.entries()];

  // Primary linkage: parse "- `Name` (job `Name`)" lines out of every `task`
  // tool call's own result content.
  const JOB_LINE = /`([^`]+)`\s*\(job\s*`[^`]+`\)/g;
  const parentOf = new Map(); // childAgentName -> { parentAgent, parentIdx }
  for (const [agentName, events] of allAgentEvents) {
    events.forEach((ev, idx) => {
      if (ev.role !== 'tool' || ev.toolName !== 'task' || !ev.resultContent) return;
      for (const m of ev.resultContent.matchAll(JOB_LINE)) {
        const childName = m[1];
        if (taskNames.includes(childName) && !parentOf.has(childName)) {
          parentOf.set(childName, { parentAgent: agentName, parentIdx: idx });
        }
      }
    });
  }

  // Fallback: nearest-preceding `task` call by timestamp, for any agent the
  // regex above didn't cover (e.g. unexpected result-text format).
  const taskCalls = [];
  for (const [agentName, events] of allAgentEvents) {
    events.forEach((ev, idx) => {
      if (ev.role === 'tool' && ev.toolName === 'task') taskCalls.push({ agentName, idx, tsMs: ev.tsMs });
    });
  }
  taskCalls.sort((a, b) => a.tsMs - b.tsMs);
  for (const [name, events] of subEventsByAgent) {
    if (parentOf.has(name) || events.length === 0) continue;
    const childTs = events[0].tsMs;
    let best = null;
    for (const call of taskCalls) {
      if (call.tsMs <= childTs) best = call;
      else break;
    }
    if (best) parentOf.set(name, { parentAgent: best.agentName, parentIdx: best.idx });
  }

  // Lane assignment (color/legend only): 'main' is always lane 0; every
  // other agent gets the next lane in order of its own first event.
  const laneOrder = [...taskNames].sort((a, b) => {
    const tsA = subEventsByAgent.get(a)?.[0]?.tsMs ?? Infinity;
    const tsB = subEventsByAgent.get(b)?.[0]?.tsMs ?? Infinity;
    return tsA - tsB;
  });
  const laneByAgent = new Map([['main', 0]]);
  laneOrder.forEach((name, i) => laneByAgent.set(name, i + 1));

  // Index children by the exact parent event that spawned them.
  const childrenAt = new Map(); // `${parentAgent}#${parentIdx}` -> [childAgentName]
  for (const [name, { parentAgent, parentIdx }] of parentOf) {
    const key = `${parentAgent}#${parentIdx}`;
    if (!childrenAt.has(key)) childrenAt.set(key, []);
    childrenAt.get(key).push(name);
  }

  function toWireEvent(ev, children) {
    return {
      agent: ev.agent,
      lane: laneByAgent.get(ev.agent) ?? 0,
      role: ev.role,
      ts: new Date(ev.tsMs).toISOString(),
      content: ev.content,
      toolName: ev.toolName,
      intent: ev.intent,
      args: ev.args,
      durationMs: ev.durationMs,
      isError: ev.isError,
      resultPreview: ev.resultPreview,
      resultContent: ev.resultContent,
      model: ev.model,
      tokensIn: ev.tokensIn,
      tokensOut: ev.tokensOut,
      cost: ev.cost,
      ...(children && children.length ? { children } : {})
    };
  }

  function buildNode(agentName, events) {
    const total = events.length;
    const capped = total > 1000 ? events.slice(-1000) : events;
    const offset = total - capped.length;
    const wireEvents = capped.map((ev, i) => {
      const originalIdx = i + offset;
      const childNames = childrenAt.get(`${agentName}#${originalIdx}`) || [];
      const children = childNames.map(name => buildNode(name, subEventsByAgent.get(name) || []));
      return toWireEvent(ev, children);
    });
    const firstTs = total ? new Date(events[0].tsMs).toISOString() : null;
    const lastTs = total ? new Date(events[total - 1].tsMs).toISOString() : null;
    return {
      agent: agentName,
      lane: laneByAgent.get(agentName) ?? 0,
      firstTs,
      lastTs,
      durationMs: (firstTs && lastTs) ? Date.parse(lastTs) - Date.parse(firstTs) : 0,
      count: total,
      events: wireEvents
    };
  }

  const root = buildNode('main', mainEvents);
  const unlinkedNames = taskNames.filter(name => !parentOf.has(name));
  const unlinked = unlinkedNames.map(name => buildNode(name, subEventsByAgent.get(name) || []));

  const count = mainEvents.length + [...subEventsByAgent.values()].reduce((sum, e) => sum + e.length, 0);
  const title = mainMsgs.find(m => m.role === 'system')?.content?.replace('Session: ', '');

  return {
    id: sessionId,
    name: title || sessionId,
    project: loc.project,
    count,
    agents: [...laneByAgent.entries()].map(([name, lane]) => ({ name, lane })),
    root,
    ...(unlinked.length ? { unlinked } : {})
  };
}
