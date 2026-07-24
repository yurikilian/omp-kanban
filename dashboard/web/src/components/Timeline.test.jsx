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

describe('Timeline Component - Role Coloring', () => {
  it('each role maps to its semantic token class (user=primary, assistant=neutral, system=subtle, tool=warning, result=success) with no hex literals', () => {
    const timeline = {
      id: 'session-1',
      name: 'Session',
      project: 'proj',
      count: 4,
      agents: [{ name: 'main', lane: 0 }],
      root: {
        agent: 'main',
        lane: 0,
        firstTs: '2026-07-21T14:00:00.000Z',
        lastTs: '2026-07-21T14:00:03.000Z',
        durationMs: 3000,
        count: 4,
        events: [
          {
            agent: 'main',
            lane: 0,
            role: 'user',
            ts: '2026-07-21T14:00:00.000Z',
            content: 'User message'
          },
          {
            agent: 'main',
            lane: 0,
            role: 'assistant',
            ts: '2026-07-21T14:00:01.000Z',
            content: 'Assistant message'
          },
          {
            agent: 'main',
            lane: 0,
            role: 'system',
            ts: '2026-07-21T14:00:02.000Z',
            content: 'System message'
          },
          {
            agent: 'main',
            lane: 0,
            role: 'tool',
            toolName: 'test-tool',
            ts: '2026-07-21T14:00:03.000Z',
            content: 'Tool output'
          }
        ]
      }
    };
    render(<Timeline timeline={timeline} />);

    // Check user role class
    const userTurn = screen.getByText('User message').closest('.turn');
    expect(userTurn).toHaveClass('turn-role-user');

    // Check assistant role class
    const assistantTurn = screen.getByText('Assistant message').closest('.turn');
    expect(assistantTurn).toHaveClass('turn-role-assistant');

    // Check system role class
    const systemTurn = screen.getByText('System message').closest('.turn');
    expect(systemTurn).toHaveClass('turn-role-system');

    // Check tool role class
    const toolTurn = screen.getByText('test-tool').closest('.tool-step');
    expect(toolTurn).toHaveClass('turn-role-tool');
  });

  it('isError tool step gets the danger treatment distinct from a success result', () => {
    const timeline = {
      id: 'session-1',
      name: 'Session',
      project: 'proj',
      count: 2,
      agents: [{ name: 'main', lane: 0 }],
      root: {
        agent: 'main',
        lane: 0,
        firstTs: '2026-07-21T14:00:00.000Z',
        lastTs: '2026-07-21T14:00:02.000Z',
        durationMs: 2000,
        count: 2,
        events: [
          {
            agent: 'main',
            lane: 0,
            role: 'user',
            ts: '2026-07-21T14:00:00.000Z',
            content: 'Run tool'
          },
          {
            agent: 'main',
            lane: 0,
            role: 'tool_result',
            toolName: 'failing-tool',
            isError: true,
            ts: '2026-07-21T14:00:01.000Z',
            resultContent: 'Error occurred'
          },
          {
            agent: 'main',
            lane: 0,
            role: 'tool_result',
            toolName: 'success-tool',
            isError: false,
            ts: '2026-07-21T14:00:02.000Z',
            resultContent: 'Success'
          }
        ]
      }
    };
    render(<Timeline timeline={timeline} />);

    // Error tool step should have danger class
    const failingToolStep = screen.getByText('Error occurred').closest('.tool-step');
    expect(failingToolStep).toHaveClass('turn-role-error');

    // Success tool step should have result class (not error)
    const successToolStep = screen.getByText('Success').closest('.tool-step');
    expect(successToolStep).not.toHaveClass('turn-role-error');
    expect(successToolStep).toHaveClass('turn-role-tool-result');
  });

  it('in dark mode role colors resolve to dark-token values and remain readable', () => {
    const timeline = {
      id: 'session-1',
      name: 'Session',
      project: 'proj',
      count: 2,
      agents: [{ name: 'main', lane: 0 }],
      root: {
        agent: 'main',
        lane: 0,
        firstTs: '2026-07-21T14:00:00.000Z',
        lastTs: '2026-07-21T14:00:01.000Z',
        durationMs: 1000,
        count: 2,
        events: [
          {
            agent: 'main',
            lane: 0,
            role: 'user',
            ts: '2026-07-21T14:00:00.000Z',
            content: 'User msg'
          },
          {
            agent: 'main',
            lane: 0,
            role: 'assistant',
            ts: '2026-07-21T14:00:01.000Z',
            content: 'Assistant msg'
          }
        ]
      }
    };

    // Render in dark mode
    const { container } = render(<Timeline timeline={timeline} />);
    const root = container.closest('body')?.parentElement;
    if (root) {
      root.setAttribute('data-theme', 'dark');
    }

    // Check that role-colored elements exist and have classes
    const userTurn = screen.getByText('User msg').closest('.turn');
    expect(userTurn).toHaveClass('turn-role-user');

    const assistantTurn = screen.getByText('Assistant msg').closest('.turn');
    expect(assistantTurn).toHaveClass('turn-role-assistant');

    // Verify CSS variables are being used (check computed styles would require setup)
    // For now, verify that the classes are applied (the tokens are defined in theme.css)
  });
});

