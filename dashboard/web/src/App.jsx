import React, { useState, useEffect, useRef } from 'react';
import SessionList from './components/SessionList';
import SessionDetail from './components/SessionDetail';
import PlanPanel from './components/PlanPanel';
import ThemeSwitcher from './components/ThemeSwitcher';
import ActivityRail from './components/ActivityRail';
import ComingSoon from './components/ComingSoon';
import Observability from './components/Observability';
import Configurations from './components/Configurations';
import { ThemeProvider } from './context/ThemeContext';
import './theme.css';
import './App.css';

const COMING_SOON = {};
const PREFS_SAVE_DEBOUNCE_MS = 500;

function AppContent() {
  const [activeSection, setActiveSection] = useState('sessions');
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sidebarWidth, setSidebarWidth] = useState(() => Math.round(window.innerWidth * 0.25));
  const [sortBy, setSortBy] = useState('created'); // 'created' | 'modified'
  const [planPanelCollapsed, setPlanPanelCollapsed] = useState(false);
  const [timelineReloadToken, setTimelineReloadToken] = useState(0);
  const resizingRef = useRef(false);

  useEffect(() => {
    fetchSessions();
  }, []);

  // ---- Preferences (sidebar width / sort order / plan panel), persisted
  // via GET/PUT /api/preferences instead of staying purely in-memory.
  // `prefsLoadedRef` gates the save effect so the initial state defaults
  // (before the GET response lands) never overwrite whatever was already
  // saved server-side.
  const prefsLoadedRef = useRef(false);
  const prefsSaveTimeoutRef = useRef(null);
  // Clamp sidebar width to valid range (25-40% of viewport)
  const clampSidebarWidth = (width) => {
    const minWidth = window.innerWidth * 0.25;
    const maxWidth = window.innerWidth * 0.4;
    return Math.min(Math.max(width, minWidth), maxWidth);
  };


  useEffect(() => {
    let cancelled = false;
    fetch('/api/preferences')
      .then((res) => (res.ok ? res.json() : {}))
      .then((prefs) => {
        if (cancelled || !prefs) return;
        if (typeof prefs.sidebarWidth === 'number') setSidebarWidth(clampSidebarWidth(prefs.sidebarWidth));
        if (prefs.sortBy === 'created' || prefs.sortBy === 'modified') setSortBy(prefs.sortBy);
        if (typeof prefs.planPanelCollapsed === 'boolean') setPlanPanelCollapsed(prefs.planPanelCollapsed);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) prefsLoadedRef.current = true;
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!prefsLoadedRef.current) return;
    clearTimeout(prefsSaveTimeoutRef.current);
    prefsSaveTimeoutRef.current = setTimeout(() => {
      fetch('/api/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sidebarWidth, sortBy, planPanelCollapsed })
      }).catch(() => {});
    }, PREFS_SAVE_DEBOUNCE_MS);
    return () => clearTimeout(prefsSaveTimeoutRef.current);
  }, [sidebarWidth, sortBy, planPanelCollapsed]);

  // Refs to avoid stale closure issues in the event listener
  const selectedSessionRef = useRef(selectedSession);
  const debounceTimeoutRef = useRef(null);

  useEffect(() => {
    selectedSessionRef.current = selectedSession;
  }, [selectedSession]);

  useEffect(() => {
    const es = new EventSource('/api/sessions/events');

    es.onmessage = (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch (e) {
        return; // Ignore parse errors
      }

      if (message.type === 'sessions-changed') {
        // Debounce refreshSessionsPreservingSelection (~500ms)
        clearTimeout(debounceTimeoutRef.current);
        debounceTimeoutRef.current = setTimeout(() => {
          refreshSessionsPreservingSelection();
          debounceTimeoutRef.current = null;
        }, 500);
      } else if (message.type === 'session-changed' && message.id === selectedSessionRef.current?.id) {
        setTimelineReloadToken((t) => t + 1);
      }
    };

    es.onerror = () => {
      es.close();
    };

    return () => {
      es.close();
      clearTimeout(debounceTimeoutRef.current);
    };
  }, []);

  const fetchSessions = async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      const response = await fetch('/api/sessions');
      const data = await response.json();
      setSessions(data);
      if (!silent && data.length > 0) {
        setSelectedSession(data[0]);
      }
      return data;
    } catch (err) {
      if (!silent) setError(err.message);
      return [];
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const handleSelectSession = (session) => {
    setSelectedSession(session);
  };

  const handleSortChange = (next) => {
    setSortBy(next);
  };

  // Refreshes `sessions` from the server without letting fetchSessions()'s
  // own side effect (always selecting list[0]) steal the current selection,
  // and without toggling the page-wide `loading` state (this runs as a
  // background refresh — often while the sidebar or SessionDetail is mounted
  // and must stay mounted).
  // Pass `removedId` when the acted-on session was just deleted (so, if it
  // WAS the selection, we fall back to list[0]); omit it for actions that
  // don't remove anything to always preserve whatever was already selected.
  // Reads `selectedSessionRef` (not the `selectedSession` state variable)
  // deliberately: the SSE effect above calls this function from an
  // `es.onmessage` handler that was captured ONCE at mount time (inside a
  // `[]`-dependency `useEffect`) and never gets a fresh closure on
  // re-render. Reading `selectedSession` directly there would always see
  // its mount-time value (`null`), making `previousSelectedId` permanently
  // `undefined` -> every background `sessions-changed` refresh would fall
  // through to `list[0]`, silently hijacking the view to the newest
  // session on every unrelated file change anywhere on disk. The ref is
  // always current regardless of which closure calls this function.
  const refreshSessionsPreservingSelection = async ({ removedId } = {}) => {
    const wasRemovedSelected = removedId != null && selectedSessionRef.current?.id === removedId;
    const previousSelectedId = selectedSessionRef.current?.id;
    const list = await fetchSessions({ silent: true });
    setSelectedSession(wasRemovedSelected ? (list[0] ?? null) : (list.find((s) => s.id === previousSelectedId) ?? list[0] ?? null));
    return list;
  };

  const handleTogglePin = async (session) => {
    try {
      const res = await fetch(`/api/sessions/${encodeURIComponent(session.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinned: !session.pinned })
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Server error (${res.status})`);
      }
    } catch (err) {
      window.alert(`Couldn't update pin: ${err.message}`);
      return;
    }
    await refreshSessionsPreservingSelection();
  };

  const RAIL_WIDTH = 64;

  const handleResizeMove = (event) => {
    if (!resizingRef.current) return;
    const minWidth = window.innerWidth * 0.25;
    const maxWidth = window.innerWidth * 0.4;
    const next = Math.min(Math.max(event.clientX - RAIL_WIDTH, minWidth), maxWidth);
    setSidebarWidth(next);
  };

  const handleResizeEnd = () => {
    resizingRef.current = false;
    document.removeEventListener('mousemove', handleResizeMove);
    document.removeEventListener('mouseup', handleResizeEnd);
  };

  const handleResizeStart = (event) => {
    event.preventDefault();
    resizingRef.current = true;
    document.addEventListener('mousemove', handleResizeMove);
    document.addEventListener('mouseup', handleResizeEnd);
  };

  useEffect(() => {
    return () => {
      document.removeEventListener('mousemove', handleResizeMove);
      document.removeEventListener('mouseup', handleResizeEnd);
    };
  }, []);

  const handleDeleteSession = async (session) => {
    try {
      const res = await fetch(`/api/sessions/${encodeURIComponent(session.id)}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 404) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Server error (${res.status})`);
      }
    } catch (err) {
      window.alert(`Couldn't delete session: ${err.message}`);
      return;
    }
    await refreshSessionsPreservingSelection({ removedId: session.id });
  };

  if (loading) {
    return <div className="container"><p>Loading sessions...</p></div>;
  }

  if (error) {
    return <div className="container"><p className="error">Error: {error}</p></div>;
  }

  const comingSoon = COMING_SOON[activeSection];

  const sortedSessions = [...sessions].sort((a, b) => {
    const field = sortBy === 'modified' ? 'modifiedAt' : 'timestamp';
    return new Date(b[field] || b.timestamp) - new Date(a[field] || a.timestamp);
  });

  return (
    <div className="app">
      <header className="header">
        <h1>Agent Session Viewer</h1>
        <div className="header-controls">
          <ThemeSwitcher />
        </div>
      </header>
      <div className="main">
        <ActivityRail active={activeSection} onSelect={setActiveSection} />
        {activeSection === 'configurations' ? (
          <Configurations />
        ) : activeSection === 'observability' ? (
          <Observability sessions={sessions} />
        ) : comingSoon ? (
          <ComingSoon {...comingSoon} />
        ) : (
          <>
            <aside className="sidebar" style={{ width: sidebarWidth }}>
              <SessionList
                sessions={sortedSessions}
                selectedSession={selectedSession}
                onSelectSession={handleSelectSession}
                onDeleteSession={handleDeleteSession}
                onTogglePin={handleTogglePin}
                sortBy={sortBy}
                onSortChange={handleSortChange}
              />
            </aside>
            <div className="sidebar-resize-handle" onMouseDown={handleResizeStart} />
            <main className="content">
              {selectedSession ? (
                <SessionDetail
                  key={selectedSession.id}
                  session={selectedSession}
                  reloadToken={timelineReloadToken}
                />
              ) : (
                <p>Select a session to view</p>
              )}
            </main>
            <PlanPanel
              collapsed={planPanelCollapsed}
              onToggleCollapse={() => setPlanPanelCollapsed((c) => !c)}
              session={selectedSession}
            />
          </>
        )}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}
