import { getAllPreferences, setPreferences } from './db.js';

export function registerPrefRoutes(app) {
  app.get('/api/preferences', (req, res) => {
    try {
      res.json(getAllPreferences());
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put('/api/preferences', (req, res) => {
    try {
      res.json(setPreferences(req.body || {}));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
}
