import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Accordion from './Accordion';
import ContentView from './content/ContentView';
import './Timeline.css';

const LANE_COLORS = ['#3b82f6', '#22c55e', '#a855f7', '#f59e0b', '#ec4899', '#14b8a6', '#f97316', '#8b5cf6'];
const ERROR_COLOR = '#ef4444';

function laneColor(lane) {
  if (lane === 0) return LANE_COLORS[0];
  return LANE_COLORS[lane % LANE_COLORS.length];
}

function formatRelative(ts, refIso) {
  if (!ts || !refIso) return '';
  const diffS = (Date.parse(refIso) - Date.parse(ts)) / 1000;
  if (diffS < 5) return 'now';
  if (diffS < 60) return `${Math.round(diffS)}s ago`;
  if (diffS < 3600) return `${Math.round(diffS / 60)} min ago`;
  if (diffS < 86400) return `${Math.round(diffS / 3600)} h ago`;
  return `${Math.round(diffS / 86400)} d ago`;
}

function formatDuration(ms) {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) {
    const min = Math.floor(ms / 60000);
    const sec = Math.round((ms % 60000) / 1000);
    return `${min} min ${sec} s`;
  }
  const h = Math.floor(ms / 3600000);
  const min = Math.round((ms % 3600000) / 60000);
  return `${h} h ${min} min`;
}

function compact(n) {
  if (n == null) return '';
  return n < 1000 ? String(n) : `${Math.round(n / 1000)}K`;
}

function isToolRole(role) {
  return role === 'tool' || role === 'tool_result' || role === 'tool_execution';
}

function isToolStep(ev) {
  return isToolRole(ev.role);
}

function isUserRole(role) {
  return role === 'user';
}
/**
 * Maps an event role to a semantic token-based CSS class name.
 * Each class is defined in Timeline.css with colors from semantic tokens (--primary, --neutral, --warning, --success, --danger).
 */
function roleToClassName(role, isError = false) {
  if (isError) {
    return 'turn-role-error';
  }
  switch (role) {
    case 'user':
      return 'turn-role-user';
    case 'assistant':
      return 'turn-role-assistant';
    case 'system':
      return 'turn-role-system';
    case 'tool':
    case 'tool_execution':
      return 'turn-role-tool';
    case 'tool_result':
      return 'turn-role-tool-result';
    default:
      return '';
  }
}


/**
 * Groups events into turn blocks.
 * - Leading non-user events form one 'leading' group
 * - Each user event starts a 'turn' group containing it + following non-user events until next user
 * - Returns array of { groupType, userEvent?, followingEvents }
 */
function groupEventsByTurn(events) {
  if (!events || events.length === 0) return [];

  const groups = [];
  let leadingEvents = [];
  let foundFirstUser = false;
  let currentTurnUser = null;
  let currentTurnFollowing = [];

  for (const ev of events) {
    if (isUserRole(ev.role)) {
      // Hit a user event; finalize any pending groups
      if (!foundFirstUser && leadingEvents.length > 0) {
        groups.push({ groupType: 'leading', followingEvents: leadingEvents });
        leadingEvents = [];
      } else if (currentTurnUser !== null) {
        groups.push({ groupType: 'turn', userEvent: currentTurnUser, followingEvents: currentTurnFollowing });
        currentTurnFollowing = [];
      }
      foundFirstUser = true;
      currentTurnUser = ev;
    } else {
      // Non-user event
      if (!foundFirstUser) {
        leadingEvents.push(ev);
      } else {
        currentTurnFollowing.push(ev);
      }
    }
  }

  // Finalize remaining groups
  if (!foundFirstUser && leadingEvents.length > 0) {
    groups.push({ groupType: 'leading', followingEvents: leadingEvents });
  } else if (currentTurnUser !== null) {
    groups.push({ groupType: 'turn', userEvent: currentTurnUser, followingEvents: currentTurnFollowing });
  }

  return groups;
}

function toolIcon(ev) {
  if (ev.role === 'tool_execution') return '🔧';
  return ev.isError ? '✕' : '✓';
}

function rowPreview(ev) {
  if (isToolRole(ev.role)) {
    return ev.intent || ev.resultPreview || ev.content || '';
  }
  return (ev.content || '').split('\n')[0];
}

