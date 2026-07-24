// SQLite-backed persistence for dashboard-owned state: plans, session
// metadata (registry overlay on top of the file-derived sessions), and UI
// preferences. Transcripts and KPIs remain file-derived; this module never
// touches ~/.omp/agent/sessions/*.jsonl.
import Database from 'better-sqlite3';
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';

const dbPath = process.env.DASHBOARD_DB || path.join(os.homedir(), '.omp', 'agent', 'dashboard.db');
if (dbPath !== ':memory:') {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
}

export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS plans (
    id TEXT PRIMARY KEY,
    viewer_id TEXT,
    slug TEXT,
    title TEXT,
    content TEXT,
    status TEXT DEFAULT 'draft',
    created_at TEXT,
    updated_at TEXT
  );
  CREATE TABLE IF NOT EXISTS sessions (
    viewer_id TEXT PRIMARY KEY,
    acp_uuid TEXT,
    origin TEXT,
    cwd TEXT,
    title TEXT,
    model TEXT,
    mode TEXT,
    pinned INTEGER DEFAULT 0,
    archived INTEGER DEFAULT 0,
    plan_id TEXT,
    created_at TEXT,
    last_opened_at TEXT
  );
  CREATE TABLE IF NOT EXISTS preferences (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

const nowIso = () => new Date().toISOString();

// ---- Plans ----

export function listPlans() {
  return db.prepare('SELECT * FROM plans ORDER BY updated_at DESC').all();
}

export function getPlan(id) {
  return db.prepare('SELECT * FROM plans WHERE id = ?').get(id) ?? null;
}

export function createPlan({ viewerId = null, slug = null, title = '', content = '', status = 'draft' } = {}) {
  const id = crypto.randomUUID();
  const ts = nowIso();
  db.prepare(
    'INSERT INTO plans (id, viewer_id, slug, title, content, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id, viewerId, slug, title, content, status, ts, ts);
  return getPlan(id);
}

export function updatePlan(id, { title, content, status } = {}) {
  const existing = getPlan(id);
  if (!existing) return null;
  const next = {
    title: title ?? existing.title,
    content: content ?? existing.content,
    status: status ?? existing.status,
  };
  db.prepare('UPDATE plans SET title = ?, content = ?, status = ?, updated_at = ? WHERE id = ?').run(
    next.title,
    next.content,
    next.status,
    nowIso(),
    id
  );
  return getPlan(id);
}

export function deletePlan(id) {
  const result = db.prepare('DELETE FROM plans WHERE id = ?').run(id);
  return result.changes > 0;
}

// ---- Session metadata ----

export function getSessionMeta(viewerId) {
  return db.prepare('SELECT * FROM sessions WHERE viewer_id = ?').get(viewerId) ?? null;
}

export function listSessionMeta() {
  return db.prepare('SELECT * FROM sessions').all();
}

export function upsertSessionMeta(viewerId, fields = {}) {
  const existing = getSessionMeta(viewerId);
  const ts = nowIso();
  if (!existing) {
    db.prepare(
      `INSERT INTO sessions (viewer_id, acp_uuid, origin, cwd, title, model, mode, pinned, archived, plan_id, created_at, last_opened_at)
       VALUES (@viewerId, @acpUuid, @origin, @cwd, @title, @model, @mode, @pinned, @archived, @planId, @createdAt, @lastOpenedAt)`
    ).run({
      viewerId,
      acpUuid: fields.acpUuid ?? null,
      origin: fields.origin ?? null,
      cwd: fields.cwd ?? null,
      title: fields.title ?? null,
      model: fields.model ?? null,
      mode: fields.mode ?? null,
      pinned: fields.pinned ? 1 : 0,
      archived: fields.archived ? 1 : 0,
      planId: fields.planId ?? null,
      createdAt: ts,
      lastOpenedAt: ts,
    });
    return getSessionMeta(viewerId);
  }
  const merged = {
    acpUuid: fields.acpUuid ?? existing.acp_uuid,
    origin: fields.origin ?? existing.origin,
    cwd: fields.cwd ?? existing.cwd,
    title: fields.title ?? existing.title,
    model: fields.model ?? existing.model,
    mode: fields.mode ?? existing.mode,
    pinned: fields.pinned !== undefined ? (fields.pinned ? 1 : 0) : existing.pinned,
    archived: fields.archived !== undefined ? (fields.archived ? 1 : 0) : existing.archived,
    planId: fields.planId !== undefined ? fields.planId : existing.plan_id,
    lastOpenedAt: fields.lastOpenedAt ?? existing.last_opened_at,
  };
  db.prepare(
    `UPDATE sessions SET acp_uuid = @acpUuid, origin = @origin, cwd = @cwd, title = @title, model = @model,
       mode = @mode, pinned = @pinned, archived = @archived, plan_id = @planId, last_opened_at = @lastOpenedAt
     WHERE viewer_id = @viewerId`
  ).run({ ...merged, viewerId });
  return getSessionMeta(viewerId);
}

export function setSessionMeta(viewerId, fields = {}) {
  return upsertSessionMeta(viewerId, fields);
}

// ---- Preferences ----

export function getAllPreferences() {
  const rows = db.prepare('SELECT key, value FROM preferences').all();
  const out = {};
  for (const row of rows) {
    try {
      out[row.key] = JSON.parse(row.value);
    } catch {
      out[row.key] = row.value;
    }
  }
  return out;
}

export function setPreferences(patch = {}) {
  const upsert = db.prepare(
    'INSERT INTO preferences (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  );
  const tx = db.transaction((entries) => {
    for (const [key, value] of entries) {
      upsert.run(key, JSON.stringify(value));
    }
  });
  tx(Object.entries(patch));
  return getAllPreferences();
}
