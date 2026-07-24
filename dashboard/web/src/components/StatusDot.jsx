import React from 'react';
import './StatusDot.css';

// Maps a session's live-agent state to one of the three D4 status buckets.
// `live` false (no attached agent) always wins — a stale `busy`/`mode` from
// before the agent detached must not paint a false "working"/"plan" state.
export function deriveStatus({ live, busy }) {
  if (!live) return 'ended';
  return busy ? 'working' : 'idle';
}

const STATUS_LABEL = {
  ended: 'Ended',
  idle: 'Idle',
  working: 'Working'
};

// Pure presentational dot: gray (ended/no live agent), green (idle), cyan
// (working) per D4, with a small violet badge overlaid when the live
// agent's current mode is 'plan'. Reused by SessionList (per-row) and
// SessionDetail (header).
export default function StatusDot({ live, busy, mode, className = '' }) {
  const status = deriveStatus({ live, busy });
  const isPlan = live && mode === 'plan';
  const label = isPlan ? `${STATUS_LABEL[status]} (Plan mode)` : STATUS_LABEL[status];

  return (
    <span
      className={`status-dot status-dot-${status}${isPlan ? ' status-dot-plan' : ''}${className ? ` ${className}` : ''}`}
      role="status"
      aria-label={label}
      title={label}
    />
  );
}
