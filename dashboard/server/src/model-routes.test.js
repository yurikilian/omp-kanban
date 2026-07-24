import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { registerModelRoutes } from './model-routes.js';

describe('model-routes', () => {
  let app;
  let fakeOmpConfig;
  let fakeListAllAgents;

  beforeEach(() => {
    fakeOmpConfig = {
      listModels: vi.fn(async () => [
        {
          provider: 'anthropic',
          id: 'claude-sonnet-5',
          selector: 'anthropic/claude-sonnet-5',
          name: 'Claude Sonnet 5',
          contextWindow: 200000,
          maxTokens: 16000,
          reasoning: false,
          thinking: null,
          input: 0,
          cost: 0
        }
      ]),
      getConfigValue: vi.fn(async (key) => {
        if (key === 'modelRoles') {
          return {
            key: 'modelRoles',
            value: { default: 'anthropic/claude-sonnet-5', smol: 'anthropic/claude-haiku-4-5' },
            type: 'record',
            description: 'Model roles'
          };
        }
        if (key === 'task.agentModelOverrides') {
          return {
            key: 'task.agentModelOverrides',
            value: { scout: 'anthropic/claude-haiku-4-5' },
            type: 'record',
            description: 'Agent overrides'
          };
        }
        return { key, value: {}, type: 'record' };
      }),
      setConfigValue: vi.fn(async (key, value) => {
        return { key, value, type: 'record' };
      }),
      resetConfigValue: vi.fn(async (key) => {
        return { key, value: {}, type: 'record' };
      })
    };

    fakeListAllAgents = vi.fn(async () => [
      { name: 'scout', source: 'bundled', description: 'Scout agent' },
      { name: 'designer', source: 'bundled', description: 'Designer agent' }
    ]);

    app = express();
    app.use(express.json());
    registerModelRoutes(app, {
      ompConfig: fakeOmpConfig,
      listAllAgents: fakeListAllAgents
    });
  });

  describe('GET /api/models', () => {
    it('returns models list from ompConfig', async () => {
      const res = await request(app).get('/api/models');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].selector).toBe('anthropic/claude-sonnet-5');
      expect(fakeOmpConfig.listModels).toHaveBeenCalled();
    });

    it('returns 500 on ompConfig error', async () => {
      fakeOmpConfig.listModels.mockRejectedValueOnce(new Error('API error'));
      const res = await request(app).get('/api/models');
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('API error');
    });
  });

  describe('GET /api/agents', () => {
    it('returns agents list from listAllAgents', async () => {
      const res = await request(app).get('/api/agents');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(2);
      expect(res.body[0].name).toBe('scout');
      expect(fakeListAllAgents).toHaveBeenCalled();
    });

    it('returns 500 on listAllAgents error', async () => {
      fakeListAllAgents.mockRejectedValueOnce(new Error('Read error'));
      const res = await request(app).get('/api/agents');
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Read error');
    });
  });

  describe('GET /api/model-roles', () => {
    it('returns current model roles from config', async () => {
      const res = await request(app).get('/api/model-roles');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ default: 'anthropic/claude-sonnet-5', smol: 'anthropic/claude-haiku-4-5' });
    });

    it('returns empty object when model roles are not set', async () => {
      fakeOmpConfig.getConfigValue.mockResolvedValueOnce({ key: 'modelRoles', value: null });
      const res = await request(app).get('/api/model-roles');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({});
    });

    it('returns 500 on getConfigValue error', async () => {
      fakeOmpConfig.getConfigValue.mockRejectedValueOnce(new Error('Config error'));
      const res = await request(app).get('/api/model-roles');
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Config error');
    });
  });

  describe('PUT /api/model-roles/:role', () => {
    it('merges new role into existing model roles', async () => {
      const res = await request(app)
        .put('/api/model-roles/slow')
        .send({ model: 'anthropic/claude-sonnet-5:high' });
      
      expect(res.status).toBe(200);
      expect(fakeOmpConfig.setConfigValue).toHaveBeenCalledWith(
        'modelRoles',
        {
          default: 'anthropic/claude-sonnet-5',
          smol: 'anthropic/claude-haiku-4-5',
          slow: 'anthropic/claude-sonnet-5:high'
        }
      );
    });

    it('updates existing role', async () => {
      const res = await request(app)
        .put('/api/model-roles/default')
        .send({ model: 'anthropic/claude-haiku-4-5' });
      
      expect(res.status).toBe(200);
      expect(fakeOmpConfig.setConfigValue).toHaveBeenCalledWith(
        'modelRoles',
        {
          default: 'anthropic/claude-haiku-4-5',
          smol: 'anthropic/claude-haiku-4-5'
        }
      );
    });

    it('returns 400 when model is missing', async () => {
      const res = await request(app)
        .put('/api/model-roles/slow')
        .send({});
      
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('model is required');
      expect(fakeOmpConfig.setConfigValue).not.toHaveBeenCalled();
    });

    it('returns 400 when model is empty string', async () => {
      const res = await request(app)
        .put('/api/model-roles/slow')
        .send({ model: '' });
      
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('model is required');
      expect(fakeOmpConfig.setConfigValue).not.toHaveBeenCalled();
    });

    it('returns 400 when model is null', async () => {
      const res = await request(app)
        .put('/api/model-roles/slow')
        .send({ model: null });
      
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('model is required');
      expect(fakeOmpConfig.setConfigValue).not.toHaveBeenCalled();
    });

    it('returns 400 on setConfigValue error', async () => {
      fakeOmpConfig.setConfigValue.mockRejectedValueOnce(new Error('Set error'));
      const res = await request(app)
        .put('/api/model-roles/slow')
        .send({ model: 'anthropic/claude-sonnet-5' });
      
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Set error');
    });
  });

  describe('GET /api/agent-model-overrides', () => {
    it('returns current agent model overrides from config', async () => {
      const res = await request(app).get('/api/agent-model-overrides');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ scout: 'anthropic/claude-haiku-4-5' });
    });

    it('returns empty object when overrides are not set', async () => {
      fakeOmpConfig.getConfigValue.mockResolvedValueOnce({ key: 'task.agentModelOverrides', value: null });
      const res = await request(app).get('/api/agent-model-overrides');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({});
    });

    it('returns 500 on getConfigValue error', async () => {
      fakeOmpConfig.getConfigValue.mockRejectedValueOnce(new Error('Config error'));
      const res = await request(app).get('/api/agent-model-overrides');
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Config error');
    });
  });

  describe('PUT /api/agent-model-overrides/:agentName', () => {
    it('adds or updates agent model override', async () => {
      const res = await request(app)
        .put('/api/agent-model-overrides/designer')
        .send({ model: 'anthropic/claude-sonnet-5:high' });
      
      expect(res.status).toBe(200);
      expect(fakeOmpConfig.setConfigValue).toHaveBeenCalledWith(
        'task.agentModelOverrides',
        {
          scout: 'anthropic/claude-haiku-4-5',
          designer: 'anthropic/claude-sonnet-5:high'
        }
      );
    });

    it('removes agent override when model is empty string', async () => {
      const res = await request(app)
        .put('/api/agent-model-overrides/scout')
        .send({ model: '' });
      
      expect(res.status).toBe(200);
      expect(fakeOmpConfig.setConfigValue).toHaveBeenCalledWith(
        'task.agentModelOverrides',
        {} // scout removed
      );
    });

    it('removes agent override when model is null', async () => {
      const res = await request(app)
        .put('/api/agent-model-overrides/scout')
        .send({ model: null });
      
      expect(res.status).toBe(200);
      expect(fakeOmpConfig.setConfigValue).toHaveBeenCalledWith(
        'task.agentModelOverrides',
        {} // scout removed
      );
    });

    it('removes agent override when model is not provided', async () => {
      const res = await request(app)
        .put('/api/agent-model-overrides/scout')
        .send({});
      
      expect(res.status).toBe(200);
      expect(fakeOmpConfig.setConfigValue).toHaveBeenCalledWith(
        'task.agentModelOverrides',
        {} // scout removed
      );
    });

    it('returns 400 on setConfigValue error', async () => {
      fakeOmpConfig.setConfigValue.mockRejectedValueOnce(new Error('Set error'));
      const res = await request(app)
        .put('/api/agent-model-overrides/scout')
        .send({ model: 'anthropic/claude-sonnet-5' });
      
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Set error');
    });
  });
});
