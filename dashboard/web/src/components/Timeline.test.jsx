import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import Timeline, { groupEventsByTurn } from './Timeline';

describe('groupEventsByTurn', () => {
  it('groups a user event with following assistant/tool/system events into one bounded block, splitting at the next user event', () => {
    const events = [
      { role: 'user', content: 'First prompt', ts: '2026-07-21T14:00:00.000Z', agent: 'main' },
      { role: 'assistant', content: 'First reply', ts: '2026-07-21T14:00:01.000Z', agent: 'main' },
      { role: 'tool', toolName: 'bash', ts: '2026-07-21T14:00:02.000Z', agent: 'main' },
      { role: 'user', content: 'Second prompt', ts: '2026-07-21T14:00:03.000Z', agent: 'main' },
      { role: 'assistant', content: 'Second reply', ts: '2026-07-21T14:00:04.000Z', agent: 'main' }
    ];
    const groups = groupEventsByTurn(events);
    expect(groups).toHaveLength(2);
    expect(groups[0].groupType).toBe('turn');
    expect(groups[0].userEvent).toBe(events[0]);
    expect(groups[0].followingEvents).toEqual([events[1], events[2]]);
    expect(groups[1].groupType).toBe('turn');
    expect(groups[1].userEvent).toBe(events[3]);
    expect(groups[1].followingEvents).toEqual([events[4]]);
  });

  it('leading assistant/tool events before any user event form one leading group with no orphaned events', () => {
    const events = [
      { role: 'assistant', content: 'First reply', ts: '2026-07-21T14:00:00.000Z', agent: 'main' },
      { role: 'tool', toolName: 'bash', ts: '2026-07-21T14:00:01.000Z', agent: 'main' },
      { role: 'system', content: 'System message', ts: '2026-07-21T14:00:02.000Z', agent: 'main' },
      { role: 'user', content: 'User prompt', ts: '2026-07-21T14:00:03.000Z', agent: 'main' }
    ];
    const groups = groupEventsByTurn(events);
    expect(groups).toHaveLength(2);
    expect(groups[0].groupType).toBe('leading');
    expect(groups[0].followingEvents).toEqual([events[0], events[1], events[2]]);
    expect(groups[1].groupType).toBe('turn');
    expect(groups[1].userEvent).toBe(events[3]);
  });

  it('returns empty array for empty events list', () => {
    const groups = groupEventsByTurn([]);
    expect(groups).toEqual([]);
  });

  it('preserves nested children within their parent turn group', () => {
    const childAgent = {
      agent: 'ServerGo',
      lane: 1,
      events: [{ role: 'tool', ts: '2026-07-21T14:00:02.000Z' }]
    };
    const events = [
      { role: 'user', content: 'Prompt', ts: '2026-07-21T14:00:00.000Z', agent: 'main' },
      { role: 'tool', toolName: 'bash', ts: '2026-07-21T14:00:01.000Z', agent: 'main', children: [childAgent] },
      { role: 'assistant', content: 'Reply', ts: '2026-07-21T14:00:03.000Z', agent: 'main' }
    ];
    const groups = groupEventsByTurn(events);
    expect(groups[0].followingEvents[0].children).toEqual([childAgent]);
  });

  it('handles only non-user events (all leading)', () => {
    const events = [
      { role: 'assistant', content: 'Reply', ts: '2026-07-21T14:00:00.000Z', agent: 'main' },
      { role: 'tool', toolName: 'bash', ts: '2026-07-21T14:00:01.000Z', agent: 'main' }
    ];
    const groups = groupEventsByTurn(events);
    expect(groups).toHaveLength(1);
    expect(groups[0].groupType).toBe('leading');
    expect(groups[0].followingEvents).toEqual(events);
  });

  it('handles only user events', () => {
    const events = [
      { role: 'user', content: 'First', ts: '2026-07-21T14:00:00.000Z', agent: 'main' },
      { role: 'user', content: 'Second', ts: '2026-07-21T14:00:01.000Z', agent: 'main' }
    ];
    const groups = groupEventsByTurn(events);
    expect(groups).toHaveLength(2);
    expect(groups[0].followingEvents).toEqual([]);
    expect(groups[1].followingEvents).toEqual([]);
  });
});

