import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { registerPrefRoutes } from './pref-routes.js';
import { db } from './db.js';

describe('pref-routes', () => {
  let app;
  const keys = [];

  beforeEach(() => {
    app = express();
    app.use(express.json());
    registerPrefRoutes(app);
  });

  afterEach(() => {
    for (const key of keys.splice(0)) {
      db.prepare('DELETE FROM preferences WHERE key = ?').run(key);
    }
    vi.restoreAllMocks();
  });

  it('PUT /api/preferences merges into the stored object, GET /api/preferences returns it', async () => {
    const key = `test.pref.${Date.now()}`;
    keys.push(key);

    const putRes = await request(app)
      .put('/api/preferences')
      .send({ [key]: { sidebarWidth: 280 } });
    expect(putRes.status).toBe(200);
    expect(putRes.body[key]).toEqual({ sidebarWidth: 280 });

    const getRes = await request(app).get('/api/preferences');
    expect(getRes.status).toBe(200);
    expect(getRes.body[key]).toEqual({ sidebarWidth: 280 });
  });

  it('PUT /api/preferences merges without clobbering previously set keys', async () => {
    const key = `test.pref.${Date.now()}.a`;
    const otherKey = `test.pref.${Date.now()}.b`;
    keys.push(key, otherKey);

    await request(app).put('/api/preferences').send({ [key]: 'first' });
    const res = await request(app).put('/api/preferences').send({ [otherKey]: 'second' });

    expect(res.body[key]).toBe('first');
    expect(res.body[otherKey]).toBe('second');
  });

  it('GET /api/preferences returns 500 on unexpected failure', async () => {
    vi.spyOn(db, 'prepare').mockImplementation(() => {
      throw new Error('boom');
    });

    const res = await request(app).get('/api/preferences');
    expect(res.status).toBe(500);
    expect(res.body.error).toContain('boom');
  });
});
