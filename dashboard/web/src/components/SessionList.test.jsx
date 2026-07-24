import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import SessionList from './SessionList';

describe('SessionList Component', () => {
  const mockSessions = [
    {
      id: 'session-1',
      name: 'First Session',
      timestamp: '2026-07-21T14:30:00Z',
      model: 'claude-opus-4-8'
    },
    {
      id: 'session-2',
      name: 'Second Session',
      timestamp: '2026-07-21T14:00:00Z',
      model: 'claude-haiku-4-5'
    },
    {
      id: 'session-3',
      name: 'Third Session',
      timestamp: '2026-07-21T13:00:00Z',
      model: 'claude-opus-4-8'
    }
  ];
  
  it('should render sessions list', () => {
    const mockCallback = vi.fn();
    render(
      <SessionList 
        sessions={mockSessions}
        selectedSession={mockSessions[0]}
        onSelectSession={mockCallback}
      />
    );
    
    expect(screen.getByText('Sessions')).toBeInTheDocument();
  });
  
  it('should display all session names', () => {
    const mockCallback = vi.fn();
    render(
      <SessionList 
        sessions={mockSessions}
        selectedSession={mockSessions[0]}
        onSelectSession={mockCallback}
      />
    );
    
    expect(screen.getByText('First Session')).toBeInTheDocument();
    expect(screen.getByText('Second Session')).toBeInTheDocument();
    expect(screen.getByText('Third Session')).toBeInTheDocument();
  });
  
  it('should display session model names', () => {
    const mockCallback = vi.fn();
    render(
      <SessionList 
        sessions={mockSessions}
        selectedSession={mockSessions[0]}
        onSelectSession={mockCallback}
      />
    );
    
    const modelElements = screen.getAllByText(/claude/);
    expect(modelElements.length).toBeGreaterThan(0);
  });
  
  it('should highlight selected session', () => {
    const mockCallback = vi.fn();
    const { container } = render(
      <SessionList 
        sessions={mockSessions}
        selectedSession={mockSessions[0]}
        onSelectSession={mockCallback}
      />
    );
    
    const activeItem = container.querySelector('.session-item.active');
    expect(activeItem).toBeInTheDocument();
    expect(activeItem.textContent).toContain('First Session');
  });
  
  it('should call onSelectSession when clicking a session', () => {
    const mockCallback = vi.fn();
    render(
      <SessionList 
        sessions={mockSessions}
        selectedSession={mockSessions[0]}
        onSelectSession={mockCallback}
      />
    );
    
    const secondSession = screen.getByText('Second Session').closest('.session-item');
    fireEvent.click(secondSession);
    
    expect(mockCallback).toHaveBeenCalled();
  });
  
  it('should handle empty sessions list', () => {
    const mockCallback = vi.fn();
    render(
      <SessionList 
        sessions={[]}
        selectedSession={null}
        onSelectSession={mockCallback}
      />
    );
    
    expect(screen.getByText('Sessions')).toBeInTheDocument();
  });
  
  it('should display dates in user-friendly format', () => {
    const mockCallback = vi.fn();
    render(
      <SessionList 
        sessions={mockSessions}
        selectedSession={mockSessions[0]}
        onSelectSession={mockCallback}
      />
    );
    
    // Check for date format display (DD/MM/YYYY)
    const dateElements = screen.getAllByText(/\d{1,2}\/\d{1,2}\/\d{4}/);
    expect(dateElements.length).toBeGreaterThan(0);
  });
  
  it('should render each session as a list item', () => {
    const mockCallback = vi.fn();
    const { container } = render(
      <SessionList 
        sessions={mockSessions}
        selectedSession={mockSessions[0]}
        onSelectSession={mockCallback}
      />
    );
    
    const listItems = container.querySelectorAll('.session-item');
    expect(listItems.length).toBe(mockSessions.length);
  });
  
  it('should not crash with missing session properties', () => {
    const mockCallback = vi.fn();
    const incompleteSessions = [
      {
        id: 'session-1',
        name: 'Session with missing fields'
        // Missing timestamp and model
      }
    ];
    
    render(
      <SessionList 
        sessions={incompleteSessions}
        selectedSession={incompleteSessions[0]}
        onSelectSession={mockCallback}
      />
    );
    
    expect(screen.getByText('Session with missing fields')).toBeInTheDocument();
  });

  it('shows a session count next to the header', () => {
    render(
      <SessionList
        sessions={mockSessions}
        selectedSession={null}
        onSelectSession={vi.fn()}
      />
    );
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('falls back to "Untitled session" when a session has no name', () => {
    const unnamed = [{ id: 'session-1', timestamp: '2026-07-21T14:00:00Z', model: 'claude-opus-4-8' }];
    render(
      <SessionList
        sessions={unnamed}
        selectedSession={null}
        onSelectSession={vi.fn()}
      />
    );
    expect(screen.getByText('Untitled session')).toBeInTheDocument();
  });

  it('is operable via keyboard: Enter selects the focused session', () => {
    const mockCallback = vi.fn();
    render(
      <SessionList
        sessions={mockSessions}
        selectedSession={null}
        onSelectSession={mockCallback}
      />
    );
    const item = screen.getByText('Second Session').closest('.session-item');
    expect(item).toHaveAttribute('tabIndex', '0');
    fireEvent.keyDown(item, { key: 'Enter' });
    expect(mockCallback).toHaveBeenCalledWith(mockSessions[1]);
  });

  it('is operable via keyboard: Space selects the focused session', () => {
    const mockCallback = vi.fn();
    render(
      <SessionList
        sessions={mockSessions}
        selectedSession={null}
        onSelectSession={mockCallback}
      />
    );
    const item = screen.getByText('Third Session').closest('.session-item');
    fireEvent.keyDown(item, { key: ' ' });
    expect(mockCallback).toHaveBeenCalledWith(mockSessions[2]);
  });

  it('renders a delete button per session that calls onDeleteSession after confirmation, without selecting it', () => {
    const onDeleteSession = vi.fn();
    const onSelectSession = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(
      <SessionList
        sessions={mockSessions}
        selectedSession={null}
        onSelectSession={onSelectSession}
        onDeleteSession={onDeleteSession}
      />
    );

    fireEvent.click(screen.getByLabelText('Delete Second Session'));

    expect(window.confirm).toHaveBeenCalled();
    expect(onDeleteSession).toHaveBeenCalledWith(mockSessions[1]);
    expect(onSelectSession).not.toHaveBeenCalled();
    window.confirm.mockRestore();
  });

  it('does not call onDeleteSession when the confirmation is dismissed', () => {
    const onDeleteSession = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(
      <SessionList
        sessions={mockSessions}
        selectedSession={null}
        onSelectSession={vi.fn()}
        onDeleteSession={onDeleteSession}
      />
    );

    fireEvent.click(screen.getByLabelText('Delete Second Session'));

    expect(onDeleteSession).not.toHaveBeenCalled();
    window.confirm.mockRestore();
  });

  it('calls onSortChange when clicking sort toggle buttons', () => {
    const onSortChange = vi.fn();
    const { container } = render(
      <SessionList
        sessions={mockSessions}
        selectedSession={null}
        onSelectSession={vi.fn()}
        onDeleteSession={vi.fn()}
        sortBy="created"
        onSortChange={onSortChange}
      />
    );

    const buttons = container.querySelectorAll('.session-sort-button');
    expect(buttons.length).toBe(2);

    fireEvent.click(buttons[0]); // Newest
    expect(onSortChange).toHaveBeenCalledWith('created');

    fireEvent.click(buttons[1]); // Recently modified
    expect(onSortChange).toHaveBeenCalledWith('modified');
  });

  it('highlights the active sort toggle button based on sortBy prop', () => {
    const { container, rerender } = render(
      <SessionList
        sessions={mockSessions}
        selectedSession={null}
        onSelectSession={vi.fn()}
        onDeleteSession={vi.fn()}
        sortBy="created"
        onSortChange={vi.fn()}
      />
    );

    let buttons = container.querySelectorAll('.session-sort-button');
    expect(buttons[0]).toHaveClass('active');
    expect(buttons[1]).not.toHaveClass('active');

    rerender(
      <SessionList
        sessions={mockSessions}
        selectedSession={null}
        onSelectSession={vi.fn()}
        onDeleteSession={vi.fn()}
        sortBy="modified"
        onSortChange={vi.fn()}
      />
    );

    buttons = container.querySelectorAll('.session-sort-button');
    expect(buttons[0]).not.toHaveClass('active');
    expect(buttons[1]).toHaveClass('active');
  });

  it('renders a StatusDot per session, always showing "Ended" (no live-agent tracking)', () => {
    const mixedSessions = [
      { id: 's-a', name: 'A', timestamp: '2026-07-21T14:30:00Z', model: 'x' },
      { id: 's-b', name: 'B', timestamp: '2026-07-21T14:30:00Z', model: 'x' }
    ];
    render(
      <SessionList
        sessions={mixedSessions}
        selectedSession={null}
        onSelectSession={vi.fn()}
      />
    );

    const dots = screen.getAllByRole('status');
    expect(dots).toHaveLength(2);
    expect(dots[0]).toHaveAttribute('aria-label', 'Ended');
    expect(dots[1]).toHaveAttribute('aria-label', 'Ended');
  });

  it('filter tabs: "Dashboard"/"Terminal"/"Pinned" narrow the visible sessions by origin/pinned', () => {
    const mixed = [
      { id: 's1', name: 'Dash Session', timestamp: '2026-07-21T14:30:00Z', model: 'x', origin: 'dashboard', pinned: false },
      { id: 's2', name: 'Terminal Session', timestamp: '2026-07-21T14:00:00Z', model: 'x', origin: 'terminal', pinned: false },
      { id: 's3', name: 'Pinned Session', timestamp: '2026-07-21T13:00:00Z', model: 'x', origin: 'terminal', pinned: true }
    ];
    render(
      <SessionList
        sessions={mixed}
        selectedSession={null}
        onSelectSession={vi.fn()}
      />
    );

    // Default: "All" shows every session.
    expect(screen.getByText('Dash Session')).toBeInTheDocument();
    expect(screen.getByText('Terminal Session')).toBeInTheDocument();
    expect(screen.getByText('Pinned Session')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Dashboard' }));
    expect(screen.getByText('Dash Session')).toBeInTheDocument();
    expect(screen.queryByText('Terminal Session')).not.toBeInTheDocument();
    expect(screen.queryByText('Pinned Session')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Terminal' }));
    expect(screen.queryByText('Dash Session')).not.toBeInTheDocument();
    expect(screen.getByText('Terminal Session')).toBeInTheDocument();
    expect(screen.getByText('Pinned Session')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Pinned' }));
    expect(screen.queryByText('Dash Session')).not.toBeInTheDocument();
    expect(screen.queryByText('Terminal Session')).not.toBeInTheDocument();
    expect(screen.getByText('Pinned Session')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'All' }));
    expect(screen.getByText('Dash Session')).toBeInTheDocument();
    expect(screen.getByText('Terminal Session')).toBeInTheDocument();
  });

  it('renders a pin toggle button per session that calls onTogglePin without selecting it', () => {
    const onTogglePin = vi.fn();
    const onSelectSession = vi.fn();
    render(
      <SessionList
        sessions={mockSessions}
        selectedSession={null}
        onSelectSession={onSelectSession}
        onTogglePin={onTogglePin}
      />
    );

    fireEvent.click(screen.getByLabelText('Pin Second Session'));
    expect(onTogglePin).toHaveBeenCalledWith(mockSessions[1]);
    expect(onSelectSession).not.toHaveBeenCalled();
  });

  it('shows an "Unpin" label and active styling for an already-pinned session', () => {
    const pinned = [{ id: 's1', name: 'Pinned One', timestamp: '2026-07-21T14:30:00Z', model: 'x', pinned: true }];
    render(
      <SessionList
        sessions={pinned}
        selectedSession={null}
        onSelectSession={vi.fn()}
      />
    );

    const pinButton = screen.getByLabelText('Unpin Pinned One');
    expect(pinButton).toHaveClass('session-pin-active');
  });
});
