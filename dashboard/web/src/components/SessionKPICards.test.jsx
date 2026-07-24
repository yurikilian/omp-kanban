import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import SessionKPICards from './SessionKPICards';

describe('SessionKPICards Component', () => {
  const mockSessions = [
    {
      id: 'session-1',
      stats: { cost: 1.5, inputTokens: 500, outputTokens: 1200, messageCount: 10, toolCallCount: 4, agentCount: 1 }
    },
    {
      id: 'session-2',
      stats: { cost: 3.25, inputTokens: 2500, outputTokens: 8800, messageCount: 40, toolCallCount: 16, agentCount: 3 }
    }
  ];

  it('renders one card per KPI, including all required metrics', () => {
    render(<SessionKPICards sessions={mockSessions} />);

    expect(screen.getByText('Total Cost')).toBeInTheDocument();
    expect(screen.getByText('Input Tokens')).toBeInTheDocument();
    expect(screen.getByText('Output Tokens')).toBeInTheDocument();
    expect(screen.getByText('Messages')).toBeInTheDocument();
    expect(screen.getByText('Tool Calls')).toBeInTheDocument();
    expect(screen.getByText('Agents')).toBeInTheDocument();
  });

  it('sums stats across every session for each KPI', () => {
    render(<SessionKPICards sessions={mockSessions} />);

    // cost: 1.5 + 3.25 = 4.75
    expect(screen.getByText('$4.75')).toBeInTheDocument();
    // inputTokens: 500 + 2500 = 3000 -> "3.0K"
    expect(screen.getByText('3.0K')).toBeInTheDocument();
    // outputTokens: 1200 + 8800 = 10000 -> "10K"
    expect(screen.getByText('10K')).toBeInTheDocument();
    // messageCount: 10 + 40 = 50
    expect(screen.getByText('50')).toBeInTheDocument();
    // toolCallCount: 4 + 16 = 20
    expect(screen.getByText('20')).toBeInTheDocument();
    // agentCount: 1 + 3 = 4
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it('shows a computed average cost per session', () => {
    render(<SessionKPICards sessions={mockSessions} />);

    expect(screen.getByText('Avg Cost / Session')).toBeInTheDocument();
    // avg cost: 4.75 / 2 = 2.375 -> "$2.38"
    expect(screen.getByText('$2.38')).toBeInTheDocument();
  });

  it('omits the Avg Cost / Session card when showAverage is false', () => {
    render(<SessionKPICards sessions={mockSessions} showAverage={false} />);

    expect(screen.queryByText('Avg Cost / Session')).not.toBeInTheDocument();
    expect(screen.getByText('Total Cost')).toBeInTheDocument();
  });
  it('renders zeroed cards for an empty session list without crashing', () => {
    render(<SessionKPICards sessions={[]} />);

    expect(screen.getAllByText('$0.00').length).toBeGreaterThan(0);
    expect(screen.getAllByText('0').length).toBeGreaterThan(0);
  });

  it('tolerates sessions missing a stats object', () => {
    const sessions = [{ id: 'no-stats' }, ...mockSessions];
    expect(() => render(<SessionKPICards sessions={sessions} />)).not.toThrow();
    // totals unaffected by the statless session
    expect(screen.getByText('$4.75')).toBeInTheDocument();
  });
});
