import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import ModelsAndAgents from './ModelsAndAgents';

global.fetch = vi.fn();

const mockModels = [
  { provider: 'anthropic', id: 'claude-sonnet-5', selector: 'anthropic/claude-sonnet-5', name: 'Claude Sonnet 5', thinking: ['low', 'high'] },
  { provider: 'anthropic', id: 'claude-haiku-4-5', selector: 'anthropic/claude-haiku-4-5', name: 'Claude Haiku 4.5', thinking: null }
];

const mockAgents = [
  { name: 'scout', source: 'bundled', description: 'Fast read-only scout returning compressed context for handoff.' },
  { name: 'my-custom', source: 'user', description: 'A custom user agent.' }
];

const mockModelRoles = {
  default: 'anthropic/claude-sonnet-5:high',
  smol: 'anthropic/claude-haiku-4-5',
  slow: 'anthropic/claude-sonnet-5',
  vision: 'anthropic/claude-sonnet-5',
  plan: 'anthropic/claude-sonnet-5',
  designer: 'anthropic/claude-sonnet-5',
  commit: 'anthropic/claude-haiku-4-5',
  tiny: 'anthropic/claude-haiku-4-5',
  task: 'anthropic/claude-haiku-4-5',
  advisor: 'anthropic/claude-sonnet-5'
};

const mockAgentOverrides = { scout: 'anthropic/claude-haiku-4-5' };

function mockFetchRouter() {
  fetch.mockImplementation((url, options = {}) => {
    const method = options.method || 'GET';
    if (url === '/api/models') return Promise.resolve({ ok: true, json: async () => mockModels });
    if (url === '/api/agents') return Promise.resolve({ ok: true, json: async () => mockAgents });
    if (url === '/api/model-roles' && method === 'GET') return Promise.resolve({ ok: true, json: async () => mockModelRoles });
    if (url === '/api/agent-model-overrides' && method === 'GET') return Promise.resolve({ ok: true, json: async () => mockAgentOverrides });
    if (url.startsWith('/api/model-roles/') && method === 'PUT') {
      return Promise.resolve({ ok: true, json: async () => ({ key: 'modelRoles', value: {} }) });
    }
    if (url.startsWith('/api/agent-model-overrides/') && method === 'PUT') {
      return Promise.resolve({ ok: true, json: async () => ({ key: 'task.agentModelOverrides', value: {} }) });
    }
    return Promise.resolve({ ok: true, json: async () => ({}) });
  });
}

describe('ModelsAndAgents', () => {
  beforeEach(() => {
    fetch.mockClear();
    mockFetchRouter();
  });

  it('renders all 10 model roles with their labels', async () => {
    render(<ModelsAndAgents />);
    await waitFor(() => expect(screen.getByText('Model Roles')).toBeInTheDocument());
    for (const role of ['default', 'smol', 'slow', 'vision', 'plan', 'designer', 'commit', 'tiny', 'task', 'advisor']) {
      expect(screen.getByText(role)).toBeInTheDocument();
    }
  });

  it('renders a fetched agent with its description', async () => {
    render(<ModelsAndAgents />);
    await waitFor(() => expect(screen.getByText('scout')).toBeInTheDocument());
    expect(screen.getByText('Fast read-only scout returning compressed context for handoff.')).toBeInTheDocument();
    expect(screen.getByText('my-custom')).toBeInTheDocument();
    expect(screen.getByText('A custom user agent.')).toBeInTheDocument();
  });

  it('PUTs the new model when a role select changes', async () => {
    render(<ModelsAndAgents />);
    await waitFor(() => expect(screen.getByText('smol')).toBeInTheDocument());

    const row = screen.getByText('smol').closest('tr');
    const select = within(row);
    fireEvent.change(select.getByLabelText('Model'), { target: { value: 'anthropic/claude-sonnet-5' } });

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/model-roles/smol', expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ model: 'anthropic/claude-sonnet-5' })
      }));
    });
  });
});
