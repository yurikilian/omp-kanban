import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ActivityRail from './ActivityRail';

describe('ActivityRail Component', () => {
  it('renders a button for every section', () => {
    render(<ActivityRail active="sessions" onSelect={vi.fn()} />);
    expect(screen.getByTitle('Sessions')).toBeInTheDocument();
    expect(screen.getByTitle('Observability')).toBeInTheDocument();
    expect(screen.getByTitle('Configurations')).toBeInTheDocument();
  });

  it('marks the active section with aria-current', () => {
    render(<ActivityRail active="observability" onSelect={vi.fn()} />);
    expect(screen.getByTitle('Observability')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTitle('Sessions')).not.toHaveAttribute('aria-current');
  });

  it('calls onSelect with the section id when clicked', () => {
    const onSelect = vi.fn();
    render(<ActivityRail active="sessions" onSelect={onSelect} />);
    fireEvent.click(screen.getByTitle('Observability'));
    expect(onSelect).toHaveBeenCalledWith('observability');
  });

  it('shows no "Soon" badges now that every section is built', () => {
    render(<ActivityRail active="sessions" onSelect={vi.fn()} />);
    expect(screen.queryAllByText('Soon')).toHaveLength(0);
  });
});
