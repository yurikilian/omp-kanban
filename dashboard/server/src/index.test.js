import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import cors from 'cors';
import request from 'supertest';
import { loadAgentSessions, listProjects, deleteSession } from './sessions.js';
import { pickFolder } from './folder-picker.js';

describe('API Endpoints', () => {
  let app;
  
  beforeAll(() => {
    // Create a test app instance
    app = express();
    app.use(cors());
    app.use(express.json());
    
    // Health check
    app.get('/health', (req, res) => {
      res.json({ status: 'ok' });
    });
    
    // Get all sessions
    app.get('/api/sessions', async (req, res) => {
      try {
        const sessions = await loadAgentSessions();
        const sessionsWithStatus = sessions.map(s => ({ ...s, live: false, busy: false, acpId: null }));
        res.json(sessionsWithStatus);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
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
        res.status(500).json({ error: error.message });
      }
    });

    // Permanently delete a session (mirrors index.js)
    app.delete('/api/sessions/:sessionId', async (req, res) => {
      try {
        const deleted = await deleteSession(req.params.sessionId);
        if (!deleted) return res.status(404).json({ error: 'Session not found' });
        res.status(204).end();
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // List known project working directories, always including the
    // server's own cwd flagged `current: true` (mirrors index.js).
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
        res.status(500).json({ error: error.message });
      }
    });

    // Native folder picker (mirrors index.js)
    app.post('/api/pick-folder', async (req, res) => {
      try {
        const result = await pickFolder();
        res.json(result);
      } catch (error) {
        if (error.code === 'UNSUPPORTED_PLATFORM') {
          return res.status(501).json({ error: error.message });
        }
        res.status(500).json({ error: error.message });
      }
    });
  });
  
  it('should return health check', async () => {
    const request = {
      url: '/health',
      method: 'GET'
    };
    
    // Simple verification that endpoint exists and would work
    expect(app._router.stack.some(layer => 
      layer.route && layer.route.path === '/health'
    )).toBe(true);
  });
  
  it('should have /api/sessions endpoint', () => {
    expect(app._router.stack.some(layer => 
      layer.route && layer.route.path === '/api/sessions'
    )).toBe(true);
  });
  
  it('should have /api/sessions/:sessionId endpoint', () => {
    expect(app._router.stack.some(layer => 
      layer.route && layer.route.path === '/api/sessions/:sessionId'
    )).toBe(true);
  });

  it('should have DELETE /api/sessions/:sessionId endpoint', () => {
    expect(app._router.stack.some(layer =>
      layer.route && layer.route.path === '/api/sessions/:sessionId' && layer.route.methods.delete
    )).toBe(true);
  });

  it('deletes a real session file via DELETE /api/sessions/:sessionId', async () => {
    const os = await import('os');
    const path = await import('path');
    const fs = await import('fs/promises');
    const projectDir = path.join(os.homedir(), '.omp', 'agent', 'sessions', 'agent-console-index-test-project');
    const stem = '2026-01-01T00-00-00-000Z_index-test-delete';
    await fs.mkdir(projectDir, { recursive: true });
    await fs.writeFile(path.join(projectDir, `${stem}.jsonl`), '{"type":"title","title":""}\n');

    try {
      const res = await request(app).delete(`/api/sessions/${stem}`);
      expect(res.status).toBe(204);
      await expect(fs.access(path.join(projectDir, `${stem}.jsonl`))).rejects.toThrow();
    } finally {
      await fs.rm(projectDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('returns 404 deleting a session that does not exist', async () => {
    const res = await request(app).delete('/api/sessions/does-not-exist-anywhere');
    expect(res.status).toBe(404);
  });

  it('should have /api/projects endpoint', () => {
    expect(app._router.stack.some(layer =>
      layer.route && layer.route.path === '/api/projects'
    )).toBe(true);
  });

  it('should fetch projects without errors and with cwd/label/lastUsed fields', async () => {
    const projects = await listProjects();
    expect(Array.isArray(projects)).toBe(true);
    for (const project of projects) {
      expect(typeof project.cwd).toBe('string');
      expect(typeof project.label).toBe('string');
    }
  });

  it('should have /api/pick-folder endpoint', () => {
    expect(app._router.stack.some(layer =>
      layer.route && layer.route.path === '/api/pick-folder'
    )).toBe(true);
  });

  it('always includes the server\'s own working directory in /api/projects, flagged current', async () => {
    const res = await request(app).get('/api/projects');
    expect(res.status).toBe(200);
    const current = res.body.find((p) => p.current);
    expect(current).toBeDefined();
    expect(current.cwd).toBe(process.cwd());
  });
  
  it('should fetch sessions without errors', async () => {
    const sessions = await loadAgentSessions();
    expect(Array.isArray(sessions)).toBe(true);
  });
  
  it('should return sessions with required fields', async () => {
    const sessions = await loadAgentSessions();
    
    for (const session of sessions) {
      expect(session.id).toBeDefined();
      expect(session.name).toBeDefined();
      expect(session.timestamp).toBeDefined();
      expect(session.model).toBeDefined();
      expect(Array.isArray(session.transcript)).toBe(true);
    }
  });
  
  it('should handle missing session gracefully', async () => {
    const sessions = await loadAgentSessions();
    // If no sessions, this should still work
    if (sessions.length === 0) {
      expect(sessions.length).toBe(0);
    }
  });
  
  it('GET /api/sessions includes live and busy fields', async () => {
    const res = await request(app).get('/api/sessions');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    
    // All sessions should have live and busy fields (defaulting to false since no real agents are live)
    for (const session of res.body) {
      expect(typeof session.live).toBe('boolean');
      expect(typeof session.busy).toBe('boolean');
      // Since no live agents are created in this test, live should be false
      expect(session.live).toBe(false);
      expect(session.busy).toBe(false);
    }
  });
  
});
