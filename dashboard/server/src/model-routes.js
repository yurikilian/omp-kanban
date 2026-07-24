import { ompConfig as defaultOmpConfig } from './ompConfig.js';
import { listAllAgents as defaultListAllAgents } from './agents.js';

export function registerModelRoutes(app, { ompConfig = defaultOmpConfig, listAllAgents = defaultListAllAgents } = {}) {
  app.get('/api/models', async (req, res) => {
    try { res.json(await ompConfig.listModels()); }
    catch (error) { res.status(500).json({ error: error.message }); }
  });
  
  app.get('/api/agents', async (req, res) => {
    try { res.json(await listAllAgents()); }
    catch (error) { res.status(500).json({ error: error.message }); }
  });
  
  app.get('/api/model-roles', async (req, res) => {
    try { res.json((await ompConfig.getConfigValue('modelRoles')).value || {}); }
    catch (error) { res.status(500).json({ error: error.message }); }
  });
  
  app.put('/api/model-roles/:role', async (req, res) => {
    const { model } = req.body || {};
    if (!model) return res.status(400).json({ error: 'model is required' });
    try {
      const current = (await ompConfig.getConfigValue('modelRoles')).value || {};
      res.json(await ompConfig.setConfigValue('modelRoles', { ...current, [req.params.role]: model }));
    } catch (error) { res.status(400).json({ error: error.message }); }
  });
  
  app.get('/api/agent-model-overrides', async (req, res) => {
    try { res.json((await ompConfig.getConfigValue('task.agentModelOverrides')).value || {}); }
    catch (error) { res.status(500).json({ error: error.message }); }
  });
  
  app.put('/api/agent-model-overrides/:agentName', async (req, res) => {
    const { model } = req.body || {};
    try {
      const current = (await ompConfig.getConfigValue('task.agentModelOverrides')).value || {};
      const next = { ...current };
      if (model) next[req.params.agentName] = model; else delete next[req.params.agentName];
      res.json(await ompConfig.setConfigValue('task.agentModelOverrides', next));
    } catch (error) { res.status(400).json({ error: error.message }); }
  });
}
