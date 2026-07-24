import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { registerConfigRoutes, COMMON_CONFIG_FIELDS } from './config-routes.js';

describe('config-routes', () => {
  let app;
  let fakeOmpConfig;

  beforeEach(() => {
    fakeOmpConfig = {
      getConfigList: vi.fn(),
      setConfigValue: vi.fn(),
      resetConfigValue: vi.fn(),
      listThemes: vi.fn().mockResolvedValue(['dark', 'light', 'titanium'])
    };
    app = express();
    app.use(express.json());
    registerConfigRoutes(app, { ompConfig: fakeOmpConfig });
  });

  it('GET /api/omp-config returns fields and values from getConfigList', async () => {
    fakeOmpConfig.getConfigList.mockResolvedValue({
      hideThinkingBlock: { value: false, type: 'boolean', description: 'Hide thinking blocks' },
      defaultThinkingLevel: { value: 'high', type: 'enum', description: 'Default thinking level' },
      'tools.approvalMode': { value: 'write', type: 'enum', description: 'Approval mode' }
    });

    const res = await request(app).get('/api/omp-config');
    expect(res.status).toBe(200);
    expect(res.body.fields).toStrictEqual(COMMON_CONFIG_FIELDS);
    expect(res.body.values).toEqual({
      hideThinkingBlock: false,
      defaultThinkingLevel: 'high',
      'tools.approvalMode': 'write'
    });
    expect(fakeOmpConfig.getConfigList).toHaveBeenCalled();
  });

  it('GET /api/omp-config includes suggestions for combobox fields and marks theme fields as combobox', async () => {
    fakeOmpConfig.getConfigList.mockResolvedValue({
      'theme.dark': { value: 'obsidian', type: 'string', description: 'Theme used on dark backgrounds' }
    });

    const res = await request(app).get('/api/omp-config');
    expect(res.status).toBe(200);
    const darkField = res.body.fields.find((f) => f.key === 'theme.dark');
    expect(darkField).toMatchObject({ key: 'theme.dark', type: 'combobox' });
    expect(res.body.suggestions['theme.dark']).toEqual(['dark', 'light', 'titanium']);
    expect(res.body.descriptions['theme.dark']).toBe('Theme used on dark backgrounds');
    expect(fakeOmpConfig.listThemes).toHaveBeenCalled();
  });

  it('GET /api/omp-config handles missing fields gracefully', async () => {
    fakeOmpConfig.getConfigList.mockResolvedValue({});

    const res = await request(app).get('/api/omp-config');
    expect(res.status).toBe(200);
    expect(res.body.fields).toStrictEqual(COMMON_CONFIG_FIELDS);
    expect(res.body.values).toEqual(
      Object.fromEntries(COMMON_CONFIG_FIELDS.map((f) => [f.key, undefined]))
    );
  });

  it('PUT /api/omp-config/:key on whitelisted key calls setConfigValue', async () => {
    fakeOmpConfig.setConfigValue.mockResolvedValue({
      key: 'hideThinkingBlock',
      value: true,
      type: 'boolean'
    });

    const res = await request(app)
      .put('/api/omp-config/hideThinkingBlock')
      .send({ value: true });

    expect(res.status).toBe(200);
    expect(fakeOmpConfig.setConfigValue).toHaveBeenCalledWith('hideThinkingBlock', true);
    expect(res.body.value).toBe(true);
  });

  it('PUT /api/omp-config/:key on unknown key returns 404 without calling setConfigValue', async () => {
    const res = await request(app)
      .put('/api/omp-config/not.a.real.key')
      .send({ value: 'something' });

    expect(res.status).toBe(404);
    expect(res.body.error).toContain('Unknown setting');
    expect(fakeOmpConfig.setConfigValue).not.toHaveBeenCalled();
  });

  it('PUT /api/omp-config/:key with enum value calls setConfigValue', async () => {
    fakeOmpConfig.setConfigValue.mockResolvedValue({
      key: 'compaction.strategy',
      value: 'handoff',
      type: 'enum'
    });

    const res = await request(app)
      .put('/api/omp-config/compaction.strategy')
      .send({ value: 'handoff' });

    expect(res.status).toBe(200);
    expect(fakeOmpConfig.setConfigValue).toHaveBeenCalledWith('compaction.strategy', 'handoff');
  });

  it('PUT /api/omp-config/:key with number value calls setConfigValue', async () => {
    fakeOmpConfig.setConfigValue.mockResolvedValue({
      key: 'tools.maxTimeout',
      value: 60,
      type: 'number'
    });

    const res = await request(app)
      .put('/api/omp-config/tools.maxTimeout')
      .send({ value: 60 });

    expect(res.status).toBe(200);
    expect(fakeOmpConfig.setConfigValue).toHaveBeenCalledWith('tools.maxTimeout', 60);
  });

  it('POST /api/omp-config/:key/reset on whitelisted key calls resetConfigValue', async () => {
    fakeOmpConfig.resetConfigValue.mockResolvedValue({
      key: 'hideThinkingBlock',
      value: false,
      type: 'boolean'
    });

    const res = await request(app).post('/api/omp-config/hideThinkingBlock/reset');

    expect(res.status).toBe(200);
    expect(fakeOmpConfig.resetConfigValue).toHaveBeenCalledWith('hideThinkingBlock');
    expect(res.body.value).toBe(false);
  });

  it('POST /api/omp-config/:key/reset on unknown key returns 404 without calling resetConfigValue', async () => {
    const res = await request(app).post('/api/omp-config/not.a.real.key/reset');

    expect(res.status).toBe(404);
    expect(res.body.error).toContain('Unknown setting');
    expect(fakeOmpConfig.resetConfigValue).not.toHaveBeenCalled();
  });

  it('PUT handles setConfigValue errors as 400', async () => {
    fakeOmpConfig.setConfigValue.mockRejectedValue(new Error('Invalid value'));

    const res = await request(app)
      .put('/api/omp-config/hideThinkingBlock')
      .send({ value: 'invalid' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Invalid value');
  });

  it('POST reset handles resetConfigValue errors as 400', async () => {
    fakeOmpConfig.resetConfigValue.mockRejectedValue(new Error('Reset failed'));

    const res = await request(app).post('/api/omp-config/hideThinkingBlock/reset');

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Reset failed');
  });

  it('GET handles getConfigList errors as 500', async () => {
    fakeOmpConfig.getConfigList.mockRejectedValue(new Error('Config load failed'));

    const res = await request(app).get('/api/omp-config');

    expect(res.status).toBe(500);
    expect(res.body.error).toContain('Config load failed');
  });
});
