import React, { useEffect, useState } from 'react';
import { WrenchScrewdriverIcon } from '@heroicons/react/24/outline';
import Timeline from './Timeline';
import SessionKPICards from './SessionKPICards';
import StatusDot from './StatusDot';
import Skeleton from './Skeleton';
import './SessionDetail.css';

// Placeholder counts chosen to match the real footprint: SessionKPICards emits
// seven cards for a single session (six metrics + the average), and three turns
// roughly fill the transcript viewport, so the swap to real content does not
// jump the layout.
const SKELETON_KPI_CARDS = [0, 1, 2, 3, 4, 5, 6];
const SKELETON_TURNS = [0, 1, 2];

// Read-only session viewer: displays historical timeline, KPI cards, and session
// metadata. No live agent attachment, no session creation — sessions are
// created entirely via the CLI and just rendered here.
//
// `reloadToken` bumps on every filesystem-watch 'session-changed' SSE event
// for this session (see App.jsx), triggering a timeline refetch so edits
// made outside the dashboard (e.g. the CLI session continuing) show up
// without a manual page refresh.
export default function SessionDetail({ session, reloadToken }) {
  const [timeline, setTimeline] = useState(null);
  const [timelineStatus, setTimelineStatus] = useState('idle');
  const [timelineError, setTimelineError] = useState('');

  useEffect(() => {
    if (!session) {
      setTimeline(null);
      setTimelineStatus('idle');
      return;
    }

    setTimelineStatus('loading');
    setTimelineError('');

    fetch(`/api/sessions/${encodeURIComponent(session.id)}/timeline`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        setTimeline(data);
        setTimelineStatus('loaded');
      })
      .catch((err) => {
        setTimelineError(err.message);
        setTimelineStatus('error');
      });
  }, [session?.id, reloadToken]);

  if (!session) {
    return (
      <div className="session-detail">
        <p className="session-detail-hint">Select a session to view</p>
      </div>
    );
  }

  return (
    <div className="session-detail">
      <div className="session-detail-header">
        <div className="session-detail-header-top">
          <StatusDot live={false} busy={false} className="session-detail-status-dot" />
          <h1>{session.name}</h1>
          <div className="session-detail-spacer" />
          <button
            className="session-detail-config-button"
            title="Session settings"
            aria-label="Session settings"
          >
            <WrenchScrewdriverIcon width={20} height={20} />
          </button>
        </div>
      </div>

      <div className="session-detail-messages">
        {timelineStatus === 'loading' ? (
          <div className="session-detail-skeleton" role="status" aria-label="Loading timeline">
            <div className="session-detail-skeleton-kpis">
              {SKELETON_KPI_CARDS.map((card) => (
                <div key={card} className="session-detail-skeleton-kpi-card">
                  <Skeleton className="session-detail-skeleton-kpi-icon" />
                  <div className="session-detail-skeleton-kpi-body">
                    <Skeleton className="session-detail-skeleton-kpi-value" width="55%" />
                    <Skeleton className="session-detail-skeleton-kpi-label" width="80%" />
                  </div>
                </div>
              ))}
            </div>
            {SKELETON_TURNS.map((turn) => (
              <div key={turn} className="session-detail-skeleton-turn">
                <Skeleton className="session-detail-skeleton-turn-label" width="7rem" />
                <Skeleton count={turn === 1 ? 3 : 2} className="session-detail-skeleton-turn-line" />
                <Skeleton className="session-detail-skeleton-turn-line" width="45%" />
              </div>
            ))}
          </div>
        ) : (
          <>
            <SessionKPICards sessions={[session]} />

            {timelineStatus === 'error' && (
              <p className="session-detail-hint error">Error loading timeline: {timelineError}</p>
            )}
            {timelineStatus === 'loaded' && timeline && (
              <Timeline timeline={timeline} />
            )}
          </>
        )}
      </div>

      <div className="session-detail-footer">
        <p className="session-detail-readonly-note">
          This dashboard is read-only. Sessions are created via the CLI.
        </p>
      </div>
    </div>
  );
}
