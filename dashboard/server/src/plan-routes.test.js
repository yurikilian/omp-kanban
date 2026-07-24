import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { registerPlanRoutes } from './plan-routes.js';
import { db } from './db.js';

describe('plan-routes', () => {
  let app;
  const createdIds = [];

  beforeEach(() => {
    app = express();
    app.use(express.json());
    registerPlanRoutes(app);
  });

  afterEach(() => {
    for (const id of createdIds.splice(0)) {
      db.prepare('DELETE FROM plans WHERE id = ?').run(id);
    }
    vi.restoreAllMocks();
  });

  it('full lifecycle: create -> get -> update -> delete', async () => {
    const createRes = await request(app)
      .post('/api/plans')
      .send({ slug: 'lifecycle-test', title: 'Lifecycle Plan', content: '# draft' });
    expect(createRes.status).toBe(201);
    expect(createRes.body.id).toBeTruthy();
    expect(createRes.body.slug).toBe('lifecycle-test');
    expect(createRes.body.title).toBe('Lifecycle Plan');
    expect(createRes.body.content).toBe('# draft');
    expect(createRes.body.status).toBe('draft');
    const { id } = createRes.body;
    createdIds.push(id);

    const getRes = await request(app).get(`/api/plans/${id}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body).toMatchObject({ id, title: 'Lifecycle Plan', content: '# draft' });

    const listRes = await request(app).get('/api/plans');
    expect(listRes.status).toBe(200);
    expect(Array.isArray(listRes.body)).toBe(true);
    expect(listRes.body.some((p) => p.id === id)).toBe(true);

    const updateRes = await request(app)
      .put(`/api/plans/${id}`)
      .send({ title: 'Updated Plan', status: 'active' });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.title).toBe('Updated Plan');
    expect(updateRes.body.status).toBe('active');
    expect(updateRes.body.content).toBe('# draft'); // untouched field preserved

    const deleteRes = await request(app).delete(`/api/plans/${id}`);
    expect(deleteRes.status).toBe(204);

    const afterDeleteRes = await request(app).get(`/api/plans/${id}`);
    expect(afterDeleteRes.status).toBe(404);

    createdIds.length = 0; // already deleted, skip cleanup
  });

  it('GET /api/plans/:id returns 404 for a missing plan', async () => {
    const res = await request(app).get('/api/plans/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error).toBeTruthy();
  });

  it('PUT /api/plans/:id returns 404 for a missing plan', async () => {
    const res = await request(app).put('/api/plans/does-not-exist').send({ title: 'x' });
    expect(res.status).toBe(404);
    expect(res.body.error).toBeTruthy();
  });

  it('DELETE /api/plans/:id returns 404 for a missing plan', async () => {
    const res = await request(app).delete('/api/plans/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error).toBeTruthy();
  });

  it('GET /api/plans returns 500 with the error message on unexpected failure', async () => {
    vi.spyOn(db, 'prepare').mockImplementation(() => {
      throw new Error('boom');
    });

    const res = await request(app).get('/api/plans');
    expect(res.status).toBe(500);
    expect(res.body.error).toContain('boom');
  });
});