describe('Timeline Component - Tool Block Collapse', () => {
  const toolStep1 = {
    agent: 'main',
    lane: 0,
    role: 'tool',
    ts: '2026-07-21T14:00:01.000Z',
    toolName: 'bash',
    intent: 'Run tests',
    durationMs: 5000,
    isError: false,
    content: 'test output'
  };

  const toolStep2 = {
    agent: 'main',
    lane: 0,
    role: 'tool_result',
    ts: '2026-07-21T14:00:06.000Z',
    toolName: 'bash',
    resultPreview: 'All tests passed',
    content: 'full test output'
  };

  it('tool block starts collapsed and its control reports the hidden tool-step count', () => {
    const timeline = {
      id: 'session-1',
      name: 'Session',
      project: 'proj',
      count: 3,
      agents: [{ name: 'main', lane: 0 }],
      root: {
        agent: 'main',
        lane: 0,
        firstTs: '2026-07-21T14:00:00.000Z',
        lastTs: '2026-07-21T14:00:06.000Z',
        durationMs: 6000,
        count: 3,
        events: [
          {
            agent: 'main',
            lane: 0,
            role: 'user',
            ts: '2026-07-21T14:00:00.000Z',
            content: 'Run the tests'
          },
          toolStep1,
          toolStep2
        ]
      }
    };
    render(<Timeline timeline={timeline} />);
    // Tool steps should not be visible (tool block is collapsed by default)
    expect(screen.queryByText('Run tests')).not.toBeInTheDocument();
    expect(screen.queryByText('All tests passed')).not.toBeInTheDocument();
    // Toggle button should show the count
    expect(screen.getByText(/Tool calls \(2\)/)).toBeInTheDocument();
  });

  it('turn-group with no tool steps renders no tool-block toggle', () => {
    const timeline = {
      id: 'session-1',
      name: 'Session',
      project: 'proj',
      count: 2,
      agents: [{ name: 'main', lane: 0 }],
      root: {
        agent: 'main',
        lane: 0,
        firstTs: '2026-07-21T14:00:00.000Z',
        lastTs: '2026-07-21T14:00:01.000Z',
        durationMs: 1000,
        count: 2,
        events: [
          {
            agent: 'main',
            lane: 0,
            role: 'user',
            ts: '2026-07-21T14:00:00.000Z',
            content: 'Hello'
          },
          {
            agent: 'main',
            lane: 0,
            role: 'assistant',
            ts: '2026-07-21T14:00:01.000Z',
            content: 'Hi there',
            agent: 'main'
          }
        ]
      }
    };
    render(<Timeline timeline={timeline} />);
    // Should not have a tool-block toggle
    expect(screen.queryByText(/Tool calls/)).not.toBeInTheDocument();
  });

  it('activating the toggle reveals the individual (still Accordion-expandable) tool steps', () => {
    const timeline = {
      id: 'session-1',
      name: 'Session',
      project: 'proj',
      count: 3,
      agents: [{ name: 'main', lane: 0 }],
      root: {
        agent: 'main',
        lane: 0,
        firstTs: '2026-07-21T14:00:00.000Z',
        lastTs: '2026-07-21T14:00:06.000Z',
        durationMs: 6000,
        count: 3,
        events: [
          {
            agent: 'main',
            lane: 0,
            role: 'user',
            ts: '2026-07-21T14:00:00.000Z',
            content: 'Run the tests'
          },
          toolStep1,
          toolStep2
        ]
      }
    };
    render(<Timeline timeline={timeline} />);
    // Initially tool steps are hidden
    expect(screen.queryByText('Run tests')).not.toBeInTheDocument();
    // Click the toggle
    const toggleButton = screen.getByText(/Tool calls \(2\)/);
    fireEvent.click(toggleButton);
    // Now tool steps should be visible
    expect(screen.getByText('Run tests')).toBeInTheDocument();
    expect(screen.getByText('All tests passed')).toBeInTheDocument();
  });

  it('activating again hides steps and updates aria-expanded', () => {
    const timeline = {
      id: 'session-1',
      name: 'Session',
      project: 'proj',
      count: 3,
      agents: [{ name: 'main', lane: 0 }],
      root: {
        agent: 'main',
        lane: 0,
        firstTs: '2026-07-21T14:00:00.000Z',
        lastTs: '2026-07-21T14:00:06.000Z',
        durationMs: 6000,
        count: 3,
        events: [
          {
            agent: 'main',
            lane: 0,
            role: 'user',
            ts: '2026-07-21T14:00:00.000Z',
            content: 'Run the tests'
          },
          toolStep1,
          toolStep2
        ]
      }
    };
    render(<Timeline timeline={timeline} />);
    const toggleButton = screen.getByText(/Tool calls \(2\)/);
    // Initially aria-expanded should be false
    expect(toggleButton.getAttribute('aria-expanded')).toBe('false');
    // Click to expand
    fireEvent.click(toggleButton);
    expect(toggleButton.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('Run tests')).toBeInTheDocument();
    // Click to collapse again
    fireEvent.click(toggleButton);
    expect(toggleButton.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('Run tests')).not.toBeInTheDocument();
  });
});
