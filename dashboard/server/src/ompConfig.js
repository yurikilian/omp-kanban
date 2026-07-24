// Sole shell-out site for `omp` CLI settings/model control (mirrors acp.js
// being the sole ACP shell-out site). No HTTP/RPC surface exists for
// settings, so this wraps `omp config list|get|set|reset --json` and
// `omp models --json` as plain one-shot subprocess calls (no persistent
// child needed, unlike ACP's session-scoped `omp acp`).
import { execFile } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

const CLEAN_ENV = { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' };

function execOmp(args, { ompBin = 'omp', execFn = execFile } = {}) {
  return new Promise((resolve, reject) => {
    execFn(ompBin, args, { env: CLEAN_ENV, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error((stderr || error.message || '').toString().trim() || `omp ${args.join(' ')} failed`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (parseErr) {
        reject(new Error(`omp ${args.join(' ')} returned non-JSON output: ${parseErr.message}`));
      }
    });
  });
}

const BUILTIN_THEMES = [
  'alabaster', 'amethyst', 'anthracite', 'crimson', 'dark', 'graphite', 'indigo', 'jade',
  'light', 'mono', 'obsidian', 'onyx', 'pearl', 'ruby', 'sandstone', 'sapphire', 'slate', 'titanium'
];

export function createOmpConfigClient({ ompBin, execFn, readdirFn = readdir } = {}) {
  const opts = { ompBin, execFn };
  const getConfigValue = (key) => execOmp(['config', 'get', key, '--json'], opts);
  return {
    getConfigList: () => execOmp(['config', 'list', '--json'], opts),
    getConfigValue,
    setConfigValue: async (key, value) => {
      const strValue = typeof value === 'string' ? value : JSON.stringify(value);
      await execOmp(['config', 'set', key, strValue, '--json'], opts);
      return getConfigValue(key);
    },
    resetConfigValue: async (key) => {
      await execOmp(['config', 'reset', key, '--json'], opts);
      return getConfigValue(key);
    },
    listModels: async () => {
      const data = await execOmp(['models', '--json'], opts);
      return data.models || [];
    },
    listThemes: async () => {
      const dir = process.env.PI_CODING_AGENT_DIR
        ? path.join(process.env.PI_CODING_AGENT_DIR, 'themes')
        : path.join(homedir(), '.omp', 'agent', 'themes');
      let custom = [];
      try {
        const entries = await readdirFn(dir);
        custom = entries.filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5));
      } catch { /* dir absent → built-ins only */ }
      return [...new Set([...BUILTIN_THEMES, ...custom])].sort();
    }
  };
}

export const ompConfig = createOmpConfigClient();
