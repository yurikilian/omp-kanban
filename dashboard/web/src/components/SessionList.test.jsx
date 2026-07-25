import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import SessionList from './SessionList';
import fs from 'fs';
import path from 'path';

const mockLoadedSessions = [
  { id: 'loaded-1', name: 'Loaded One', timestamp: '2026-07-21T14:30:00Z', model: 'claude-opus-4-8' },
  { id: 'loaded-2', name: 'Loaded Two', timestamp: '2026-07-21T14:00:00Z', model: 'claude-haiku-4-5' }
];

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

// Single-line ellipsis truncation for sidebar titles (E1-S3).
//
// These assert through `getComputedStyle`, not the stylesheet source text:
// vitest runs with `css: true`, so the real cascade resolves against the
// rendered node. A source-text match cannot tell a rule that applies from one
// whose selector matches nothing, and truncation is exactly the kind of
// property that silently does nothing when the selector or the flex plumbing
// is wrong. jsdom performs no layout, so AC2 is asserted as the shrink
// contract that makes overflow impossible (a flex item that may shrink below
// its content width, clipping the excess) rather than as a pixel measurement.
describe('SessionList sidebar title truncation', () => {
  const longName =
    'A session title that is far longer than the fixed-width sidebar column can ever display';
  const longSession = [
    { id: 'long-1', name: longName, timestamp: '2026-07-21T14:30:00Z', model: 'claude-opus-4-8' }
  ];

  const renderLong = () =>
    render(
      <SessionList sessions={longSession} selectedSession={null} onSelectSession={vi.fn()} />
    );

  // E1-S3-AC1
  it('truncates .session-name on one line with an ellipsis instead of clamping to a box', () => {
    renderLong();
    const name = document.querySelector('.session-name');
    expect(name).toBeTruthy();
    expect(name.textContent).toBe(longName);

    const style = getComputedStyle(name);
    expect(style.whiteSpace).toBe('nowrap');
    expect(style.overflow).toBe('hidden');
    expect(style.textOverflow).toBe('ellipsis');
  });

  // E1-S3-AC1: the -webkit-box line clamp is what made the title wrap to two
  // lines; `display: -webkit-box` also defeats `text-overflow: ellipsis`, so
  // leaving it behind would keep the old rendering despite the rules above.
  it('no longer renders .session-name as a multi-line -webkit-box clamp', () => {
    renderLong();
    const style = getComputedStyle(document.querySelector('.session-name'));
    expect(style.display).not.toBe('-webkit-box');
    expect(style.getPropertyValue('-webkit-line-clamp')).toBe('');
    expect(style.getPropertyValue('-webkit-box-orient')).toBe('');
  });

  // E1-S3-AC2
  it('lets .session-name shrink inside the row so a long title cannot widen .session-item', () => {
    renderLong();
    const name = document.querySelector('.session-name');
    const row = document.querySelector('.session-item-row');

    // min-width:auto on a flex item floors it at its content width, which is
    // precisely how a long title pushes the row wider than the column.
    expect(getComputedStyle(name).minWidth).toBe('0px');
    expect(getComputedStyle(name).flexShrink).not.toBe('0');
    expect(getComputedStyle(row).minWidth).toBe('0px');
  });

  // E1-S3-AC2: the fixed-size siblings must keep their box instead of being
  // squeezed, otherwise the row still resolves wider than the column.
  it('keeps the status dot and action buttons from being squeezed by the title', () => {
    renderLong();
    expect(getComputedStyle(document.querySelector('.session-item-dot')).flexShrink).toBe('0');
    expect(getComputedStyle(document.querySelector('.session-item-actions')).flexShrink).toBe('0');
  });
});

// Skeleton placeholder rows while sessions load (E4-S1).
describe('SessionList loading skeleton', () => {
  const renderLoading = () =>
    render(
      <SessionList sessions={[]} selectedSession={null} onSelectSession={vi.fn()} loading />
    );

  // E4-S1-AC1
  it('renders skeleton placeholder rows and no "Loading sessions..." text while loading', () => {
    const { container } = renderLoading();

    expect(container.querySelector('.session-list-skeleton')).toBeTruthy();
    expect(container.querySelectorAll('.skeleton-row').length).toBeGreaterThan(0);
    expect(screen.queryByText('Loading sessions...')).not.toBeInTheDocument();
  });

  // E4-S1-AC2: the skeleton is the loading state only — real rows take over.
  it('renders real .session-item rows and no skeleton once sessions are supplied', () => {
    const { container } = render(
      <SessionList sessions={mockLoadedSessions} selectedSession={null} onSelectSession={vi.fn()} />
    );

    expect(container.querySelectorAll('.session-item').length).toBe(mockLoadedSessions.length);
    expect(container.querySelector('.session-list-skeleton')).toBeNull();
  });

  // E4-S1-AC1: the empty-state copy belongs to a resolved-but-empty list, not
  // to loading — showing it under the skeleton would say "no sessions" about a
  // list nobody has fetched yet.
  it('does not show the empty-filter message while loading', () => {
    renderLoading();
    expect(screen.queryByText('No sessions match this filter.')).not.toBeInTheDocument();
  });

  // E4-S1-AC3
  it('gives every skeleton placeholder the shared .skeleton class', () => {
    const { container } = renderLoading();
    const rows = container.querySelectorAll('.skeleton-row');
    for (const row of rows) {
      const placeholders = row.querySelectorAll('.skeleton');
      expect(placeholders.length).toBeGreaterThan(0);
    }
  });
});

// E4-S1-AC3: the shared primitive's stylesheet is the loading affordance —
// asserted against the source because jsdom performs no animation.
describe('Skeleton shared primitive stylesheet', () => {
  const skeletonCss = fs
    .readFileSync(path.join(__dirname, './Skeleton.css'), 'utf-8')
    .replace(/\/\*[\s\S]*?\*\//g, '');

  it('animates .skeleton with a keyframed pulse', () => {
    expect(skeletonCss).toMatch(/\.skeleton\s*\{[\s\S]*?animation:[^;]*skeleton-pulse/);
    expect(skeletonCss).toMatch(/@keyframes\s+skeleton-pulse\s*\{/);
  });

  it('disables the animation under prefers-reduced-motion: reduce', () => {
    const reduced = skeletonCss.match(
      /@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)\s*\{([\s\S]*?\n\})/
    );
    expect(reduced).toBeTruthy();
    expect(reduced[1]).toMatch(/\.skeleton[\s\S]*?animation\s*:\s*none/);
  });
});
