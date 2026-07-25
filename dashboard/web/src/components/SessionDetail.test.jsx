import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';

import SessionDetail from './SessionDetail';
import Skeleton from './Skeleton';

global.fetch = vi.fn();

const EMPTY_TIMELINE = {
  id: 'x',
  name: 'x',
  project: '',
  count: 0,
  agents: [],
  root: { agent: 'main', lane: 0, events: [], count: 0 }
};

describe('SessionDetail (read-only)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows fallback when no session selected', () => {
    render(<SessionDetail session={null} />);
    expect(screen.getByText('Select a session to view')).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('fetches and renders timeline for existing session', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => EMPTY_TIMELINE
    });

    const session = {
      id: 'sess-1',
      name: 'My Session',
      project: 'test-proj'
    };

    render(<SessionDetail session={session} />);

    expect(screen.getByText('My Session')).toBeInTheDocument();

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/sessions/sess-1/timeline')
      );
    });
  });

  it('shows error message if timeline fetch fails', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 404
    });

    const session = {
      id: 'sess-missing',
      name: 'Missing Session'
    };

    render(<SessionDetail session={session} />);

    await waitFor(() => {
      expect(screen.getByText(/Error loading timeline/)).toBeInTheDocument();
    });
  });

  it('shows read-only notice in footer', () => {
    const session = {
      id: 'sess-1',
      name: 'Test Session'
    };

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => EMPTY_TIMELINE
    });

    render(<SessionDetail session={session} />);

    expect(screen.getByText(/dashboard is read-only/)).toBeInTheDocument();
  });

  it('refetches the timeline when reloadToken changes (e.g. filesystem-watch update)', async () => {
    global.fetch
      .mockResolvedValueOnce({ ok: true, json: async () => EMPTY_TIMELINE })
      .mockResolvedValueOnce({ ok: true, json: async () => EMPTY_TIMELINE });

    const session = { id: 'sess-1', name: 'Test Session' };

    const { rerender } = render(<SessionDetail session={session} reloadToken={0} />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    rerender(<SessionDetail session={session} reloadToken={1} />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });

  it('refetches the timeline when switching to a different session', async () => {
    global.fetch
      .mockResolvedValueOnce({ ok: true, json: async () => EMPTY_TIMELINE })
      .mockResolvedValueOnce({ ok: true, json: async () => EMPTY_TIMELINE });

    const { rerender } = render(<SessionDetail session={{ id: 'sess-1', name: 'First' }} />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/sessions/sess-1/timeline')
      );
    });

    rerender(<SessionDetail session={{ id: 'sess-2', name: 'Second' }} />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/sessions/sess-2/timeline')
      );
    });
  });

  // E4-S2-AC1
  it('renders KPI and timeline placeholders instead of "Loading timeline..." while the timeline is in flight', () => {
    global.fetch.mockReturnValueOnce(new Promise(() => {}));

    const { container } = render(<SessionDetail session={{ id: 'sess-1', name: 'Pending' }} />);

    const messages = container.querySelector('.session-detail-messages');
    expect(messages.querySelectorAll('.session-detail-skeleton-kpi-card').length).toBeGreaterThan(0);
    expect(messages.querySelectorAll('.session-detail-skeleton-turn').length).toBeGreaterThan(0);
    expect(screen.queryByText('Loading timeline...')).not.toBeInTheDocument();
  });

  // E4-S2-AC2
  it('replaces the placeholders with the KPI cards and timeline once the fetch resolves', async () => {
    let resolveFetch;
    global.fetch.mockReturnValueOnce(new Promise((resolve) => { resolveFetch = resolve; }));

    const { container } = render(<SessionDetail session={{ id: 'sess-1', name: 'Resolving' }} />);
    expect(container.querySelector('.session-detail-skeleton')).toBeInTheDocument();

    resolveFetch({ ok: true, json: async () => EMPTY_TIMELINE });

    await waitFor(() => {
      expect(container.querySelector('.timeline')).toBeInTheDocument();
    });

    expect(screen.getByRole('group', { name: 'Session statistics' })).toBeInTheDocument();
    expect(container.querySelector('.session-detail-skeleton')).not.toBeInTheDocument();
  });

  // E4-S2-AC3
  it('builds the detail placeholders from the shared skeleton primitive', () => {
    const shared = render(<Skeleton />).container.firstChild.className;

    global.fetch.mockReturnValueOnce(new Promise(() => {}));
    const { container } = render(<SessionDetail session={{ id: 'sess-1', name: 'Pending' }} />);

    const placeholders = container.querySelectorAll('.session-detail-skeleton .skeleton');
    expect(placeholders.length).toBeGreaterThan(0);
    placeholders.forEach((el) => {
      expect(el.classList.contains(shared)).toBe(true);
    });
  });
});
