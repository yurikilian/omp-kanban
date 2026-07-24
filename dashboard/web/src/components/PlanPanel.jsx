import React, { useEffect, useState } from 'react';
import { TrashIcon, ClipboardDocumentListIcon, ChevronDoubleRightIcon } from '@heroicons/react/24/outline';
import MarkdownView from './content/MarkdownView';
import './PlanPanel.css';

// Right-hand collapsible panel: lists plans (SQLite-backed, `db.js`
// `plans` table via the Plans REST contract), edits one's markdown, and
// can associate the currently-open session with it (`PATCH
// /api/sessions/:id {plan_id}`). `GET /api/sessions` projects the
// persisted `plan_id` back onto each session object, so `linkedPlanId`
// initializes from `session.plan_id` on session change; it's also set
// optimistically right after a successful associate PATCH, since that
// PATCH doesn't itself trigger the parent's session-list refresh (the
// session prop's `plan_id` catches up whenever that refresh happens).
export default function PlanPanel({ collapsed, onToggleCollapse, session }) {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedPlanId, setSelectedPlanId] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [linkedPlanId, setLinkedPlanId] = useState(null);

  const fetchPlans = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/plans');
      if (!res.ok) throw new Error(`Server error (${res.status})`);
      const data = await res.json();
      setPlans(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlans();
  }, []);

  // Seed from the persisted association; re-sync whenever the open
  // session (or its persisted plan_id) changes.
  useEffect(() => {
    setLinkedPlanId(session?.plan_id ?? null);
  }, [session?.id, session?.plan_id]);

  const selectedPlan = plans.find((p) => p.id === selectedPlanId) || null;

  useEffect(() => {
    setEditTitle(selectedPlan?.title || '');
    setEditContent(selectedPlan?.content || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPlanId]);

  const handleCreate = async () => {
    const slug = window.prompt('Plan slug (short, unique id)?');
    if (!slug || !slug.trim()) return;
    const title = window.prompt('Plan title?', slug) || slug;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch('/api/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: slug.trim(), title, content: '' })
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Server error (${res.status})`);
      }
      const created = await res.json();
      setPlans((prev) => [...prev, created]);
      setSelectedPlanId(created.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleSave = async () => {
    if (!selectedPlan) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/plans/${selectedPlan.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editTitle, content: editContent })
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Server error (${res.status})`);
      }
      const updated = await res.json();
      setPlans((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (plan) => {
    if (!window.confirm(`Delete plan "${plan.title || plan.slug}"? This can't be undone.`)) return;
    setError(null);
    try {
      const res = await fetch(`/api/plans/${plan.id}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 404) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Server error (${res.status})`);
      }
      setPlans((prev) => prev.filter((p) => p.id !== plan.id));
      if (selectedPlanId === plan.id) setSelectedPlanId(null);
      if (linkedPlanId === plan.id) setLinkedPlanId(null);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleAssociate = async () => {
    if (!session || !selectedPlan) return;
    setError(null);
    try {
      const res = await fetch(`/api/sessions/${encodeURIComponent(session.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan_id: selectedPlan.id })
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Server error (${res.status})`);
      }
      setLinkedPlanId(selectedPlan.id);
    } catch (err) {
      setError(err.message);
    }
  };

  if (collapsed) {
    return (
      <aside className="plan-panel plan-panel-collapsed">
        <button
          type="button"
          className="plan-panel-expand"
          onClick={onToggleCollapse}
          aria-label="Expand plan panel"
          title="Plans"
        >
          <ClipboardDocumentListIcon aria-hidden="true" />
        </button>
      </aside>
    );
  }

  return (
    <aside className="plan-panel">
      <div className="plan-panel-header">
        <h2>Plans</h2>
        <div className="plan-panel-header-actions">
          <button type="button" className="plan-panel-new" onClick={handleCreate} disabled={creating}>
            + New Plan
          </button>
          <button
            type="button"
            className="plan-panel-collapse"
            onClick={onToggleCollapse}
            aria-label="Collapse plan panel"
            title="Collapse"
          >
            <ChevronDoubleRightIcon aria-hidden="true" />
          </button>
        </div>
      </div>

      {error && <p className="plan-panel-error">⚠ {error}</p>}

      {loading ? (
        <p className="plan-panel-hint">Loading plans…</p>
      ) : (
        <>
          <ul className="plan-panel-list">
            {plans.map((plan) => (
              <li key={plan.id} className={`plan-panel-item ${selectedPlanId === plan.id ? 'active' : ''}`}>
                <button type="button" className="plan-panel-item-select" onClick={() => setSelectedPlanId(plan.id)}>
                  <span className="plan-panel-item-title">{plan.title || plan.slug}</span>
                  {linkedPlanId === plan.id && <span className="plan-panel-item-badge">Linked</span>}
                </button>
                <button
                  type="button"
                  className="plan-panel-item-delete"
                  aria-label={`Delete ${plan.title || plan.slug}`}
                  onClick={() => handleDelete(plan)}
                >
                  <TrashIcon aria-hidden="true" />
                </button>
              </li>
            ))}
            {plans.length === 0 && <li className="plan-panel-empty">No plans yet.</li>}
          </ul>

          {selectedPlan && (
            <div className="plan-panel-editor">
              <input
                type="text"
                className="plan-panel-title-input"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="Plan title"
                aria-label="Plan title"
              />
              <textarea
                className="plan-panel-content-input"
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                rows={10}
                placeholder="# Plan markdown…"
                aria-label="Plan content"
              />
              <div className="plan-panel-preview">
                <MarkdownView source={editContent} />
              </div>
              <div className="plan-panel-editor-actions">
                <button type="button" onClick={handleSave} disabled={saving}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
                {session && (
                  <button type="button" onClick={handleAssociate} disabled={linkedPlanId === selectedPlan.id}>
                    {linkedPlanId === selectedPlan.id ? 'Linked to this session' : 'Link to this session'}
                  </button>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </aside>
  );
}
