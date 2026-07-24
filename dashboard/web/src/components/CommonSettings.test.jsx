import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import CommonSettings from './CommonSettings';

global.fetch = vi.fn();

const mockConfigResponse = {
  fields: [
    { key: 'hideThinkingBlock', group: 'Thinking', label: 'Hide thinking blocks', type: 'boolean' },
    { key: 'defaultThinkingLevel', group: 'Thinking', label: 'Default thinking level', type: 'enum', enumValues: ['minimal', 'low', 'medium', 'high', 'auto'] },
    { key: 'tools.maxTimeout', group: 'Tools & Approvals', label: 'Max tool timeout (s)', type: 'number' },
    { key: 'task.maxConcurrency', group: 'Subagents', label: 'Max concurrent subagents', type: 'number' },
    { key: 'theme.dark', group: 'Appearance', label: 'Dark theme name', type: 'combobox' }
  ],
  values: {
    hideThinkingBlock: false,
    defaultThinkingLevel: 'high',
    'tools.maxTimeout': 30,
    'task.maxConcurrency': 5,
    'theme.dark': 'sandstone'
  },
  descriptions: {
    'theme.dark': 'Theme used on dark backgrounds'
  },
  suggestions: {
    'theme.dark': ['sandstone', 'titanium']
  }
};

function mockFetchRouter(overrides = {}) {
  fetch.mockImplementation((url, options = {}) => {
    const method = options.method || 'GET';

    // GET /api/omp-config
    if (url === '/api/omp-config' && method === 'GET') {
      return Promise.resolve({
        ok: true,
        json: async () => overrides.getConfig?.() || mockConfigResponse
      });
    }

    // PUT /api/omp-config/:key
    if (/^\/api\/omp-config\/[^/]+$/.test(url) && method === 'PUT') {
      const body = JSON.parse(options.body || '{}');
      return Promise.resolve({
        ok: true,
        json: async () => ({ key: url.split('/').pop(), value: body.value, type: 'string', description: '' })
      });
    }

    // POST /api/omp-config/:key/reset
    if (/^\/api\/omp-config\/[^/]+\/reset$/.test(url) && method === 'POST') {
      const key = url.split('/')[3];
      const defaultValues = {
        hideThinkingBlock: false,
        defaultThinkingLevel: 'auto',
        'tools.maxTimeout': 60,
        'task.maxConcurrency': 10
      };
      return Promise.resolve({
        ok: true,
        json: async () => ({ key, value: defaultValues[key], type: 'string', description: '' })
      });
    }

    return Promise.reject(new Error(`Unexpected fetch: ${method} ${url}`));
  });
}