// Recursively find the most recent `ts` across a node and every nested
// child timeline, used as the "now" reference for relative-time labels.
function maxTs(node, acc) {
  for (const ev of node.events) {
    if (!acc || ev.ts > acc) acc = ev.ts;
    if (ev.children) {
      for (const child of ev.children) acc = maxTs(child, acc);
    }
  }
  return acc;
}

// Recursively count every event in a node and its nested children, used to
// detect and report per-agent truncation (each node is independently capped
// server-side at 1000 events).
function countNode(node) {
  let n = node.events.length;
  for (const ev of node.events) {
    if (ev.children) {
      for (const child of ev.children) n += countNode(child);
    }
  }
  return n;
}

/**
 * A single conversation turn. User prompts render as tinted prompt blocks,
 * assistant replies as flowing rendered markdown, tool calls as compact
 * collapsible steps. If this turn spawned one or more sub-agents, their
 * nested timelines are rendered directly beneath it (enclosed, collapsed
 * by default) so the parent/child relationship is explicit instead of
 * inferred from a shared global rail.
 */
function ConversationTurn({ ev, refIso }) {
  const color = laneColor(ev.lane);
  const roleClass = roleToClassName(ev.role, ev.isError);
  let turn;
  if (ev.role === 'user') {
    turn = (
      <div className={`turn turn-user ${roleClass}`}>
        <div className="turn-head">
          <span className="turn-who">You</span>
          <span className="turn-time" title={ev.ts}>{formatRelative(ev.ts, refIso)}</span>
        </div>
        <div className="turn-body turn-user-body markdown-body">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{ev.content || ''}</ReactMarkdown>
        </div>
      </div>
    );
  } else if (ev.role === 'assistant') {
    turn = (
      <div className={`turn turn-assistant ${roleClass}`} style={{ '--lane-color': color }}>
        <div className="turn-head">
          <span className="turn-who turn-agent" style={{ color }}>{ev.agent}</span>
          <span className="turn-time" title={ev.ts}>{formatRelative(ev.ts, refIso)}</span>
          {ev.tokensIn != null && (
            <span className="turn-tokens">
              ↓{compact(ev.tokensIn)} ↑{compact(ev.tokensOut)}
              {ev.cost != null && ` $${ev.cost.toFixed(2)}`}
            </span>
          )}
        </div>
        <div className="turn-body markdown-body">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{ev.content || ''}</ReactMarkdown>
        </div>
      </div>
    );
  } else if (isToolRole(ev.role)) {
    turn = <ToolStep ev={ev} />;
  } else if (ev.role === 'system') {
    turn = <div className={`turn turn-system ${roleClass}`}>{ev.content}</div>;
  } else {
    turn = null;
  }
  return (
    <div className="turn-wrap">
      {turn}
      {ev.children && ev.children.length > 0 && (
        <div className="timeline-children">
          {ev.children.map(child => (
            <AgentSection key={child.agent} node={child} refIso={refIso} />
          ))}
        </div>
      )}
    </div>
  );
}

/** A compact, collapsible tool-call step within the conversation flow. */
function ToolStep({ ev }) {
  const content = ev.resultContent ?? ev.content;
  const roleClass = roleToClassName(ev.role, ev.isError);
  const title = (
    <span className="tool-step-head">
      <span className="tool-step-name">{toolIcon(ev)} {ev.toolName || ''}</span>
      {ev.intent && <span className="tool-step-intent">{ev.intent}</span>}
      {ev.durationMs != null && <span className="tool-step-dur">{formatDuration(ev.durationMs)}</span>}
    </span>
  );
  return (
    <div className={`timeline-row-wrap tool-step ${roleClass} ${ev.isError ? 'timeline-row-error' : ''}`}>
      <Accordion title={title} nested>
        <ContentView toolName={ev.toolName} content={content} />
      </Accordion>
    </div>
  );
}

/**
 * Renders a group of events (a turn or leading group).
 * For a 'turn' group: renders user event + following events.
 * For a 'leading' group: renders all non-user events before first user.
 */
