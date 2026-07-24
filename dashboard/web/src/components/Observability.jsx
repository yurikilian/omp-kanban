import React, { useMemo } from 'react';
import SessionKPICards from './SessionKPICards';
import { formatCost, formatCount } from '../utils/format';
import './Observability.css';

export default function Observability({ sessions }) {
  const sorted = useMemo(
    () => [...sessions].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)),
    [sessions]
  );

  return (
    <div className="observability">
      <div className="observability-header">
        <h2>Observability</h2>
        <p>Metrics, traces, and cost breakdowns across your agent sessions.</p>
      </div>

      <section className="observability-section">
        <h3>All sessions</h3>
        <SessionKPICards sessions={sessions} />
      </section>

      <section className="observability-section">
        <h3>Per session</h3>
        {sorted.length === 0 ? (
          <p className="observability-empty">No sessions yet.</p>
        ) : (
          <div className="observability-table-wrap">
            <table className="observability-table">
              <thead>
                <tr>
                  <th>Session</th>
                  <th>Cost</th>
                  <th>Input Tokens</th>
                  <th>Output Tokens</th>
                  <th>Messages</th>
                  <th>Tool Calls</th>
                  <th>Agents</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((session) => {
                  const stats = session.stats || {};
                  return (
                    <tr key={session.id}>
                      <td className="observability-table-session">
                        <span className="observability-table-name">{session.name || 'Untitled session'}</span>
                        <span className="observability-table-date">
                          {new Date(session.timestamp).toLocaleDateString()}
                        </span>
                      </td>
                      <td>{formatCost(stats.cost)}</td>
                      <td>{formatCount(stats.inputTokens)}</td>
                      <td>{formatCount(stats.outputTokens)}</td>
                      <td>{formatCount(stats.messageCount)}</td>
                      <td>{formatCount(stats.toolCallCount)}</td>
                      <td>{formatCount(stats.agentCount)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
