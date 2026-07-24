import React, { useMemo } from 'react';
import {
  CurrencyDollarIcon,
  ArrowDownTrayIcon,
  ArrowUpTrayIcon,
  ChatBubbleLeftRightIcon,
  WrenchScrewdriverIcon,
  UserGroupIcon,
  ChartBarIcon
} from '@heroicons/react/24/outline';
import { formatCost, formatCount } from '../utils/format';
import './SessionKPICards.css';

// Sums each session's server-computed `stats` (cost/tokens/messages/tool
// calls/agents, already folded across every nested sub-agent transcript —
// see summarizeSessionStats/foldSubtaskStats in server/src/sessions.js).
function aggregateStats(sessions) {
  return sessions.reduce(
    (acc, s) => {
      const stats = s.stats || {};
      acc.cost += stats.cost || 0;
      acc.inputTokens += stats.inputTokens || 0;
      acc.outputTokens += stats.outputTokens || 0;
      acc.messageCount += stats.messageCount || 0;
      acc.toolCallCount += stats.toolCallCount || 0;
      acc.agentCount += stats.agentCount || 0;
      return acc;
    },
    { cost: 0, inputTokens: 0, outputTokens: 0, messageCount: 0, toolCallCount: 0, agentCount: 0 }
  );
}

export default function SessionKPICards({ sessions, showAverage = true }) {
  const totals = useMemo(() => aggregateStats(sessions), [sessions]);
  const sessionCount = sessions.length;
  const avgCost = sessionCount > 0 ? totals.cost / sessionCount : 0;

  const cards = [
    { label: 'Total Cost', value: formatCost(totals.cost), icon: CurrencyDollarIcon },
    { label: 'Input Tokens', value: formatCount(totals.inputTokens), icon: ArrowDownTrayIcon },
    { label: 'Output Tokens', value: formatCount(totals.outputTokens), icon: ArrowUpTrayIcon },
    { label: 'Messages', value: formatCount(totals.messageCount), icon: ChatBubbleLeftRightIcon },
    { label: 'Tool Calls', value: formatCount(totals.toolCallCount), icon: WrenchScrewdriverIcon },
    { label: 'Agents', value: formatCount(totals.agentCount), icon: UserGroupIcon }
    // "Sessions" itself is intentionally omitted — already shown by the
    // session-count badge next to the "Sessions" heading above this grid.
  ];
  // Meaningless (identical to Total Cost) when summarizing a single session,
  // e.g. the transcript header's per-session card block.
  if (showAverage) {
    cards.push({ label: 'Avg Cost / Session', value: formatCost(avgCost), icon: ChartBarIcon });
  }

  return (
    <div className="session-kpi-cards" role="group" aria-label="Session statistics">
      {cards.map(({ label, value, icon: Icon }) => (
        <div className="session-kpi-card" key={label}>
          <Icon className="session-kpi-card-icon" aria-hidden="true" />
          <div className="session-kpi-card-body">
            <span className="session-kpi-card-value">{value}</span>
            <span className="session-kpi-card-label">{label}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
