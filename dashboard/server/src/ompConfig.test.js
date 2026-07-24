import { describe, it, expect, vi } from 'vitest';
import { createOmpConfigClient } from './ompConfig.js';

// Matches Node's execFile(file, args, options, callback) signature exactly.
function fakeExecFn(handler) {
  return vi.fn((bin, args, options, cb) => {
    try {
      const { stdout = '', stderr = '' } = handler(args) || {};
      cb(null, stdout, stderr);
    } catch (err) {
      cb(err, '', err.stderr || err.message || '');
    }
  });
}

describe('ompConfig', () => {
  it('getConfigList parses the JSON object', async () => {
    const execFn = fakeExecFn((args) => {
      expect(args).toEqual(['config', 'list', '--json']);
      return { stdout: JSON.stringify({ modelRoles: { value: { default: 'anthropic/claude-sonnet-5' } } }) };
    });
    const client = createOmpConfigClient({ execFn });
    const result = await client.getConfigList();
    expect(result.modelRoles.value.default).toBe('anthropic/claude-sonnet-5');
  });

  it('getConfigValue returns the parsed {key,value,type,description}', async () => {
    const execFn = fakeExecFn((args) => {
      expect(args).toEqual(['config', 'get', 'modelRoles', '--json']);
      return { stdout: JSON.stringify({ key: 'modelRoles', value: { default: 'x' }, type: 'record', description: '' }) };
    });
    const client = createOmpConfigClient({ execFn });
    const result = await client.getConfigValue('modelRoles');
    expect(result).toEqual({ key: 'modelRoles', value: { default: 'x' }, type: 'record', description: '' });
  });

  it('setConfigValue calls set then re-gets the canonical value', async () => {
    const calls = [];
    const execFn = fakeExecFn((args) => {
      calls.push(args);
      if (args[1] === 'set') return { stdout: JSON.stringify({ ok: true }) };
      return { stdout: JSON.stringify({ key: 'task.agentModelOverrides', value: { scout: 'anthropic/claude-haiku-4-5' }, type: 'record', description: '' }) };
    });
    const client = createOmpConfigClient({ execFn });
    const result = await client.setConfigValue('task.agentModelOverrides', { scout: 'anthropic/claude-haiku-4-5' });

    expect(calls[0]).toEqual(['config', 'set', 'task.agentModelOverrides', '{"scout":"anthropic/claude-haiku-4-5"}', '--json']);
    expect(calls[1]).toEqual(['config', 'get', 'task.agentModelOverrides', '--json']);
    expect(result.value).toEqual({ scout: 'anthropic/claude-haiku-4-5' });
  });

  it('setConfigValue passes string values through without JSON-wrapping', async () => {
    const calls = [];
    const execFn = fakeExecFn((args) => {
      calls.push(args);
      return { stdout: JSON.stringify({ key: 'tools.approvalMode', value: 'yolo', type: 'enum', description: '' }) };
    });
    const client = createOmpConfigClient({ execFn });
    await client.setConfigValue('tools.approvalMode', 'yolo');
    expect(calls[0]).toEqual(['config', 'set', 'tools.approvalMode', 'yolo', '--json']);
  });

  it('resetConfigValue calls reset then re-gets the canonical value', async () => {
    const calls = [];
    const execFn = fakeExecFn((args) => {
      calls.push(args);
      if (args[1] === 'reset') return { stdout: JSON.stringify({ ok: true }) };
      return { stdout: JSON.stringify({ key: 'hideThinkingBlock', value: false, type: 'boolean', description: '' }) };
    });
    const client = createOmpConfigClient({ execFn });
    const result = await client.resetConfigValue('hideThinkingBlock');
    expect(calls[0]).toEqual(['config', 'reset', 'hideThinkingBlock', '--json']);
    expect(result.value).toBe(false);
  });

  it('listModels unwraps the .models array', async () => {
    const execFn = fakeExecFn((args) => {
      expect(args).toEqual(['models', '--json']);
      return { stdout: JSON.stringify({ models: [{ provider: 'anthropic', id: 'claude-sonnet-5', selector: 'anthropic/claude-sonnet-5' }] }) };
    });
    const client = createOmpConfigClient({ execFn });
    const models = await client.listModels();
    expect(models).toHaveLength(1);
    expect(models[0].selector).toBe('anthropic/claude-sonnet-5');
  });

  it('listModels defaults to an empty array when .models is missing', async () => {
    const execFn = fakeExecFn(() => ({ stdout: JSON.stringify({}) }));
    const client = createOmpConfigClient({ execFn });
    expect(await client.listModels()).toEqual([]);
  });

  it('rejects with the trimmed stderr message on a non-zero exit', async () => {
    const execFn = vi.fn((bin, args, options, cb) => {
      const err = new Error('Command failed');
      cb(err, '', '  Unknown setting: nope.nope  \n');
    });
    const client = createOmpConfigClient({ execFn });
    await expect(client.getConfigValue('nope.nope')).rejects.toThrow('Unknown setting: nope.nope');
  });

  it('rejects with a parse error when stdout is not JSON', async () => {
    const execFn = vi.fn((bin, args, options, cb) => cb(null, 'not json', ''));
    const client = createOmpConfigClient({ execFn });
    await expect(client.getConfigValue('modelRoles')).rejects.toThrow(/non-JSON output/);
  });

  it('listThemes returns a sorted union of built-in and custom themes, excluding non-.json files', async () => {
    const client = createOmpConfigClient({
      readdirFn: async () => ['sunset.json', 'notes.txt']
    });
    const result = await client.listThemes();
    expect(result).toContain('sunset');
    expect(result).not.toContain('notes');
    for (const theme of [
      'alabaster', 'amethyst', 'anthracite', 'crimson', 'dark', 'graphite', 'indigo', 'jade',
      'light', 'mono', 'obsidian', 'onyx', 'pearl', 'ruby', 'sandstone', 'sapphire', 'slate', 'titanium'
    ]) {
      expect(result).toContain(theme);
    }
    expect(result).toEqual([...result].sort());
  });

  it('listThemes falls back to built-ins when the themes dir is missing', async () => {
    const client = createOmpConfigClient({
      readdirFn: async () => { throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' }); }
    });
    const result = await client.listThemes();
    expect(result).toEqual(
      [
        'alabaster', 'amethyst', 'anthracite', 'crimson', 'dark', 'graphite', 'indigo', 'jade',
        'light', 'mono', 'obsidian', 'onyx', 'pearl', 'ruby', 'sandstone', 'sapphire', 'slate', 'titanium'
      ].sort()
    );
  });
});
