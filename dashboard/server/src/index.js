import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import fsSync from 'fs';
import path from 'path';
import { loadAgentSessions, listSubtasks, loadSubtaskTranscript, loadSessionTimeline, findViewerIdByUuid, resolveSessionForAcp, listProjects, deleteSession } from './sessions.js';
import { registerModelRoutes } from './model-routes.js';
import { registerConfigRoutes } from './config-routes.js';
import { registerPlanRoutes } from './plan-routes.js';
import { registerPrefRoutes } from './pref-routes.js';
import { getSessionMeta, upsertSessionMeta } from './db.js';
import { sessionWatcher } from './sessionWatch.js';
import { pickFolder } from './folder-picker.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '20mb' })); // default 100kb is too small for base64-encoded pasted images

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Get all sessions
app.get('/api/sessions', async (req, res) => {
  try {
    const sessions = await loadAgentSessions();
    const sessionsWithStatus = sessions.map(s => {
      const m = getSessionMeta(s.id);
      return {
        ...s,
        live: false,
        busy: false,
        acpId: null,
        name: m?.title ?? s.name,
        pinned: !!m?.pinned,
        archived: !!m?.archived,
        origin: m?.origin ?? 'terminal',
        plan_id: m?.plan_id ?? null
      };
    });
    res.json(sessionsWithStatus);
  } catch (error) {
    console.error('Error loading sessions:', error);
    res.status(500).json({ error: error.message });
  }
});

// List known project working directories (for the Agent Console's project picker).
// Always includes the server's own working directory, flagged `current: true`,
// so there's a sane default even with zero session history.
app.get('/api/projects', async (req, res) => {
  try {
    const projects = await listProjects();
    const cwd = process.cwd();
    const flagged = projects.map((p) => ({ ...p, current: p.cwd === cwd }));
    const result = flagged.some((p) => p.current)
      ? flagged
      : [{ cwd, label: cwd.split('/').filter(Boolean).pop() || cwd, lastUsed: null, current: true }, ...flagged];
    res.json(result);
  } catch (error) {
    console.error('Error listing projects:', error);
    res.status(500).json({ error: error.message });
  }
});

// Open the OS-native folder picker on the server's machine (local dev only:
// server and browser must be on the same host) and return the chosen path.
app.post('/api/pick-folder', async (req, res) => {
  try {
    const result = await pickFolder();
    res.json(result);
  } catch (error) {
    if (error.code === 'UNSUPPORTED_PLATFORM') {
      return res.status(501).json({ error: error.message });
    }
    console.error('Error picking folder:', error);
    res.status(500).json({ error: error.message });
  }
});

// Server-sent events for session file changes
app.get('/api/sessions/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.flushHeaders?.();

  const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
  send({ type: 'ready' });

  const onSessionChange = (change) => {
    const { ids, list } = change;
    if (list) {
      send({ type: 'sessions-changed' });
    }
    for (const id of ids) {
      send({ type: 'session-changed', id });
    }
  };

  sessionWatcher.on('change', onSessionChange);

  const pingInterval = setInterval(() => {
    res.write(': ping\n\n');
  }, 25000);

  req.on('close', () => {
    sessionWatcher.off('change', onSessionChange);
    clearInterval(pingInterval);
    res.end();
  });
});

// Get session transcript
app.get('/api/sessions/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const sessions = await loadAgentSessions();
    const session = sessions.find(s => s.id === sessionId);
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    const sessionWithStatus = { ...session, live: false, busy: false, acpId: null };
    res.json(sessionWithStatus);
  } catch (error) {
    console.error('Error loading session:', error);
    res.status(500).json({ error: error.message });
  }
});

// Permanently delete a session (transcript file + any nested sub-task logs)
app.delete('/api/sessions/:sessionId', async (req, res) => {
  try {
    const deleted = await deleteSession(req.params.sessionId);
    if (!deleted) return res.status(404).json({ error: 'Session not found' });
    res.status(204).end();
  } catch (error) {
    console.error('Error deleting session:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update dashboard-owned session metadata (title/pinned/archived/plan link).
// Left-joined back into GET /api/sessions above.
app.patch('/api/sessions/:sessionId', (req, res) => {
  try {
    const { title, pinned, archived, plan_id: planId } = req.body || {};
    const meta = upsertSessionMeta(req.params.sessionId, { title, pinned, archived, planId });
    res.json(meta);
  } catch (error) {
    console.error('Error updating session metadata:', error);
    res.status(500).json({ error: error.message });
  }
});

// List nested sub-task sessions spawned by this session (e.g. hub tasks)
app.get('/api/sessions/:sessionId/subtasks', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const subtasks = await listSubtasks(sessionId);
    res.json(subtasks);
  } catch (error) {
    console.error('Error listing subtasks:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get a specific nested sub-task's transcript, loaded lazily on demand
app.get('/api/sessions/:sessionId/subtasks/:taskName', async (req, res) => {
  try {
    const { sessionId, taskName } = req.params;
    const subtask = await loadSubtaskTranscript(sessionId, taskName);

    if (!subtask) {
      return res.status(404).json({ error: 'Subtask not found' });
    }

    res.json(subtask);
  } catch (error) {
    console.error('Error loading subtask:', error);
    res.status(500).json({ error: error.message });
  }
});

// Unified, chronological, multi-agent timeline for a session (main log
// merged with every nested sub-agent log, tool calls paired by toolCallId)
app.get('/api/sessions/:sessionId/timeline', async (req, res) => {
  try {
    const timeline = await loadSessionTimeline(req.params.sessionId);
    if (!timeline) return res.status(404).json({ error: 'Session not found' });
    res.json(timeline);
  } catch (error) {
    console.error('Error loading timeline:', error);
    res.status(500).json({ error: error.message });
  }
});

// Serve the built web assets when present (production/Electron). Dev keeps
// Vite on :5173 with a proxy to this server, so this is a no-op there.
const webDist = path.join(__dirname, '..', '..', 'web', 'dist');
if (fsSync.existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get(/^(?!\/api|\/health).*/, (req, res) => res.sendFile(path.join(webDist, 'index.html')));
}

// Read-only dashboard: no agent-session creation/attachment routes.
registerModelRoutes(app);
registerConfigRoutes(app);
registerPlanRoutes(app);
registerPrefRoutes(app);
sessionWatcher.start();


app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

function shutdown() {
  sessionWatcher.stop();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
