import { ompConfig as defaultOmpConfig } from './ompConfig.js';

export const COMMON_CONFIG_FIELDS = [
  { key: 'defaultThinkingLevel', group: 'Thinking', label: 'Default thinking level', type: 'enum', enumValues: ['minimal','low','medium','high','xhigh','max','auto'] },
  { key: 'hideThinkingBlock', group: 'Thinking', label: 'Hide thinking blocks', type: 'boolean' },
  { key: 'tools.approvalMode', group: 'Tools & Approvals', label: 'Approval mode', type: 'enum', enumValues: ['always-ask','write','yolo'] },
  { key: 'tools.maxTimeout', group: 'Tools & Approvals', label: 'Max tool timeout (seconds)', type: 'number', help: '0 disables the timeout.' },
  { key: 'compaction.enabled', group: 'Compaction', label: 'Auto-compaction enabled', type: 'boolean' },
  { key: 'compaction.strategy', group: 'Compaction', label: 'Compaction strategy', type: 'enum', enumValues: ['context-full','handoff','shake','snapcompact','off'] },
  { key: 'compaction.thresholdPercent', group: 'Compaction', label: 'Compaction threshold (%)', type: 'number', help: '-1 uses the built-in default.' },
  { key: 'memory.backend', group: 'Memory', label: 'Memory backend', type: 'enum', enumValues: ['off','local','hindsight','mnemopi'] },
  { key: 'autolearn.enabled', group: 'Memory', label: 'Autolearn enabled', type: 'boolean' },
  { key: 'task.maxConcurrency', group: 'Subagents', label: 'Max concurrent subagents', type: 'number' },
  { key: 'task.maxRecursionDepth', group: 'Subagents', label: 'Max subagent recursion depth', type: 'number' },
  { key: 'task.prewalk', group: 'Subagents', label: 'Prewalk generic task agent', type: 'boolean' },
  { key: 'advisor.enabled', group: 'Advisor', label: 'Advisor enabled', type: 'boolean' },
  { key: 'advisor.subagents', group: 'Advisor', label: 'Advisor for subagents', type: 'boolean' },
  { key: 'steeringMode', group: 'Interaction', label: 'Steering message delivery', type: 'enum', enumValues: ['all','one-at-a-time'] },
  { key: 'followUpMode', group: 'Interaction', label: 'Follow-up message delivery', type: 'enum', enumValues: ['all','one-at-a-time'] },
  { key: 'autoResume', group: 'Interaction', label: 'Auto-resume most recent session', type: 'boolean' },
  { key: 'theme.dark', group: 'Appearance', label: 'Dark theme name', type: 'combobox' },
  { key: 'theme.light', group: 'Appearance', label: 'Light theme name', type: 'combobox' },
  { key: 'symbolPreset', group: 'Appearance', label: 'Symbol preset', type: 'enum', enumValues: ['unicode','nerd','ascii'] },
  { key: 'colorBlindMode', group: 'Appearance', label: 'Color-blind mode', type: 'boolean' }
];

export function registerConfigRoutes(app, { ompConfig = defaultOmpConfig } = {}) {
  app.get('/api/omp-config', async (req, res) => {
    try {
      const all = await ompConfig.getConfigList();
      const values = Object.fromEntries(COMMON_CONFIG_FIELDS.map((f) => [f.key, all[f.key]?.value]));
      const descriptions = Object.fromEntries(COMMON_CONFIG_FIELDS.map((f) => [f.key, all[f.key]?.description || '']));
      const themeKeys = COMMON_CONFIG_FIELDS.filter((f) => f.type === 'combobox').map((f) => f.key);
      const suggestions = {};
      if (themeKeys.length) {
        const themes = await ompConfig.listThemes();
        for (const k of themeKeys) suggestions[k] = themes;
      }
      res.json({ fields: COMMON_CONFIG_FIELDS, values, descriptions, suggestions });
    } catch (error) { res.status(500).json({ error: error.message }); }
  });
  app.put('/api/omp-config/:key', async (req, res) => {
    const field = COMMON_CONFIG_FIELDS.find((f) => f.key === req.params.key);
    if (!field) return res.status(404).json({ error: `Unknown setting: ${req.params.key}` });
    try { res.json(await ompConfig.setConfigValue(field.key, (req.body || {}).value)); }
    catch (error) { res.status(400).json({ error: error.message }); }
  });
  app.post('/api/omp-config/:key/reset', async (req, res) => {
    const field = COMMON_CONFIG_FIELDS.find((f) => f.key === req.params.key);
    if (!field) return res.status(404).json({ error: `Unknown setting: ${req.params.key}` });
    try { res.json(await ompConfig.resetConfigValue(field.key)); }
    catch (error) { res.status(400).json({ error: error.message }); }
  });
}
