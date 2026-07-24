import { listPlans, getPlan, createPlan, updatePlan, deletePlan } from './db.js';

export function registerPlanRoutes(app) {
  app.get('/api/plans', (req, res) => {
    try {
      res.json(listPlans());
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/plans', (req, res) => {
    try {
      const { slug, title, content } = req.body || {};
      const plan = createPlan({ slug, title, content });
      res.status(201).json(plan);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/plans/:id', (req, res) => {
    try {
      const plan = getPlan(req.params.id);
      if (!plan) return res.status(404).json({ error: 'Plan not found' });
      res.json(plan);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put('/api/plans/:id', (req, res) => {
    try {
      const { title, content, status } = req.body || {};
      const plan = updatePlan(req.params.id, { title, content, status });
      if (!plan) return res.status(404).json({ error: 'Plan not found' });
      res.json(plan);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/plans/:id', (req, res) => {
    try {
      const deleted = deletePlan(req.params.id);
      if (!deleted) return res.status(404).json({ error: 'Plan not found' });
      res.status(204).end();
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
}
