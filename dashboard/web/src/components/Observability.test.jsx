import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import Observability from './Observability';

describe('Observability Component', () => {
  const mockSessions = [
    {
      id: 'session-1',
      name: 'First Session',
      timestamp: '2026-07-21T14:30:00Z',
      stats: { cost: 1.5, inputTokens: 500, outputTokens: 1200, messageCount: 10, toolCallCount: 4, agentCount: 1 }
    },
    {
      id: 'session-2',
      name: 'Second Session',
      timestamp: '2026-07-21T15:00:00Z',
      stats: { cost: 3.25, inputTokens: 2500, outputTokens: 8800, messageCount: 40, toolCallCount: 16, agentCount: 3 }
    }
  ];

  it('renders the page heading and a global KPI summary aggregated across every session', () => {
    render(<Observability sessions={mockSessions} />);

    expect(screen.getByRole('heading', { name: 'Observability' })).toBeInTheDocument();
    // global aggregate: 1.5 + 3.25 = 4.75
    expect(screen.getByText('$4.75')).toBeInTheDocument();
  });

  it('renders one table row per session with that session\'s own (non-aggregated) stats', () => {
    render(<Observability sessions={mockSessions} />);

    const table = screen.getByRole('table');
    const firstRow = within(table).getByText('First Session').closest('tr');
    const secondRow = within(table).getByText('Second Session').closest('tr');

    expect(within(firstRow).getByText('$1.50')).toBeInTheDocument();
    expect(within(firstRow).getByText('500')).toBeInTheDocument();
    expect(within(firstRow).getByText('1.2K')).toBeInTheDocument();
    expect(within(firstRow).getByText('10')).toBeInTheDocument();
    expect(within(firstRow).getByText('4')).toBeInTheDocument();
    expect(within(firstRow).getByText('1')).toBeInTheDocument();

    expect(within(secondRow).getByText('$3.25')).toBeInTheDocument();
    expect(within(secondRow).getByText('2.5K')).toBeInTheDocument();
    expect(within(secondRow).getByText('8.8K')).toBeInTheDocument();
    expect(within(secondRow).getByText('40')).toBeInTheDocument();
    expect(within(secondRow).getByText('16')).toBeInTheDocument();
    expect(within(secondRow).getByText('3')).toBeInTheDocument();
  });

  it('orders per-session rows newest first', () => {
    render(<Observability sessions={mockSessions} />);

    const rows = screen.getAllByRole('row').slice(1); // drop header row
    expect(within(rows[0]).getByText('Second Session')).toBeInTheDocument();
    expect(within(rows[1]).getByText('First Session')).toBeInTheDocument();
  });

  it('shows an empty state instead of a table when there are no sessions', () => {
    render(<Observability sessions={[]} />);

    expect(screen.getByText('No sessions yet.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
