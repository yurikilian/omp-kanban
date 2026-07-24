import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import StatusDot, { deriveStatus } from './StatusDot';

describe('StatusDot', () => {
  it('deriveStatus: !live is always "ended", regardless of busy/mode', () => {
    expect(deriveStatus({ live: false, busy: true })).toBe('ended');
    expect(deriveStatus({ live: false, busy: false })).toBe('ended');
    expect(deriveStatus(undefined || {})).toBe('ended');
  });

  it('deriveStatus: live && !busy is "idle"', () => {
    expect(deriveStatus({ live: true, busy: false })).toBe('idle');
  });

  it('deriveStatus: live && busy is "working"', () => {
    expect(deriveStatus({ live: true, busy: true })).toBe('working');
  });

  it('renders a gray "ended" dot with an accessible label when not live', () => {
    render(<StatusDot live={false} busy={false} />);
    const dot = screen.getByRole('status');
    expect(dot).toHaveClass('status-dot-ended');
    expect(dot).toHaveAttribute('aria-label', 'Ended');
  });

  it('renders a green "idle" dot when live and not busy', () => {
    render(<StatusDot live={true} busy={false} />);
    const dot = screen.getByRole('status');
    expect(dot).toHaveClass('status-dot-idle');
    expect(dot).toHaveAttribute('aria-label', 'Idle');
  });

  it('renders a cyan "working" dot when live and busy', () => {
    render(<StatusDot live={true} busy={true} />);
    const dot = screen.getByRole('status');
    expect(dot).toHaveClass('status-dot-working');
    expect(dot).toHaveAttribute('aria-label', 'Working');
  });

  it('overlays a plan badge only when live and mode is "plan"', () => {
    const { rerender } = render(<StatusDot live={true} busy={false} mode="plan" />);
    let dot = screen.getByRole('status');
    expect(dot).toHaveClass('status-dot-plan');
    expect(dot).toHaveAttribute('aria-label', 'Idle (Plan mode)');

    rerender(<StatusDot live={false} busy={false} mode="plan" />);
    dot = screen.getByRole('status');
    expect(dot).not.toHaveClass('status-dot-plan');
    expect(dot).toHaveAttribute('aria-label', 'Ended');
  });

  it('accepts an extra className', () => {
    render(<StatusDot live={true} busy={false} className="session-item-dot" />);
    expect(screen.getByRole('status')).toHaveClass('session-item-dot');
  });
});