describe('Timeline Component', () => {
  const childTool = {
    agent: 'ServerGo',
    lane: 1,
    role: 'tool',
    ts: '2026-07-21T14:01:30.000Z',
    toolName: 'bash',
    intent: 'Run build',
    durationMs: 701000,
    isError: true,
    resultContent: 'build failed'
  };

  const timeline = {
    id: 'session-1',
    name: 'Session',
    project: 'proj',
    count: 3,
    agents: [
      { name: 'main', lane: 0 },
      { name: 'ServerGo', lane: 1 }
    ],
    root: {
      agent: 'main',
      lane: 0,
      firstTs: '2026-07-21T14:00:00.000Z',
      lastTs: '2026-07-21T14:05:00.000Z',
      durationMs: 300000,
      count: 2,
      events: [
        {
          agent: 'main',
          lane: 0,
          role: 'user',
          ts: '2026-07-21T14:00:00.000Z',
          content: 'Start the task'
        },
        {
          agent: 'main',
          lane: 0,
          role: 'tool',
          ts: '2026-07-21T14:01:00.000Z',
          toolName: 'task',
          intent: 'Spawn a build agent',
          durationMs: 20,
          resultContent: 'Spawned 1 agent.',
          children: [
            {
              agent: 'ServerGo',
              lane: 1,
              firstTs: '2026-07-21T14:01:30.000Z',
              lastTs: '2026-07-21T14:01:30.000Z',
              durationMs: 0,
              count: 1,
              events: [childTool]
            }
          ]
        },
        {
          agent: 'main',
          lane: 0,
          role: 'assistant',
          ts: '2026-07-21T14:05:00.000Z',
          content: 'Done.',
          tokensIn: 2,
          tokensOut: 7210,
          cost: 0.2
        }
      ]
    }
  };

  it('renders "No timeline events." for an empty timeline', () => {
    render(<Timeline timeline={{ ...timeline, root: { ...timeline.root, events: [] } }} />);
    expect(screen.getByText('No timeline events.')).toBeInTheDocument();
  });

  it('renders a relative-time label for the newest row', () => {
    render(<Timeline timeline={timeline} />);
    expect(screen.getByText('now')).toBeInTheDocument();
  });

  it('compacts large token counts (7210 -> 7K)', () => {
    render(<Timeline timeline={timeline} />);
    expect(screen.getByText(/↓2 ↑7K \$0\.20/)).toBeInTheDocument();
  });

  it('renders a spawning row alongside a collapsed, enclosed child agent section', () => {
    render(<Timeline timeline={timeline} />);
    // The child agent's own rows are not visible until its section is expanded.
    expect(screen.queryByText('✕ bash')).not.toBeInTheDocument();
    expect(screen.getByText('ServerGo')).toBeInTheDocument();
    expect(screen.getByText(/1 event/)).toBeInTheDocument();
  });

  it('expands a nested agent section on click to reveal its rows, including error state', () => {
    render(<Timeline timeline={timeline} />);
    fireEvent.click(screen.getByText('ServerGo').closest('.timeline-section-header'));
    expect(screen.getByText('✕ bash')).toBeInTheDocument();
    expect(screen.getByText('11 min 41 s')).toBeInTheDocument();
    const row = screen.getByText('✕ bash').closest('.timeline-row-wrap');
    expect(row.className).toContain('timeline-row-error');
  });

  it('shows a truncation note when count exceeds the rendered events', () => {
    render(<Timeline timeline={{ ...timeline, count: 10 }} />);
    expect(screen.getByText(/Showing most recent 4 of 10 events/)).toBeInTheDocument();
  });

  it('renders a user prompt as a distinct prose block', () => {
    render(<Timeline timeline={timeline} />);
    const el = screen.getByText('Start the task');
    expect(el.closest('.turn-user')).not.toBeNull();
  });

  it('renders an assistant reply as markdown prose, after the user turn in document order', () => {
    render(<Timeline timeline={timeline} />);
    const assistantEl = screen.getByText('Done.');
    expect(assistantEl.closest('.turn-assistant .markdown-body')).not.toBeNull();
    const userTurn = screen.getByText('Start the task').closest('.turn-user');
    const assistantTurn = assistantEl.closest('.turn-assistant');
    // eslint-disable-next-line no-bitwise
    expect(userTurn.compareDocumentPosition(assistantTurn) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('Timeline Component - Turn Grouping', () => {
  const childTool = {
    agent: 'ServerGo',
    lane: 1,
    role: 'tool',
    ts: '2026-07-21T14:01:30.000Z',
    toolName: 'bash',
    intent: 'Run build',
    durationMs: 701000,
    isError: true,
    resultContent: 'build failed'
  };

  it('a turn that spawned sub-agents still renders its nested AgentSection within the turn group', () => {
    const timeline = {
      id: 'session-1',
      name: 'Session',
      project: 'proj',
      count: 3,
      agents: [
        { name: 'main', lane: 0 },
        { name: 'ServerGo', lane: 1 }
      ],
      root: {
        agent: 'main',
        lane: 0,
        firstTs: '2026-07-21T14:00:00.000Z',
        lastTs: '2026-07-21T14:05:00.000Z',
        durationMs: 300000,
        count: 2,
        events: [
          {
            agent: 'main',
            lane: 0,
            role: 'user',
            ts: '2026-07-21T14:00:00.000Z',
            content: 'Start the task'
          },
          {
            agent: 'main',
            lane: 0,
            role: 'tool',
            ts: '2026-07-21T14:01:00.000Z',
            toolName: 'task',
            intent: 'Spawn a build agent',
            durationMs: 20,
            resultContent: 'Spawned 1 agent.',
            children: [
              {
                agent: 'ServerGo',
                lane: 1,
                firstTs: '2026-07-21T14:01:30.000Z',
                lastTs: '2026-07-21T14:01:30.000Z',
                durationMs: 0,
                count: 1,
                events: [childTool]
              }
            ]
          }
        ]
      }
    };
    render(<Timeline timeline={timeline} />);
    // The user turn should be present
    expect(screen.getByText('Start the task')).toBeInTheDocument();
    // The tool step should be present within the turn (check for Accordion button with intent text)
    expect(screen.getByText(/Spawn a build agent/)).toBeInTheDocument();
    // The nested agent section should be present (but initially collapsed)
    expect(screen.getByText('ServerGo')).toBeInTheDocument();
    // Expand the nested section
    fireEvent.click(screen.getByText('ServerGo').closest('.timeline-section-header'));
    // Now the child tool should be visible
    expect(screen.getByText('✕ bash')).toBeInTheDocument();
  });
});
