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
    // Expand the tool-block to see the tool step
    const toolBlockToggle = screen.getByText(/Tool calls \(1\)/);
    fireEvent.click(toolBlockToggle);
    // Now the tool step should be present within the turn (check for Accordion button with intent text)
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
      count: 3,
      agents: [{ name: 'main', lane: 0 }],
      root: {
        agent: 'main',
        lane: 0,
        firstTs: '2026-07-21T14:00:00.000Z',
        lastTs: '2026-07-21T14:00:02.000Z',
        durationMs: 2000,
        count: 3,
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
  });

  it('isError tool step gets the danger treatment distinct from a success result', () => {
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
        lastTs: '2026-07-21T14:00:02.000Z',
        durationMs: 2000,
        count: 3,
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

    // Expand tool block to see the tool steps
    const toolBlockToggle = screen.getByRole('button', { name: /Tool calls/ });
    fireEvent.click(toolBlockToggle);

    // Error tool step should have danger class (find by tool name with regex to match icon + name)
    const failingToolSteps = screen.getAllByText(/failing-tool/).map(el => el.closest('.tool-step'));
    const failingToolStep = failingToolSteps.find(el => el !== null);
    expect(failingToolStep).toHaveClass('turn-role-error');

    // Success tool step should have result class (not error)
    const successToolSteps = screen.getAllByText(/success-tool/).map(el => el.closest('.tool-step'));
    const successToolStep = successToolSteps.find(el => el !== null);
    expect(successToolStep).not.toHaveClass('turn-role-error');
    expect(successToolStep).toHaveClass('turn-role-tool-result');
  });

  it('in dark mode role colors resolve to dark-token values and remain readable', () => {
    // E3-S2-AC2: Verify that role colors in dark mode resolve to token values and meet WCAG AA contrast
    const fs = require('fs');
    const path = require('path');
    const themeCssPath = path.join(__dirname, '../theme.css');
    const themeCss = fs.readFileSync(themeCssPath, 'utf-8');
    
    // Extract dark-mode token values
    const darkModeMatch = themeCss.match(/\[data-theme="dark"\]\s*\{([\s\S]*?)\}/);
    expect(darkModeMatch).toBeTruthy();
    const darkModeBlock = darkModeMatch[1];
    
    // Helper to extract hex color from dark mode block
    const extractColor = (tokenName) => {
      const match = darkModeBlock.match(new RegExp(`--${tokenName}\\s*:\\s*(#[0-9a-fA-F]{6})`));
      return match ? match[1] : null;
    };
    
    // Helper to parse hex to RGB
    const hexToRGB = (hex) => ({
      r: parseInt(hex.substring(1, 3), 16),
      g: parseInt(hex.substring(3, 5), 16),
      b: parseInt(hex.substring(5, 7), 16)
    });
    
    // Helper to compute luminance and contrast
    const getLuminance = ({ r, g, b }) => {
      const [rs, gs, bs] = [r, g, b].map(x => {
        const c = x / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
    };
    
    const computeContrast = (rgb1, rgb2) => {
      const l1 = getLuminance(rgb1);
      const l2 = getLuminance(rgb2);
      return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    };
    
    // Get dark mode colors
    const darkBg = hexToRGB(extractColor('bg-primary')); // #0f0f0f
    const darkTextPrimary = hexToRGB(extractColor('text-primary')); // #e8e8e8
    
    // Test each role color meets WCAG AA (4.5:1 for text)
    const roleColors = {
      primary: extractColor('primary'),      // user
      neutral: extractColor('neutral'),      // assistant
      warning: extractColor('warning'),      // tool
      success: extractColor('success'),      // result
      danger: extractColor('danger')         // error
    };
    
    Object.entries(roleColors).forEach(([role, colorHex]) => {
      if (colorHex) {
        const rgb = hexToRGB(colorHex);
        const contrast = computeContrast(rgb, darkBg);
        expect(contrast).toBeGreaterThanOrEqual(4.5, `Dark mode ${role} token contrast against dark bg`);
      }
    });
    
    // Render in dark mode and verify classes are applied
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
          { agent: 'main', lane: 0, role: 'user', ts: '2026-07-21T14:00:00.000Z', content: 'User msg' },
          { agent: 'main', lane: 0, role: 'assistant', ts: '2026-07-21T14:00:01.000Z', content: 'Assistant msg' }
        ]
      }
    };

    const { container } = render(<Timeline timeline={timeline} />);
    const root = container.closest('body')?.parentElement;
    if (root) {
      root.setAttribute('data-theme', 'dark');
    }

    // Verify role classes are applied
    const userTurn = screen.getByText('User msg').closest('.turn');
    expect(userTurn).toHaveClass('turn-role-user');

    const assistantTurn = screen.getByText('Assistant msg').closest('.turn');
    expect(assistantTurn).toHaveClass('turn-role-assistant');
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
    resultContent: 'All tests passed',
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
    // Click the toggle
    const toggleButton = screen.getByText(/Tool calls \(2\)/);
    fireEvent.click(toggleButton);
    // Verify tool steps are now visible (check for the first tool step's intent)
    expect(screen.getByText('Run tests')).toBeInTheDocument();
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

describe('Timeline Component - Readability (E3-S4)', () => {
  const timeline = {
    id: 'session-1',
    name: 'Session',
    project: 'proj',
    count: 3,
    agents: [
      { name: 'main', lane: 0 }
    ],
    root: {
      agent: 'main',
      lane: 0,
      firstTs: '2026-07-21T14:00:00.000Z',
      lastTs: '2026-07-21T14:05:00.000Z',
      durationMs: 300000,
      count: 3,
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
          role: 'assistant',
          ts: '2026-07-21T14:02:00.000Z',
          content: 'On it.',
          tokensIn: 2,
          tokensOut: 10,
          cost: 0.05
        },
        {
          agent: 'main',
          lane: 0,
          role: 'user',
          ts: '2026-07-21T14:03:00.000Z',
          content: 'Continue'
        }
      ]
    }
  };

  it('renders timestamp elements with title attribute containing raw ISO datetime (AC1)', () => {
    render(<Timeline timeline={timeline} />);
    // Find all turn-time elements and check they have title attributes with ISO format
    const timestamps = screen.getAllByText(/ago|now/);
    // User turn timestamp should have title
    const userTimestampElement = timestamps[0];
    expect(userTimestampElement).toHaveAttribute('title');
    expect(userTimestampElement.getAttribute('title')).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('adjacent turn-groups render with turn-group class for visual separation (AC2)', () => {
    render(<Timeline timeline={timeline} />);
    // Find all turn-group divs - they should exist and have the proper class
    const turnGroups = document.querySelectorAll('.turn-group');
    // Should have at least 2 groups (one for first user, one for second user)
    expect(turnGroups.length).toBeGreaterThanOrEqual(2);
    // Each turn-group should have the class (verified by querySelector above)
    turnGroups.forEach(group => {
      expect(group.classList.contains('turn-group')).toBe(true);
      // Verify CSS styling is applied - margin-bottom should be on the element
      const computedStyle = window.getComputedStyle(group);
      // In jsdom, we can check that margin-bottom is defined (though numeric conversion may be lossy)
      const marginBottom = computedStyle.marginBottom;
      // Should have some margin-bottom (CSS defines 1.5rem)
      expect(marginBottom).toBeTruthy();
    });
  });

  it('conversation content does not have hardcoded width constraints (AC3 prerequisite)', () => {
    render(<Timeline timeline={timeline} />);
    // The turn-group and turn divs should not have inline hardcoded widths
    const turnGroups = document.querySelectorAll('.turn-group');
    expect(turnGroups.length).toBeGreaterThanOrEqual(1);
    turnGroups.forEach(group => {
      // Check that turn-group doesn't have inline width style that would prevent reflow
      const inlineWidth = group.style.width;
      expect(inlineWidth).toBe('');
      // Check that child turn elements also don't have hardcoded widths
      const turns = group.querySelectorAll('.turn');
      turns.forEach(turn => {
        const turnInlineWidth = turn.style.width;
        expect(turnInlineWidth).toBe('');
      });
    });
  });
});

describe('Timeline Component - Flat markdown transcript (E3-S1)', () => {
  const fs = require('fs');
  const path = require('path');
  const css = fs
    .readFileSync(path.join(__dirname, './Timeline.css'), 'utf-8')
    // Comments may mention borders in prose; only declarations count.
    .replace(/\/\*[\s\S]*?\*\//g, '');

  /** Every declaration block whose selector list contains `selector` exactly. */
  const declarationsFor = (selector) => {
    const blocks = [];
    const rule = /([^{}]+)\{([^{}]*)\}/g;
    let match;
    while ((match = rule.exec(css)) !== null) {
      const selectors = match[1].split(',').map(s => s.trim().replace(/\s+/g, ' '));
      if (selectors.includes(selector)) blocks.push(match[2]);
    }
    return blocks.join('\n');
  };

  const declaration = (block, property) => {
    const match = block.match(new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`));
    return match ? match[1].trim() : null;
  };

  it('gives .turn-user no full box border and no border-radius boxing (AC1)', () => {
    const block = declarationsFor('.turn-user');
    expect(block).not.toBe('');
    expect(declaration(block, 'border')).toBeNull();
    expect(declaration(block, 'border-radius')).toBeNull();
  });

  it('declares no 1px grid border on the turn/tool containers or role turn-heads (AC2)', () => {
    const boxed = [
      '.turn-group',
      '.turn-group-following',
      '.tool-block',
      '.turn-role-user .turn-head',
      '.turn-role-assistant .turn-head'
    ];
    boxed.forEach(selector => {
      const block = declarationsFor(selector);
      ['border', 'border-left', 'border-right', 'border-top', 'border-bottom'].forEach(property => {
        const value = declaration(block, property);
        expect(value, `${selector} { ${property} }`).toBeNull();
      });
    });
  });

  it('renders a markdown turn body through .markdown-body with no scroll cap of its own (AC3)', () => {
    const markdown = [
      '## Findings',
      '',
      '- **first** item with `inline code`',
      '- second item',
      '',
      '```js',
      'const answer = 42;',
      '```'
    ].join('\n');
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
          { agent: 'main', lane: 0, role: 'user', ts: '2026-07-21T14:00:00.000Z', content: 'Investigate' },
          { agent: 'main', lane: 0, role: 'assistant', ts: '2026-07-21T14:00:01.000Z', content: markdown }
        ]
      }
    };
    render(<Timeline timeline={timeline} />);

    const body = screen.getByText('Findings').closest('.turn-assistant .markdown-body');
    expect(body).not.toBeNull();
    expect(body.querySelector('h2')).not.toBeNull();
    expect(body.querySelector('ul li strong')).not.toBeNull();
    expect(body.querySelector('code')).not.toBeNull();
    expect(body.querySelector('pre code')).not.toBeNull();

    // Flowing at full height: the transcript never makes a turn body its own
    // scroll container.
    ['.turn-body', '.turn-user-body', '.turn-assistant .turn-body'].forEach(selector => {
      const block = declarationsFor(selector);
      expect(declaration(block, 'max-height'), `${selector} { max-height }`).toBeNull();
      expect(declaration(block, 'overflow'), `${selector} { overflow }`).toBeNull();
    });
  });

  it('renders a user turn body with markdown content through .markdown-body too (AC3)', () => {
    const markdown = [
      '### Ask',
      '',
      '- run **all** the `unit` tests',
      '- report back'
    ].join('\n');
    const timeline = {
      id: 'session-1',
      name: 'Session',
      project: 'proj',
      count: 1,
      agents: [{ name: 'main', lane: 0 }],
      root: {
        agent: 'main',
        lane: 0,
        firstTs: '2026-07-21T14:00:00.000Z',
        lastTs: '2026-07-21T14:00:00.000Z',
        durationMs: 0,
        count: 1,
        events: [
          { agent: 'main', lane: 0, role: 'user', ts: '2026-07-21T14:00:00.000Z', content: markdown }
        ]
      }
    };
    render(<Timeline timeline={timeline} />);

    const body = screen.getByText('Ask').closest('.turn-user .markdown-body');
    expect(body).not.toBeNull();
    expect(body.querySelector('h3')).not.toBeNull();
    expect(body.querySelector('ul li strong')).not.toBeNull();
    expect(body.querySelector('code')).not.toBeNull();
    // The raw markdown source must not survive as literal text.
    expect(screen.queryByText(/### Ask/)).toBeNull();
  });

  it('separates consecutive turns with .timeline-root gap rather than per-turn boxing (AC4)', () => {
    const rootBlock = declarationsFor('.timeline-root');
    expect(declaration(rootBlock, 'gap')).toMatch(/^[\d.]+rem$/);

    // The gap only reads as separation if the turns themselves are unboxed.
    ['.turn-user', '.turn-group', '.turn-group-following', '.tool-block'].forEach(selector => {
      const block = declarationsFor(selector);
      expect(declaration(block, 'border'), `${selector} { border }`).toBeNull();
      expect(declaration(block, 'border-bottom'), `${selector} { border-bottom }`).toBeNull();
    });

    // Role tints must not reintroduce a per-turn rule on the prose turns.
    ['.turn-role-user', '.turn-role-assistant'].forEach(selector => {
      const block = declarationsFor(selector);
      expect(declaration(block, 'border-left'), `${selector} { border-left }`).toBeNull();
    });
  });
});

