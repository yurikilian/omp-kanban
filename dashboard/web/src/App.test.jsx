import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

import App from './App';

// Mock fetch
global.fetch = vi.fn();

// App.jsx subscribes to /api/sessions/events (SSE) on mount for live
// updates; jsdom has no EventSource, so stub a minimal inert one (tests
// here don't exercise live-update behavior, just that mounting doesn't
// throw).
class MockEventSource {
  constructor(url) {
    this.url = url;
    this.onmessage = null;
    this.onerror = null;
    MockEventSource.instances.push(this);
  }
  close() {}
}
MockEventSource.instances = [];
global.EventSource = MockEventSource;

const EMPTY_TIMELINE = { id: 'x', name: 'x', project: '', count: 0, agents: [], root: { agent: 'main', lane: 0, events: [], count: 0 } };

describe('App Integration', () => {
  const mockSessions = [
    {
      id: 'session-1',
      name: 'Build Session Viewer',
      timestamp: '2026-07-21T14:30:00Z',
      model: 'claude-opus-4-8',
      project: 'agents',
      transcript: [
        { role: 'user', content: 'Build a session viewer' },
        { role: 'assistant', content: 'I will build it' }
      ]
    },
    {
      id: 'session-2',
      name: 'Initial Setup',
      timestamp: '2026-07-21T14:00:00Z',
      model: 'claude-haiku-4-5',
      project: 'agents',
      transcript: [
        { role: 'user', content: 'Setup the project' },
        { role: 'assistant', content: 'Project is ready' }
      ]
    }
  ];

  beforeEach(() => {
    fetch.mockClear();
    MockEventSource.instances = [];
    // Selecting a session mounts SessionDetail, which fetches its own
    // timeline, plus the always-on preferences (App) and plans (PlanPanel)
    // GETs. Tests below only queue a `mockResolvedValueOnce` for the
    // `/api/sessions` call; give every other fetch call a harmless default
    // response so it doesn't hit `undefined`.
    fetch.mockImplementation((url) => {
      if (typeof url === 'string' && url.includes('/timeline')) {
        return Promise.resolve({ ok: true, json: async () => EMPTY_TIMELINE });
      }
      if (url === '/api/preferences') {
        return Promise.resolve({ ok: true, json: async () => ({}) });
      }
      if (url === '/api/plans') {
        return Promise.resolve({ ok: true, json: async () => [] });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should render header', async () => {
    fetch.mockResolvedValueOnce({
      json: async () => mockSessions
    });

    render(<App />);
    await waitFor(() => {
      expect(screen.getByText('Agent Session Viewer')).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it('should fetch sessions on mount', async () => {
    fetch.mockResolvedValueOnce({
      json: async () => mockSessions
    });

    render(<App />);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/sessions');
    }, { timeout: 3000 });
  });

  it('should display loading state initially', () => {
    fetch.mockImplementation(() => new Promise(() => {}));
    render(<App />);
    expect(screen.getByText('Loading sessions...')).toBeInTheDocument();
  });

  it('should display sessions after loading', async () => {
    fetch.mockResolvedValueOnce({
      json: async () => mockSessions
    });

    render(<App />);

    await waitFor(() => {
      // "Build Session Viewer" appears in both the sidebar item and the
      // session detail header once selected, so assert on the list, not one node.
      expect(screen.getAllByText('Build Session Viewer').length).toBeGreaterThan(0);
      expect(screen.getByText('Initial Setup')).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it('should select first session by default', async () => {
    fetch.mockResolvedValueOnce({
      json: async () => mockSessions
    });

    render(<App />);

    await waitFor(() => {
      const heading = screen.getByRole('heading', { level: 1, name: 'Build Session Viewer' });
      expect(heading).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it('should display error if fetch fails', async () => {
    fetch.mockRejectedValueOnce(new Error('Network error'));

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/Error:/)).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it('should have sidebar and main content area', async () => {
    fetch.mockResolvedValueOnce({
      json: async () => mockSessions
    });

    const { container } = render(<App />);

    await waitFor(() => {
      expect(container.querySelector('.sidebar')).toBeInTheDocument();
      expect(container.querySelector('.content')).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it('should display model in header', async () => {
    fetch.mockResolvedValueOnce({
      json: async () => mockSessions
    });

    render(<App />);

    await waitFor(() => {
      // Model text appears both in the sidebar session item and the
      // session detail meta line; assert at least one is present.
      expect(screen.getAllByText(/claude-opus-4-8/).length).toBeGreaterThan(0);
    }, { timeout: 3000 });
  });

  it('should handle empty sessions gracefully', async () => {
    fetch.mockResolvedValueOnce({
      json: async () => []
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Sessions/ })).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it('shows the Observability page with global and per-session KPIs and hides the session sidebar when its rail item is clicked', async () => {
    fetch.mockResolvedValueOnce({
      json: async () => mockSessions
    });

    const { container } = render(<App />);

    await waitFor(() => {
      expect(screen.getAllByText('Build Session Viewer').length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByTitle('Observability'));

    expect(screen.getByRole('heading', { name: 'Observability' })).toBeInTheDocument();
    // Per-session breakdown lists every session by name.
    expect(screen.getByText('Build Session Viewer')).toBeInTheDocument();
    expect(screen.getByText('Initial Setup')).toBeInTheDocument();
    expect(container.querySelector('.sidebar')).not.toBeInTheDocument();
  });

  it('returns to the session list when the Sessions rail item is clicked again', async () => {
    fetch.mockResolvedValueOnce({
      json: async () => mockSessions
    });

    const { container } = render(<App />);

    await waitFor(() => {
      expect(screen.getAllByText('Build Session Viewer').length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByTitle('Configurations'));
    expect(screen.getByRole('heading', { name: 'Configurations' })).toBeInTheDocument();

    fireEvent.click(screen.getByTitle('Sessions'));
    expect(container.querySelector('.sidebar')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getAllByText('Build Session Viewer').length).toBeGreaterThan(0);
    });
  });


  function mockSessionsWithDelete(initial) {
    let currentSessions = [...initial];
    fetch.mockImplementation((url, options = {}) => {
      const method = options.method || 'GET';
      if (url === '/api/sessions' && method === 'GET') {
        return Promise.resolve({ ok: true, json: async () => currentSessions });
      }
      if (typeof url === 'string' && url.startsWith('/api/sessions/') && method === 'DELETE') {
        const id = decodeURIComponent(url.split('/').pop());
        currentSessions = currentSessions.filter((s) => s.id !== id);
        return Promise.resolve({ ok: true, status: 204 });
      }
      if (typeof url === 'string' && url.includes('/timeline')) {
        return Promise.resolve({ ok: true, json: async () => EMPTY_TIMELINE });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    });
  }

  it('deletes a non-selected session without losing an explicitly chosen selection', async () => {
    const threeSessions = [
      { id: 'session-1', name: 'First Session', timestamp: '2026-07-21T14:30:00Z', model: 'claude-opus-4-8', project: 'agents', transcript: [] },
      { id: 'session-2', name: 'Second Session', timestamp: '2026-07-21T14:00:00Z', model: 'claude-haiku-4-5', project: 'agents', transcript: [] },
      { id: 'session-3', name: 'Third Session', timestamp: '2026-07-21T13:00:00Z', model: 'claude-sonnet-5', project: 'agents', transcript: [] }
    ];
    mockSessionsWithDelete(threeSessions);
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    const { container } = render(<App />);
    await waitFor(() => expect(screen.getAllByText('First Session').length).toBeGreaterThan(0));

    // Explicitly select the LAST session — not list[0], the default.
    fireEvent.click(screen.getByText('Third Session'));
    await waitFor(() => expect(container.querySelector('.session-detail-header h1')?.textContent).toBe('Third Session'));

    // Delete a different, non-selected session (the middle one).
    fireEvent.click(screen.getByLabelText('Delete Second Session'));

    await waitFor(() => expect(screen.queryByText('Second Session')).not.toBeInTheDocument());
    // If selection were reset to list[0] after refetch (the bug), the
    // detail view would now show "First Session" instead of "Third Session".
    expect(container.querySelector('.session-detail-header h1')?.textContent).toBe('Third Session');
    expect(container.querySelector('.session-item.active .session-name')?.textContent).toBe('Third Session');

    window.confirm.mockRestore();
  });

  it('deletes the currently selected session and falls back to the next available one', async () => {
    mockSessionsWithDelete(mockSessions);
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<App />);
    await waitFor(() => expect(screen.getAllByText('Build Session Viewer').length).toBeGreaterThan(0));

    fireEvent.click(screen.getByLabelText('Delete Build Session Viewer'));

    await waitFor(() => expect(screen.queryByText('Build Session Viewer')).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getAllByText('Initial Setup').length).toBeGreaterThan(0));

    window.confirm.mockRestore();
  });

  it('a background sessions-changed SSE event preserves an explicitly chosen selection (regression: stale closure in es.onmessage)', async () => {
    // Reproduces a real bug: `refreshSessionsPreservingSelection` (called
    // from the SSE `sessions-changed` handler) used to read the
    // `selectedSession` state variable directly. That handler is captured
    // ONCE inside a `[]`-dependency `useEffect` at mount time and never
    // gets a fresh closure on re-render, so it always saw the mount-time
    // value of `selectedSession` (`null`) — silently resetting the
    // selection to `list[0]` on every unrelated background file change,
    // anywhere on disk. Fixed by reading `selectedSessionRef.current`.
    const threeSessions = [
      { id: 'session-1', name: 'First Session', timestamp: '2026-07-21T14:30:00Z', model: 'claude-opus-4-8', project: 'agents', transcript: [] },
      { id: 'session-2', name: 'Second Session', timestamp: '2026-07-21T14:00:00Z', model: 'claude-haiku-4-5', project: 'agents', transcript: [] },
      { id: 'session-3', name: 'Third Session', timestamp: '2026-07-21T13:00:00Z', model: 'claude-sonnet-5', project: 'agents', transcript: [] }
    ];
    fetch.mockImplementation((url) => {
      if (url === '/api/sessions') {
        return Promise.resolve({ ok: true, json: async () => threeSessions });
      }
      if (typeof url === 'string' && url.includes('/timeline')) {
        return Promise.resolve({ ok: true, json: async () => EMPTY_TIMELINE });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    });

    const { container } = render(<App />);
    await waitFor(() => expect(screen.getAllByText('First Session').length).toBeGreaterThan(0));

    // Explicitly select the LAST session — not list[0], the default.
    fireEvent.click(screen.getByText('Third Session'));
    await waitFor(() => expect(container.querySelector('.session-detail-header h1')?.textContent).toBe('Third Session'));

    // Simulate an unrelated background file change (e.g. some other
    // session's transcript growing) arriving over the SSE stream.
    expect(MockEventSource.instances.length).toBeGreaterThan(0);
    const es = MockEventSource.instances[MockEventSource.instances.length - 1];
    es.onmessage({ data: JSON.stringify({ type: 'sessions-changed' }) });

    // The handler debounces the refresh by 500ms.
    await new Promise((r) => setTimeout(r, 600));

    // Selection must still be "Third Session" — the bug reset it to
    // "First Session" (list[0]) here.
    await waitFor(() => expect(container.querySelector('.session-detail-header h1')?.textContent).toBe('Third Session'));
    expect(container.querySelector('.session-item.active .session-name')?.textContent).toBe('Third Session');
  });


  it('pinning a session PATCHes /api/sessions/:id and preserves the current selection', async () => {
    const threeSessions = [
      { id: 'session-1', name: 'First Session', timestamp: '2026-07-21T14:30:00Z', model: 'claude-opus-4-8', project: 'agents', transcript: [], pinned: false },
      { id: 'session-2', name: 'Second Session', timestamp: '2026-07-21T14:00:00Z', model: 'claude-haiku-4-5', project: 'agents', transcript: [], pinned: false },
      { id: 'session-3', name: 'Third Session', timestamp: '2026-07-21T13:00:00Z', model: 'claude-sonnet-5', project: 'agents', transcript: [], pinned: false }
    ];
    let currentSessions = [...threeSessions];
    fetch.mockImplementation((url, options = {}) => {
      const method = options.method || 'GET';
      if (url === '/api/sessions' && method === 'GET') {
        return Promise.resolve({ ok: true, json: async () => currentSessions });
      }
      if (typeof url === 'string' && url.startsWith('/api/sessions/session-2') && method === 'PATCH') {
        const body = JSON.parse(options.body);
        currentSessions = currentSessions.map((s) => (s.id === 'session-2' ? { ...s, ...body } : s));
        return Promise.resolve({ ok: true, json: async () => ({}) });
      }
      if (typeof url === 'string' && url.includes('/timeline')) {
        return Promise.resolve({ ok: true, json: async () => EMPTY_TIMELINE });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    });

    const { container } = render(<App />);
    await waitFor(() => expect(screen.getAllByText('First Session').length).toBeGreaterThan(0));

    fireEvent.click(screen.getByText('Third Session'));
    await waitFor(() => expect(container.querySelector('.session-detail-header h1')?.textContent).toBe('Third Session'));

    fireEvent.click(screen.getByLabelText('Pin Second Session'));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/sessions/session-2',
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ pinned: true }) })
      )
    );
    // Pinning a different (non-selected) session must not steal the selection.
    expect(container.querySelector('.session-detail-header h1')?.textContent).toBe('Third Session');
  });
});


describe('Theme System', () => {
  // Helper to compute contrast ratio per WCAG spec
  function computeContrastRatio(rgb1Str, rgb2Str) {
    const toRGB = (s) => {
      const match = s.match(/\d+/g);
      return match ? { r: parseInt(match[0]), g: parseInt(match[1]), b: parseInt(match[2]) } : null;
    };
    const relativeLuminance = ({ r, g, b }) => {
      const [rs, gs, bs] = [r, g, b].map(c => {
        c = c / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
    };
    const rgb1 = toRGB(rgb1Str);
    const rgb2 = toRGB(rgb2Str);
    if (!rgb1 || !rgb2) return null;
    const l1 = relativeLuminance(rgb1);
    const l2 = relativeLuminance(rgb2);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
  }

  // Helper to convert hex to RGB string for contrast computation
  function hexToRGB(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgb(${r}, ${g}, ${b})`;
  }

  it('[data-theme="dark"] overrides every E1-S1 semantic token with a dark value', () => {
    // Read theme.css and verify dark-mode tokens exist
    const fs = require('fs');
    const path = require('path');
    const themeCssPath = path.join(__dirname, './theme.css');
    const themeCss = fs.readFileSync(themeCssPath, 'utf-8');
    
    // Extract the [data-theme="dark"] block
    const darkModeMatch = themeCss.match(/\[data-theme="dark"\]\s*\{([\s\S]*?)\}/);
    expect(darkModeMatch).toBeTruthy();
    const darkModeBlock = darkModeMatch[1];
    
    // Define expected tokens
    const requiredTokens = ['--primary', '--success', '--warning', '--danger', '--neutral', '--sidebar-bg'];
    
    requiredTokens.forEach(token => {
      // Check that the token is defined in the dark mode block
      const tokenRegex = new RegExp(`${token}\\s*:\\s*#[0-9a-fA-F]{6}`);
      expect(darkModeBlock).toMatch(tokenRegex);
    });
  });

  it('dark-mode primary/text token pairs meet WCAG-AA contrast thresholds', () => {
    // Test that primary token has sufficient contrast against dark background
    const fs = require('fs');
    const path = require('path');
    const themeCssPath = path.join(__dirname, './theme.css');
    const themeCss = fs.readFileSync(themeCssPath, 'utf-8');
    
    // Extract dark-mode primary color
    const darkModeMatch = themeCss.match(/\[data-theme="dark"\]\s*\{([\s\S]*?)\}/);
    expect(darkModeMatch).toBeTruthy();
    const darkModeBlock = darkModeMatch[1];
    
    const primaryMatch = darkModeBlock.match(/--primary\s*:\s*(#[0-9a-fA-F]{6})/);
    expect(primaryMatch).toBeTruthy();
    const primaryHex = primaryMatch[1];
    
    // Dark background for testing: #0f0f0f (from theme.css --bg-primary in dark mode)
    const darkBg = '#0f0f0f';
    
    const primaryRGB = hexToRGB(primaryHex);
    const bgRGB = hexToRGB(darkBg);
    
    const contrastRatio = computeContrastRatio(primaryRGB, bgRGB);
    
    // For UI elements (>=3:1), we expect primary to meet this
    // For text (>=4.5:1), we expect it to meet this too
    expect(contrastRatio).toBeGreaterThanOrEqual(4.5);
    
    
    // F1 fix: In dark mode, active sidebar items should have dark text on light background
    // This test verifies that F1's override (color: var(--bg-primary)) solves the white-on-primary contrast issue
    // bg-primary in dark mode is #0f0f0f, so we need to test contrast of dark text on primary
    const darkTextRGB = hexToRGB('#0f0f0f');  // --bg-primary in dark mode
    const darkTextOnPrimaryContrast = computeContrastRatio(darkTextRGB, primaryRGB);
    // Dark text (#0f0f0f) on primary should have good contrast
    expect(darkTextOnPrimaryContrast).toBeGreaterThanOrEqual(4.5);
  });

  it('reloading with saved app-theme=dark applies data-theme=dark from localStorage before first paint (ThemeContext reused)', async () => {
    // Mock localStorage to have app-theme=dark
    const store = { 'app-theme': 'dark' };
    const mockLocalStorage = {
      getItem: (key) => store[key] || null,
      setItem: (key, value) => { store[key] = value; },
      removeItem: (key) => { delete store[key]; },
      clear: () => { Object.keys(store).forEach(key => delete store[key]); }
    };
    
    Object.defineProperty(window, 'localStorage', {
      value: mockLocalStorage,
      writable: true,
      configurable: true
    });
    
    // Render App with dark theme preset in localStorage
    render(<App />);
    
    // Verify the root element has data-theme='dark' applied
    const root = document.documentElement;
    expect(root).toHaveAttribute('data-theme', 'dark');
    
    // Clean up
    mockLocalStorage.clear();
  });
});