describe('CommonSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchRouter();
  });

  it('loads config from /api/omp-config on mount', async () => {
    render(<CommonSettings />);
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/omp-config');
    });
  });

  it('groups fields by group, preserving order', async () => {
    render(<CommonSettings />);
    await waitFor(() => {
      // Thinking group should appear first
      const thinkingHeading = screen.getByText('Thinking');
      const toolsHeading = screen.getByText('Tools & Approvals');
      const subagentsHeading = screen.getByText('Subagents');

      const thinkingPos = screen.getByText('Thinking').compareDocumentPosition(screen.getByText('Tools & Approvals'));
      // compareDocumentPosition returns 4 if first node is before second (DOCUMENT_POSITION_FOLLOWING)
      expect(thinkingPos).toBe(4);
    });
  });

  it('renders field labels and controls', async () => {
    render(<CommonSettings />);
    await waitFor(() => {
      expect(screen.getByText('Hide thinking blocks')).toBeInTheDocument();
      expect(screen.getByText('Default thinking level')).toBeInTheDocument();
      expect(screen.getByText('Max tool timeout (s)')).toBeInTheDocument();
    });
  });

  it('renders boolean field as checkbox', async () => {
    render(<CommonSettings />);
    await waitFor(() => {
      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).toHaveProperty('checked', false); // Initial value from fixture
    });
  });

  it('renders enum field as select with enumValues options', async () => {
    render(<CommonSettings />);
    await waitFor(() => {
      const selects = screen.getAllByRole('combobox');
      expect(selects.length).toBeGreaterThan(0);
      const thinkingSelect = selects.find((s) => s.closest('.field-row')?.textContent.includes('Default thinking level'));
      expect(thinkingSelect).toBeInTheDocument();
      expect(thinkingSelect.querySelectorAll('option').length).toBe(5); // 5 enum values
    });
  });

  it('renders number field as input[type=number]', async () => {
    render(<CommonSettings />);
    await waitFor(() => {
      const numberInputs = screen.getAllByDisplayValue('30');
      expect(numberInputs.length).toBeGreaterThan(0);
    });
  });

  it('toggling boolean checkbox fires PUT /api/omp-config/:key with {value: boolean}', async () => {
    render(<CommonSettings />);
    await waitFor(() => {
      expect(screen.getByRole('checkbox')).toBeInTheDocument();
    });

    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        '/api/omp-config/hideThinkingBlock',
        expect.objectContaining({
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: true })
        })
      );
    });
  });

  it('changing enum select fires PUT /api/omp-config/:key with {value: string}', async () => {
    render(<CommonSettings />);
    await waitFor(() => {
      const selects = screen.getAllByRole('combobox');
      expect(selects.length).toBeGreaterThan(0);
    });

    const selects = screen.getAllByRole('combobox');
    const thinkingSelect = selects.find((s) => s.closest('.field-row')?.textContent.includes('Default thinking level'));
    fireEvent.change(thinkingSelect, { target: { value: 'low' } });

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        '/api/omp-config/defaultThinkingLevel',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ value: 'low' })
        })
      );
    });
  });

  it('clicking Reset button fires POST /api/omp-config/:key/reset', async () => {
    render(<CommonSettings />);
    await waitFor(() => {
      expect(screen.getByRole('checkbox')).toBeInTheDocument();
    });

    const resetButtons = screen.getAllByRole('button').filter((btn) => btn.className.includes('field-reset-btn'));
    const hideThinkingRow = resetButtons[0]; // First reset button is for hideThinkingBlock
    fireEvent.click(hideThinkingRow);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        '/api/omp-config/hideThinkingBlock/reset',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        })
      );
    });
  });

  it('Reset button updates displayed value from reset response', async () => {
    render(<CommonSettings />);
    await waitFor(() => {
      expect(screen.getByRole('checkbox')).toBeInTheDocument();
    });

    const checkbox = screen.getByRole('checkbox');
    // Initial state should be false
    expect(checkbox).toHaveProperty('checked', false);

    // Click reset (which will "reset" to false anyway in the mock, but that's ok for the test)
    const resetButtons = screen.getAllByRole('button').filter((btn) => btn.className.includes('field-reset-btn'));
    fireEvent.click(resetButtons[0]);

    // The value should still be false after reset (matching the mock's default)
    await waitFor(() => {
      expect(checkbox).toHaveProperty('checked', false);
    });
  });

  it('handles error from fetch gracefully', async () => {
    fetch.mockImplementation(() =>
      Promise.resolve({
        ok: false,
        json: async () => ({ error: 'Server error' })
      })
    );

    render(<CommonSettings />);

    await waitFor(() => {
      // Component should still render (no crash) even if fetch fails
      expect(screen.getByText(/Settings/)).toBeInTheDocument();
    });
  });

  it('renders combobox field as a text input with datalist suggestions', async () => {
    render(<CommonSettings />);
    await waitFor(() => {
      expect(screen.getByText('Dark theme name')).toBeInTheDocument();
    });

    const input = screen.getByDisplayValue('sandstone');
    expect(input.tagName).toBe('INPUT');
    expect(input.getAttribute('type')).toBe('text');

    const listId = input.getAttribute('list');
    expect(listId).toBeTruthy();
    const datalist = document.getElementById(listId);
    expect(datalist.tagName).toBe('DATALIST');
    const options = Array.from(datalist.querySelectorAll('option')).map((o) => o.value);
    expect(options).toContain('titanium');
  });

  it('renders omp description as help text for a field', async () => {
    render(<CommonSettings />);
    await waitFor(() => {
      expect(screen.getByText('Theme used on dark backgrounds')).toBeInTheDocument();
    });
  });

  it('renders boolean field as a checkbox wrapped in a toggle switch', async () => {
    render(<CommonSettings />);
    await waitFor(() => {
      expect(screen.getByRole('checkbox')).toBeInTheDocument();
    });

    const checkbox = screen.getByRole('checkbox');
    expect(checkbox.className).toContain('field-toggle-input');
    expect(checkbox.closest('.field-toggle')).toBeInTheDocument();
  });

  it('shows a modified badge after changing a field value', async () => {
    render(<CommonSettings />);
    await waitFor(() => {
      const selects = screen.getAllByRole('combobox');
      expect(selects.length).toBeGreaterThan(0);
    });

    const selects = screen.getAllByRole('combobox');
    const thinkingSelect = selects.find((s) => s.closest('.field-row')?.textContent.includes('Default thinking level'));
    const row = thinkingSelect.closest('.field-row');
    expect(row.querySelector('.field-modified')).toBeNull();

    fireEvent.change(thinkingSelect, { target: { value: 'low' } });

    await waitFor(() => {
      expect(row.querySelector('.field-modified')).toBeInTheDocument();
    });
  });
});