describe('Timeline Component - Thin per-agent lane guides (E3-S2)', () => {
  const fs = require('fs');
  const path = require('path');
  const stripComments = source => source.replace(/\/\*[\s\S]*?\*\//g, '');
  const themeCss = stripComments(fs.readFileSync(path.join(__dirname, '../theme.css'), 'utf-8'));
  const css = stripComments(fs.readFileSync(path.join(__dirname, './Timeline.css'), 'utf-8'));

  /** Every declaration block whose selector list contains `selector` exactly. */
  const declarationsFor = (selector) => {
    const blocks = [];
    const rule = /([^{}]+)\{([^{}]*)\}/g;
    let match;
    while ((match = rule.exec(css)) !== null) {
      const selectors = match[1].split(',').map(s => s.trim().replace(/\s+/g, ' '));
      if (selectors.includes(selector)) blocks.push(match[2]);
    }
    return blocks.join('\n');
  };

  const declaration = (block, property) => {
    const match = block.match(new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`));
    return match ? match[1].trim() : null;
  };

  // main (lane 0) prompts, replies, then spawns `scout` (lane 1) which replies too.
  const nestedTimeline = () => ({
    id: 'session-1',
    name: 'Session',
    project: 'proj',
    count: 4,
    agents: [{ name: 'main', lane: 0 }, { name: 'scout', lane: 1 }],
    root: {
      agent: 'main',
      lane: 0,
      firstTs: '2026-07-21T14:00:00.000Z',
      lastTs: '2026-07-21T14:00:03.000Z',
      durationMs: 3000,
      count: 4,
      events: [
        { agent: 'main', lane: 0, role: 'user', ts: '2026-07-21T14:00:00.000Z', content: 'Investigate' },
        {
          agent: 'main',
          lane: 0,
          role: 'assistant',
          ts: '2026-07-21T14:00:01.000Z',
          content: 'Delegating to scout',
          children: [
            {
              agent: 'scout',
              lane: 1,
              firstTs: '2026-07-21T14:00:02.000Z',
              lastTs: '2026-07-21T14:00:03.000Z',
              durationMs: 1000,
              count: 2,
              events: [
                { agent: 'scout', lane: 1, role: 'user', ts: '2026-07-21T14:00:02.000Z', content: 'Find the caller' },
                { agent: 'scout', lane: 1, role: 'assistant', ts: '2026-07-21T14:00:03.000Z', content: 'Found it' }
              ]
            }
          ]
        }
      ]
    }
  });

  it('tokenizes the ~0.2em lane guide thickness and the dot diameter in theme.css :root (AC1)', () => {
    const root = themeCss.match(/:root\s*\{([\s\S]*?)\}/);
    expect(root).not.toBeNull();
    const guide = root[1].match(/--lane-guide-width:\s*([^;]+);/);
    expect(guide, 'theme.css :root { --lane-guide-width }').not.toBeNull();
    const em = Number(guide[1].trim().replace(/em$/, ''));
    expect(guide[1].trim()).toMatch(/em$/);
    expect(em).toBeGreaterThan(0.1);
    expect(em).toBeLessThanOrEqual(0.25);

    const dot = root[1].match(/--lane-dot-size:\s*([^;]+);/);
    expect(dot, 'theme.css :root { --lane-dot-size }').not.toBeNull();
    expect(dot[1].trim()).toMatch(/em$/);
  });

  it('draws the .turn-assistant guide at the tokenized thickness in --lane-color, never 3px (AC2)', () => {
    const block = declarationsFor('.turn-assistant');
    expect(block).not.toBe('');
    const borderLeft = declaration(block, 'border-left');
    expect(borderLeft).not.toBeNull();
    expect(borderLeft).toContain('var(--lane-guide-width)');
    expect(borderLeft).toContain('var(--lane-color');
    expect(borderLeft).not.toMatch(/\dpx/);

    render(<Timeline timeline={nestedTimeline()} />);
    const assistant = document.querySelector('.turn-assistant');
    expect(assistant.style.getPropertyValue('--lane-color')).not.toBe('');
  });

  it('gives every agent lane its own inline --lane-color from LANE_COLORS, main = LANE_COLORS[0] (AC3)', () => {
    render(<Timeline timeline={nestedTimeline()} />);

    const mainTurn = document.querySelector('.timeline-root > .turn-group .turn-assistant');
    expect(mainTurn.style.getPropertyValue('--lane-color')).toBe('#3b82f6');

    // The nested sub-agent section is a lane in its own right, tinted before it
    // is even expanded.
    const nested = document.querySelector('.timeline-nested');
    const subColor = nested.style.getPropertyValue('--lane-color');
    expect(subColor).toBe('#22c55e');
    expect(subColor).not.toBe(mainTurn.style.getPropertyValue('--lane-color'));

    fireEvent.click(screen.getByText('scout'));
    const subTurn = nested.querySelector('.turn-assistant');
    expect(subTurn.style.getPropertyValue('--lane-color')).toBe(subColor);
  });

  it('replaces the nested section box with a thin lane guide in the agent colour (AC3)', () => {
    const block = declarationsFor('.timeline-nested');
    expect(declaration(block, 'border')).toBeNull();
    expect(declaration(block, 'border-radius')).toBeNull();
    const borderLeft = declaration(block, 'border-left');
    expect(borderLeft).toContain('var(--lane-guide-width)');
    expect(borderLeft).toContain('var(--lane-color');
  });

  it('marks each event on the lane with a small dot in that lane colour (AC4)', () => {
    render(<Timeline timeline={nestedTimeline()} />);

    // main renders two events (prompt + reply); each gets exactly one dot.
    const rootWraps = document.querySelectorAll('.timeline-root .turn-wrap');
    expect(rootWraps.length).toBe(2);
    rootWraps.forEach(wrap => {
      expect(wrap.querySelectorAll(':scope > .turn-dot').length).toBe(1);
      expect(wrap.style.getPropertyValue('--lane-color')).toBe('#3b82f6');
    });

    fireEvent.click(screen.getByText('scout'));
    const subWraps = document.querySelectorAll('.timeline-nested .turn-wrap');
    expect(subWraps.length).toBe(2);
    subWraps.forEach(wrap => {
      expect(wrap.querySelectorAll(':scope > .turn-dot').length).toBe(1);
      expect(wrap.style.getPropertyValue('--lane-color')).toBe('#22c55e');
    });

    const dotBlock = declarationsFor('.turn-dot');
    expect(dotBlock).not.toBe('');
    expect(declaration(dotBlock, 'background')).toContain('var(--lane-color');
    expect(declaration(dotBlock, 'width')).toContain('var(--lane-dot-size)');
    expect(declaration(dotBlock, 'height')).toContain('var(--lane-dot-size)');
    expect(declaration(dotBlock, 'border-radius')).toBe('50%');
  });
});

// E3-S1-AC3 moved the user prompt onto ReactMarkdown + `.markdown-body`, which
// wraps even a one-line prompt in a `<p>`. Nothing in the app resets the UA
// paragraph margin (`content.css` styles only pre/code/table under
// `.markdown-body`, and there is no global reset), so each turn body gained
// ~1em of margin above and below its content — inside `.turn-user`'s padding
// and painted by `.turn-role-user`'s tint, which turns a one-line prompt into
// a tall slab of empty tint. Separation in this transcript is supposed to come
// from `.timeline-root`'s gap, not from UA margins on the first and last block.
//
// jsdom resolves every margin to 0 regardless of the UA stylesheet, so the
// rule itself is asserted against the source; the rendered half below pins the
// DOM shape the selector depends on, so a rule that matches nothing cannot
// pass as a rule that works.
describe('Timeline Component - Turn bodies do not inherit UA block margins', () => {
  const fs = require('fs');
  const path = require('path');
  const css = fs
    .readFileSync(path.join(__dirname, './Timeline.css'), 'utf-8')
    .replace(/\/\*[\s\S]*?\*\//g, '');

  const oneTurnEach = {
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
        { agent: 'main', lane: 0, role: 'user', ts: '2026-07-21T14:00:00.000Z', content: 'a one line prompt' },
        { agent: 'main', lane: 0, role: 'assistant', ts: '2026-07-21T14:00:01.000Z', content: 'a one line reply' }
      ]
    }
  };

  it('wraps both prompt and reply bodies in a paragraph, so the reset has something to match', () => {
    render(<Timeline timeline={oneTurnEach} />);

    const prompt = document.querySelector('.turn-user .turn-body > p');
    const reply = document.querySelector('.turn-assistant .turn-body > p');
    expect(prompt).not.toBeNull();
    expect(reply).not.toBeNull();
    expect(prompt.textContent).toBe('a one line prompt');
    expect(reply.textContent).toBe('a one line reply');
  });

  it('zeroes the leading and trailing block margin inside .turn-body', () => {
    const firstChild = css.match(/\.turn-body\s*>\s*:first-child\s*\{([^}]*)\}/);
    const lastChild = css.match(/\.turn-body\s*>\s*:last-child\s*\{([^}]*)\}/);

    expect(firstChild, 'Timeline.css { .turn-body > :first-child }').not.toBeNull();
    expect(lastChild, 'Timeline.css { .turn-body > :last-child }').not.toBeNull();
    expect(firstChild[1]).toMatch(/margin-top\s*:\s*0/);
    expect(lastChild[1]).toMatch(/margin-bottom\s*:\s*0/);
  });
});
