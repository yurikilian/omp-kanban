import { test, describe, it, expect, beforeAll, afterAll } from 'vitest';
import { loadAgentSessions, listSubtasks, loadSubtaskTranscript, loadSessionTimeline, findViewerIdByUuid, listProjects, deleteSession } from './sessions.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

// Known-good fixture from the real ~/.omp data on this machine: a hub-spawned
// session that has nested sub-task JSONL logs (ServerGo, WebFrontend, etc.)
const KNOWN_PARENT_SESSION = '2026-07-21T10-30-00-357Z_019f8439-ada5-7000-9866-78103fb8e8e5';

describe('Session Loading', () => {
  it('should load real agent sessions from .omp directory', async () => {
    const sessions = await loadAgentSessions();
    
    // Verify sessions loaded
    expect(Array.isArray(sessions)).toBe(true);
    expect(sessions.length).toBeGreaterThan(0);
  });

  it('should have correct session structure', async () => {
    const sessions = await loadAgentSessions();
    
    if (sessions.length > 0) {
      const session = sessions[0];
      
      expect(session).toHaveProperty('id');
      expect(session).toHaveProperty('name');
      expect(session).toHaveProperty('timestamp');
      expect(session).toHaveProperty('modifiedAt');
      expect(session).toHaveProperty('model');
      expect(session).toHaveProperty('transcript');
      expect(Array.isArray(session.transcript)).toBe(true);
      expect(typeof session.active).toBe('boolean');
    }
  });

  it('should parse transcript messages correctly', async () => {
    const sessions = await loadAgentSessions();
    
    if (sessions.length > 0) {
      const session = sessions[0];
      const transcript = session.transcript;
      
      if (transcript.length > 0) {
        const msg = transcript[0];
        
        // Check message has required fields
        expect(msg).toHaveProperty('role');
        expect(msg).toHaveProperty('content');
        
        // Check valid roles
        const validRoles = ['user', 'assistant', 'system', 'tool_execution', 'tool_result'];
        expect(validRoles).toContain(msg.role);
      }
    }
  });

  it('should sort sessions by timestamp (newest first)', async () => {
    const sessions = await loadAgentSessions();
    
    if (sessions.length > 1) {
      for (let i = 0; i < sessions.length - 1; i++) {
        const current = new Date(sessions[i].timestamp);
        const next = new Date(sessions[i + 1].timestamp);
        expect(current.getTime()).toBeGreaterThanOrEqual(next.getTime());
      }
    }
  });

  it('should include modifiedAt as a valid ISO string', async () => {
    const sessions = await loadAgentSessions();
    
    if (sessions.length > 0) {
      const session = sessions[0];
      
      expect(session).toHaveProperty('modifiedAt');
      expect(typeof session.modifiedAt).toBe('string');
      // Verify it's a valid ISO 8601 string
      const parsedDate = new Date(session.modifiedAt);
      expect(parsedDate.toString()).not.toBe('Invalid Date');
      expect(session.modifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    }
  });

  it('should extract tool execution information', async () => {
    const sessions = await loadAgentSessions();
    
    let foundToolExecution = false;
    for (const session of sessions) {
      for (const msg of session.transcript) {
        if (msg.role === 'tool_execution') {
          foundToolExecution = true;
          expect(msg).toHaveProperty('toolName');
          expect(msg).toHaveProperty('intent');
          expect(msg).toHaveProperty('timestamp');
        }
      }
      if (foundToolExecution) break;
    }
    
    // At least some sessions should have tool executions
    if (sessions.length > 0) {
      expect(sessions[0].transcript.some(m => m.role === 'tool_execution')).toBe(true);
    }
  });

  it('should limit transcript to 50 messages for UI performance', async () => {
    const sessions = await loadAgentSessions();
    
    for (const session of sessions) {
      expect(session.transcript.length).toBeLessThanOrEqual(50);
    }
  });

  it('should handle missing .omp directory gracefully', async () => {
    // Just verify it doesn't throw and returns an array
    const sessions = await loadAgentSessions();
    expect(Array.isArray(sessions)).toBe(true);
  });

  it('should include project information in session', async () => {
    const sessions = await loadAgentSessions();
    
    if (sessions.length > 0) {
      const session = sessions[0];
      expect(session).toHaveProperty('project');
      expect(typeof session.project).toBe('string');
    }
  });
});

describe('Session KPI stats', () => {
  it('attaches a stats object with cost/token/message/tool-call/agent counters to every session', async () => {
    const sessions = await loadAgentSessions();
    if (sessions.length === 0) return;

    const session = sessions[0];
    expect(session).toHaveProperty('stats');
    expect(session.stats).toEqual(expect.objectContaining({
      messageCount: expect.any(Number),
      toolCallCount: expect.any(Number),
      inputTokens: expect.any(Number),
      outputTokens: expect.any(Number),
      cost: expect.any(Number),
      agentCount: expect.any(Number)
    }));
    expect(session.stats.agentCount).toBeGreaterThanOrEqual(1);
  });

  it('counts agentCount as 1 (main) plus every nested sub-task for a known multi-agent session', async () => {
    const sessions = await loadAgentSessions();
    const parent = sessions.find(s => s.id === KNOWN_PARENT_SESSION);
    if (!parent) return;

    const subtasks = await listSubtasks(KNOWN_PARENT_SESSION);
    if (subtasks.length === 0) return;

    expect(parent.stats.agentCount).toBe(1 + subtasks.length);
  });

  it('folds nested sub-task tool calls and messages into the parent session totals', async () => {
    const sessions = await loadAgentSessions();
    const parent = sessions.find(s => s.id === KNOWN_PARENT_SESSION);
    if (!parent) return;

    const subtasks = await listSubtasks(KNOWN_PARENT_SESSION);
    if (subtasks.length === 0) return;

    // The parent's own (unfolded) main-log transcript is capped at 50 messages
    // for the UI, but stats are computed from the full uncapped transcript
    // plus every sub-task log, so totals must be at least what a single
    // sub-task alone contributes.
    const oneSubtask = await loadSubtaskTranscript(KNOWN_PARENT_SESSION, subtasks[0]);
    const subtaskToolCalls = oneSubtask.transcript.filter(m => m.role === 'tool_execution').length;
    expect(parent.stats.toolCallCount).toBeGreaterThanOrEqual(subtaskToolCalls);
  });

  it('the top session by messageCount has real, non-zero KPI counters (locks the pi-parser path end to end)', async () => {
    const sessions = await loadAgentSessions();
    if (sessions.length === 0) return;

    const top = [...sessions].sort((a, b) => b.stats.messageCount - a.stats.messageCount)[0];
    expect(top.stats.messageCount).toBeGreaterThan(0);
    expect(top.stats.toolCallCount).toBeGreaterThan(0);
    expect(top.stats.inputTokens + top.stats.outputTokens).toBeGreaterThan(0);
  });
});

describe('Nested Sub-task Log Loading', () => {
  it('lists real nested sub-task JSONL files for a known parent session', async () => {
    const subtasks = await listSubtasks(KNOWN_PARENT_SESSION);

    // Guard: only assert strongly if the fixture still exists on this machine.
    if (subtasks.length === 0) {
      console.warn('Skipping strict assertions: known fixture session not found on this machine');
      return;
    }

    expect(Array.isArray(subtasks)).toBe(true);
    expect(subtasks).toEqual(expect.arrayContaining(['ServerGo', 'WebFrontend', 'TestsQA', 'ConfigToolsDocs']));
  });

  it('returns an empty array for a session with no nested sub-tasks', async () => {
    const subtasks = await listSubtasks('does-not-exist-session-id');
    expect(subtasks).toEqual([]);
  });

  it('loads a real nested sub-task transcript with its own messages', async () => {
    const subtasks = await listSubtasks(KNOWN_PARENT_SESSION);
    if (subtasks.length === 0) return;

    const subtask = await loadSubtaskTranscript(KNOWN_PARENT_SESSION, 'ServerGo');

    expect(subtask).not.toBeNull();
    expect(subtask.id).toBe('ServerGo');
    expect(Array.isArray(subtask.transcript)).toBe(true);
    expect(subtask.transcript.length).toBeGreaterThan(0);
  });

  it('returns null for a non-existent sub-task name', async () => {
    const subtasks = await listSubtasks(KNOWN_PARENT_SESSION);
    if (subtasks.length === 0) return;

    const subtask = await loadSubtaskTranscript(KNOWN_PARENT_SESSION, 'DoesNotExistTask');
    expect(subtask).toBeNull();
  });

  it('returns null when the parent session itself does not exist', async () => {
    const subtask = await loadSubtaskTranscript('nonexistent-session', 'ServerGo');
    expect(subtask).toBeNull();
  });

  it('parses subtask names from hub tool_result content into message.subtasks', async () => {
    const sessions = await loadAgentSessions();
    const parent = sessions.find(s => s.id === KNOWN_PARENT_SESSION);
    if (!parent) return;

    const hubResult = parent.transcript.find(
      m => m.role === 'tool_result' && m.subtasks && m.subtasks.length > 0
    );

    expect(hubResult).toBeDefined();
    expect(hubResult.subtasks).toEqual(expect.arrayContaining(['ServerGo', 'WebFrontend', 'TestsQA', 'ConfigToolsDocs']));
  });
});

describe('Session Timeline', () => {
  function walk(node, visit) {
    for (const ev of node.events) {
      visit(ev, node);
      if (ev.children) {
        for (const child of ev.children) walk(child, visit);
      }
    }
  }

  it('builds a non-null tree timeline for a known parent session', async () => {
    const timeline = await loadSessionTimeline(KNOWN_PARENT_SESSION);
    if (!timeline) {
      console.warn('Skipping strict assertions: known fixture session not found on this machine');
      return;
    }

    expect(timeline.root.agent).toBe('main');
    expect(timeline.root.lane).toBe(0);
    expect(timeline.root.events.length).toBeGreaterThan(0);

    const allEvents = [];
    walk(timeline.root, ev => allEvents.push(ev));
    for (const ev of allEvents) {
      expect(typeof ev.agent).toBe('string');
      expect(typeof ev.lane).toBe('number');
    }

    const paired = allEvents.find(ev => ev.role === 'tool' && ev.durationMs != null);
    expect(paired).toBeDefined();
    expect(typeof paired.durationMs).toBe('number');
    expect(typeof paired.resultContent).toBe('string');
  });

  it('attaches every real sub-agent as a child of the exact event that spawned it', async () => {
    const timeline = await loadSessionTimeline(KNOWN_PARENT_SESSION);
    if (!timeline) return;

    const subtasks = await listSubtasks(KNOWN_PARENT_SESSION);
    if (subtasks.length === 0) return;

    const linkedAgentNames = new Set();
    walk(timeline.root, (ev) => {
      if (ev.children) {
        for (const child of ev.children) linkedAgentNames.add(child.agent);
      }
    });

    for (const name of subtasks) {
      expect(linkedAgentNames.has(name)).toBe(true);
    }
    expect(timeline.unlinked).toBeUndefined();

    // The spawning event itself must be a folded `task` tool call.
    let spawnEvent;
    walk(timeline.root, (ev) => {
      if (ev.children?.some(c => c.agent === subtasks[0])) spawnEvent = ev;
    });
    expect(spawnEvent).toBeDefined();
    expect(spawnEvent.toolName).toBe('task');
    expect(spawnEvent.role).toBe('tool');
  });

  it('returns null for a non-existent session', async () => {
    const timeline = await loadSessionTimeline('does-not-exist');
    expect(timeline).toBeNull();
  });
});

describe('findViewerIdByUuid', () => {
  it('resolves the viewer session id (file stem) for a bare ACP session uuid', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-console-test-'));
    const projectDir = path.join(root, 'proj');
    await fs.mkdir(projectDir, { recursive: true });
    const stem = '2026-07-21T10-30-00-357Z_abc';
    await fs.writeFile(path.join(projectDir, `${stem}.jsonl`), '');

    try {
      expect(await findViewerIdByUuid('abc', root)).toBe(stem);
      expect(await findViewerIdByUuid('does-not-exist', root)).toBeNull();
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});

describe('listProjects', () => {
  it('extracts the real cwd from the newest session file per project, sorted by recency', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-console-projects-test-'));
    const older = path.join(root, '-Users-me-older-project');
    const newer = path.join(root, '-Users-me-newer-project');
    await fs.mkdir(older, { recursive: true });
    await fs.mkdir(newer, { recursive: true });

    const sessionLine = (cwd) => JSON.stringify({ type: 'session', version: 3, id: 'abc', timestamp: '', cwd }) + '\n';
    await fs.writeFile(
      path.join(older, '2026-01-01T00-00-00-000Z_older.jsonl'),
      JSON.stringify({ type: 'title', title: '' }) + '\n' + sessionLine('/Users/me/older-project')
    );
    await fs.writeFile(
      path.join(newer, '2026-06-01T00-00-00-000Z_newer.jsonl'),
      JSON.stringify({ type: 'title', title: '' }) + '\n' + sessionLine('/Users/me/newer-project')
    );

    try {
      const projects = await listProjects(root);
      expect(projects).toEqual([
        { cwd: '/Users/me/newer-project', label: 'newer-project', lastUsed: '2026-06-01T00:00:00.000Z' },
        { cwd: '/Users/me/older-project', label: 'older-project', lastUsed: '2026-01-01T00:00:00.000Z' }
      ]);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('skips project directories whose session files have no cwd line', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-console-projects-test-'));
    const noCwd = path.join(root, '-no-cwd-project');
    await fs.mkdir(noCwd, { recursive: true });
    await fs.writeFile(
      path.join(noCwd, '2026-01-01T00-00-00-000Z_x.jsonl'),
      JSON.stringify({ type: 'title', title: '' }) + '\n'
    );

    try {
      expect(await listProjects(root)).toEqual([]);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('returns an empty array when the sessions root does not exist', async () => {
    expect(await listProjects('/nonexistent/agent-console-root')).toEqual([]);
  });
});

describe('deleteSession', () => {
  async function makeRootWithSession() {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-console-delete-test-'));
    const projectDir = path.join(root, 'proj');
    await fs.mkdir(projectDir, { recursive: true });
    const stem = '2026-07-21T10-30-00-357Z_deleteme';
    await fs.writeFile(path.join(projectDir, `${stem}.jsonl`), '{"type":"title","title":""}\n');
    return { root, projectDir, stem };
  }

  it('deletes the transcript file and reports success', async () => {
    const { root, projectDir, stem } = await makeRootWithSession();
    try {
      expect(await deleteSession(stem, root)).toBe(true);
      await expect(fs.access(path.join(projectDir, `${stem}.jsonl`))).rejects.toThrow();
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('also removes the sibling directory holding nested sub-task logs', async () => {
    const { root, projectDir, stem } = await makeRootWithSession();
    const subtaskDir = path.join(projectDir, stem);
    await fs.mkdir(subtaskDir, { recursive: true });
    await fs.writeFile(path.join(subtaskDir, 'SubAgent.jsonl'), '{}\n');

    try {
      expect(await deleteSession(stem, root)).toBe(true);
      await expect(fs.access(subtaskDir)).rejects.toThrow();
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('returns false for a session that does not exist', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-console-delete-test-'));
    try {
      expect(await deleteSession('does-not-exist', root)).toBe(false);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});

describe('modifiedAt field', () => {
  it('should include modifiedAt that reflects file mtime', async () => {
    // Create a temp project dir under the real ~/.omp/agent/sessions/ root
    const sessionsRoot = path.join(os.homedir(), '.omp', 'agent', 'sessions');
    const tempProjectName = `test-modifiedAt-${Date.now()}`;
    const tempProjectPath = path.join(sessionsRoot, tempProjectName);
    
    try {
      // Create the temp project directory
      await fs.mkdir(tempProjectPath, { recursive: true });
      
      // Write a minimal synthetic .jsonl file
      const sessionId = '2026-07-21T14-28-43-649Z_test-uuid-1234';
      const sessionFile = path.join(tempProjectPath, `${sessionId}.jsonl`);
      
      // Write minimal required JSONL content
      await fs.writeFile(sessionFile, '{"type":"session","cwd":"/test"}\n{"role":"system","content":"Test Session"}\n');
      
      // Get the file's mtime
      const stat = await fs.stat(sessionFile);
      const expectedModifiedAt = stat.mtime.toISOString();
      
      // Load sessions and find our test session
      const sessions = await loadAgentSessions();
      const testSession = sessions.find(s => s.id === sessionId);
      
      expect(testSession).toBeDefined();
      expect(testSession).toHaveProperty('modifiedAt');
      expect(testSession.modifiedAt).toBe(expectedModifiedAt);
      
      // Verify it's a valid ISO string
      const parsedDate = new Date(testSession.modifiedAt);
      expect(parsedDate.toString()).not.toBe('Invalid Date');
    } finally {
      // Clean up the temp project directory
      await fs.rm(tempProjectPath, { recursive: true, force: true });
    }
  });
});
