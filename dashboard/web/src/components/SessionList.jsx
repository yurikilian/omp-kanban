import React, { useState } from 'react';
import { TrashIcon } from '@heroicons/react/24/outline';
import { StarIcon as StarIconSolid } from '@heroicons/react/24/solid';
import { StarIcon } from '@heroicons/react/24/outline';
import StatusDot from './StatusDot';
import './SessionList.css';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'terminal', label: 'Terminal' },
  { id: 'pinned', label: 'Pinned' }
];

function matchesFilter(session, filter) {
  if (filter === 'pinned') return !!session.pinned;
  if (filter === 'dashboard') return session.origin === 'dashboard';
  if (filter === 'terminal') return session.origin === 'terminal';
  return true;
}

export default function SessionList({
  sessions,
  selectedSession,
  onSelectSession,
  onDeleteSession,
  onTogglePin = () => {},
  sortBy = 'created',
  onSortChange = () => {}
}) {
  const [filter, setFilter] = useState('all');

  const handleKeyDown = (event, session) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelectSession(session);
    }
  };

  const handleDeleteClick = (event, session) => {
    event.stopPropagation();
    if (window.confirm(`Delete "${session.name || 'Untitled session'}"? This can't be undone.`)) {
      onDeleteSession(session);
    }
  };

  const handlePinClick = (event, session) => {
    event.stopPropagation();
    onTogglePin(session);
  };

  const filteredSessions = sessions.filter((session) => matchesFilter(session, filter));

  return (
    <div className="session-list">
      <div className="session-list-header">
        <div className="session-list-header-top">
          <h2>Sessions <span className="session-count">{sessions.length}</span></h2>
        </div>
        <div className="session-list-header-sort">
          <div className="session-sort-toggle">
            <button
              type="button"
              className={`session-sort-button ${sortBy === 'created' ? 'active' : ''}`}
              onClick={() => onSortChange('created')}
            >
              Newest
            </button>
            <button
              type="button"
              className={`session-sort-button ${sortBy === 'modified' ? 'active' : ''}`}
              onClick={() => onSortChange('modified')}
            >
              Recently modified
            </button>
          </div>
        </div>
        <div className="session-filter-tabs" role="tablist" aria-label="Filter sessions">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={filter === f.id}
              className={`session-filter-tab ${filter === f.id ? 'active' : ''}`}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      <ul>
        {filteredSessions.map(session => (
          <li
            key={session.id}
            className={`session-item ${selectedSession?.id === session.id ? 'active' : ''}`}
            role="button"
            tabIndex={0}
            aria-current={selectedSession?.id === session.id ? 'true' : undefined}
            onClick={() => onSelectSession(session)}
            onKeyDown={(event) => handleKeyDown(event, session)}
          >
            <div className="session-item-row">
              <StatusDot live={false} busy={false} className="session-item-dot" />
              <div className="session-name">{session.name || 'Untitled session'}</div>
              <div className="session-item-actions">
                <button
                  type="button"
                  className={`session-pin ${session.pinned ? 'session-pin-active' : ''}`}
                  aria-label={`${session.pinned ? 'Unpin' : 'Pin'} ${session.name || 'Untitled session'}`}
                  title={session.pinned ? 'Unpin session' : 'Pin session'}
                  onClick={(e) => handlePinClick(e, session)}
                >
                  {session.pinned ? (
                    <StarIconSolid className="session-pin-icon" aria-hidden="true" />
                  ) : (
                    <StarIcon className="session-pin-icon" aria-hidden="true" />
                  )}
                </button>
                <button
                  type="button"
                  className="session-delete"
                  aria-label={`Delete ${session.name || 'Untitled session'}`}
                  title="Delete session"
                  onClick={(event) => handleDeleteClick(event, session)}
                >
                  <TrashIcon className="session-delete-icon" aria-hidden="true" />
                </button>
              </div>
            </div>
            <div className="session-meta">
              {session.active && (
                <span className="session-active-indicator">
                  <span className="session-active-dot"></span>
                  Active
                </span>
              )}
              <span className="session-model">{session.model}</span>
              <span className="session-time">
                {new Date(session.timestamp).toLocaleDateString()}{' '}
                {new Date(session.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </li>
        ))}
        {filteredSessions.length === 0 && (
          <li className="session-list-empty">No sessions match this filter.</li>
        )}
      </ul>
    </div>
  );
}
