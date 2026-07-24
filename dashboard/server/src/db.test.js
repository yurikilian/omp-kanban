import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';
import {
  db,
  listPlans,
  getPlan,
  createPlan,
  updatePlan,
  deletePlan,
  getSessionMeta,
  listSessionMeta,
  upsertSessionMeta,
  setSessionMeta,
  getAllPreferences,
  setPreferences
} from './db.js';

describe('db.js', () => {
  describe('plans', () => {
    it('round-trips create -> get -> update -> delete', () => {
      const created = createPlan({ slug: 'test-slug', title: 'Test Plan', content: '# hi' });
      expect(created.id).toBeTruthy();
      expect(created.slug).toBe('test-slug');
      expect(created.title).toBe('Test Plan');
      expect(created.content).toBe('# hi');
      expect(created.status).toBe('draft');
      expect(created.created_at).toBeTruthy();
      expect(created.updated_at).toBeTruthy();

      const fetched = getPlan(created.id);
      expect(fetched).toMatchObject({ id: created.id, slug: 'test-slug', title: 'Test Plan', content: '# hi' });

      expect(listPlans().some((p) => p.id === created.id)).toBe(true);

      const updated = updatePlan(created.id, { title: 'Updated', status: 'active' });
      expect(updated.title).toBe('Updated');
      expect(updated.status).toBe('active');
      expect(updated.content).toBe('# hi'); // untouched field preserved

      const deleted = deletePlan(created.id);
      expect(deleted).toBe(true);
      expect(getPlan(created.id)).toBeNull();
      expect(listPlans().some((p) => p.id === created.id)).toBe(false);
    });

    it('getPlan returns null for an unknown id', () => {
      expect(getPlan('does-not-exist')).toBeNull();
    });

    it('updatePlan returns null for an unknown id', () => {
      expect(updatePlan('does-not-exist', { title: 'x' })).toBeNull();
    });

    it('deletePlan returns false for an unknown id', () => {
      expect(deletePlan('does-not-exist')).toBe(false);
    });
  });

  describe('session metadata', () => {
    let viewerId;

    beforeEach(() => {
      viewerId = `test-viewer-${crypto.randomUUID()}`;
    });

    afterEach(() => {
      db.prepare('DELETE FROM sessions WHERE viewer_id = ?').run(viewerId);
    });

    it('getSessionMeta returns null for an unknown viewerId', () => {
      expect(getSessionMeta(viewerId)).toBeNull();
    });

    it('upsertSessionMeta inserts then updates, preserving unspecified fields', () => {
      const inserted = upsertSessionMeta(viewerId, { title: 'First', pinned: true, origin: 'dashboard' });
      expect(inserted.viewer_id).toBe(viewerId);
      expect(inserted.title).toBe('First');
      expect(inserted.pinned).toBe(1);
      expect(inserted.archived).toBe(0);
      expect(inserted.origin).toBe('dashboard');

      expect(listSessionMeta().some((s) => s.viewer_id === viewerId)).toBe(true);

      const updated = setSessionMeta(viewerId, { title: 'Second', archived: true });
      expect(updated.title).toBe('Second');
      expect(updated.archived).toBe(1);
      expect(updated.pinned).toBe(1); // preserved from the earlier upsert
      expect(updated.origin).toBe('dashboard'); // preserved from the earlier upsert

      const fetched = getSessionMeta(viewerId);
      expect(fetched).toMatchObject({ title: 'Second', pinned: 1, archived: 1, origin: 'dashboard' });
    });
  });

  describe('preferences', () => {
    let key;
    let otherKey;

    beforeEach(() => {
      key = `test.pref.${crypto.randomUUID()}`;
      otherKey = `${key}.other`;
    });

    afterEach(() => {
      db.prepare('DELETE FROM preferences WHERE key IN (?, ?)').run(key, otherKey);
    });

    it('setPreferences stores JSON values retrievable via getAllPreferences', () => {
      const merged = setPreferences({ [key]: { sidebarWidth: 320, theme: 'dark' } });
      expect(merged[key]).toEqual({ sidebarWidth: 320, theme: 'dark' });

      const all = getAllPreferences();
      expect(all[key]).toEqual({ sidebarWidth: 320, theme: 'dark' });
    });

    it('setPreferences merges patches without clobbering other keys', () => {
      setPreferences({ [key]: 'first' });
      const merged = setPreferences({ [otherKey]: 'second' });
      expect(merged[key]).toBe('first');
      expect(merged[otherKey]).toBe('second');
    });
  });
});