function TurnGroup({ group, refIso }) {
  const { groupType, userEvent, followingEvents } = group;
  const [isToolBlockExpanded, setIsToolBlockExpanded] = useState(false);

  // Separate tool steps from other events
  const toolSteps = followingEvents.filter(isToolStep);
  const nonToolEvents = followingEvents.filter(ev => !isToolStep(ev));

  // Extract children from tool steps (to render outside the collapsed tool-block)
  const toolStepsWithChildren = toolSteps.flatMap(ev => ev.children || []);

  if (groupType === 'leading') {
    return (
      <div className="turn-group turn-group-leading">
        {followingEvents.map((ev, idx) => (
          <ConversationTurn key={`leading-${ev.ts}-${idx}`} ev={ev} refIso={refIso} />
        ))}
      </div>
    );
  }

  return (
    <div className="turn-group turn-group-turn">
      <ConversationTurn ev={userEvent} refIso={refIso} />
      {nonToolEvents.length > 0 && (
        <div className="turn-group-following">
          {nonToolEvents.map((ev, idx) => (
            <ConversationTurn key={`${userEvent.ts}-${ev.ts}-${idx}`} ev={ev} refIso={refIso} />
          ))}
        </div>
      )}
      {toolStepsWithChildren.length > 0 && (
        <div className="timeline-children">
          {toolStepsWithChildren.map(child => (
            <AgentSection key={child.agent} node={child} refIso={refIso} />
          ))}
        </div>
      )}
      {toolSteps.length > 0 && (
        <div className="tool-block">
          <button
            type="button"
            className="tool-block-toggle"
            onClick={() => setIsToolBlockExpanded(s => !s)}
            aria-expanded={isToolBlockExpanded}
          >
            Tool calls ({toolSteps.length})
          </button>
          {isToolBlockExpanded && (
            <div className="tool-block-content">
              {toolSteps.map((ev, idx) => {
                // Create a copy without children to avoid rendering them twice
                const evWithoutChildren = { ...ev, children: undefined };
                return <ConversationTurn key={`${userEvent.ts}-${ev.ts}-${idx}`} ev={evWithoutChildren} refIso={refIso} />;
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * One agent's own timeline. The root (`main`) renders inline, always
 * expanded. Every nested sub-agent renders as a collapsed, enclosed,
 * colored box the user expands to reveal that agent's own rows — an
 * explicit tree instead of a flat, globally-merged list.
 */
function AgentSection({ node, refIso, isRoot = false }) {
  const [open, setOpen] = useState(isRoot);
  const color = laneColor(node.lane);
  const events = node.events;

  const groups = groupEventsByTurn(events);
  const rows = groups.map((group, idx) => (
    <TurnGroup key={`${group.groupType}-${idx}`} group={group} refIso={refIso} />
  ));

  if (isRoot) {
    return <div className="timeline-section timeline-root">{rows}</div>;
  }

  return (
    <div className="timeline-section timeline-nested" style={{ borderColor: color }}>
      <button
        type="button"
        className={`timeline-section-header ${open ? 'open' : ''}`}
        onClick={() => setOpen(o => !o)}
      >
        <span className="timeline-section-icon" style={{ color }}>▶</span>
        <span className="timeline-badge" style={{ background: `${color}22`, color }}>{node.agent}</span>
        <span className="timeline-section-meta">
          {node.count} event{node.count === 1 ? '' : 's'} · {formatRelative(node.firstTs, refIso)} → {formatRelative(node.lastTs, refIso)}
        </span>
      </button>
      {open && <div className="timeline-section-body">{rows}</div>}
    </div>
  );
}

export default function Timeline({ timeline }) {
  if (!timeline || !timeline.root || timeline.root.events.length === 0) {
    return (
      <div className="timeline">
        <p>No timeline events.</p>
      </div>
    );
  }

  const refIso = maxTs(timeline.root) || timeline.root.events[0].ts;
  const unlinked = timeline.unlinked || [];
  const renderedCount = countNode(timeline.root) + unlinked.reduce((sum, n) => sum + countNode(n), 0);

  return (
    <div className="timeline">
      {timeline.count > renderedCount && (
        <p className="timeline-truncation-note">
          Showing most recent {renderedCount} of {timeline.count} events (each agent capped at 1000).
        </p>
      )}
      <AgentSection node={timeline.root} refIso={refIso} isRoot />
      {unlinked.length > 0 && (
        <div className="timeline-unlinked">
          <p className="timeline-section-meta">Other agents (no detected spawn point):</p>
          {unlinked.map(node => <AgentSection key={node.agent} node={node} refIso={refIso} />)}
        </div>
      )}
    </div>
  );
}
export { groupEventsByTurn };
