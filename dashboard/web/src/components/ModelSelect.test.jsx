import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import ModelSelect from './ModelSelect';

const models = [
  { provider: 'anthropic', id: 'claude-sonnet-5', selector: 'anthropic/claude-sonnet-5', name: 'Claude Sonnet 5', thinking: ['low', 'medium', 'high'] },
  { provider: 'anthropic', id: 'claude-haiku-4-5', selector: 'anthropic/claude-haiku-4-5', name: 'Claude Haiku 4.5', thinking: null },
  { provider: 'openai', id: 'gpt-5', selector: 'openai/gpt-5', name: 'GPT-5', thinking: null }
];

describe('ModelSelect', () => {
  it('groups models by provider into optgroups', () => {
    render(<ModelSelect models={models} value="" onChange={vi.fn()} />);
    const select = screen.getByLabelText('Model');
    const anthropicGroup = within(select).getByRole('group', { name: 'anthropic' });
    const openaiGroup = within(select).getByRole('group', { name: 'openai' });
    expect(within(anthropicGroup).getByText('Claude Sonnet 5')).toBeInTheDocument();
    expect(within(anthropicGroup).getByText('Claude Haiku 4.5')).toBeInTheDocument();
    expect(within(openaiGroup).getByText('GPT-5')).toBeInTheDocument();
  });

  it('shows a thinking-level sub-select only for a model that declares thinking levels', () => {
    const { rerender } = render(<ModelSelect models={models} value="anthropic/claude-sonnet-5" onChange={vi.fn()} />);
    expect(screen.getByLabelText('Thinking level')).toBeInTheDocument();
    expect(screen.getByLabelText('Thinking level')).toHaveDisplayValue('(default)');

    rerender(<ModelSelect models={models} value="anthropic/claude-haiku-4-5" onChange={vi.fn()} />);
    expect(screen.queryByLabelText('Thinking level')).not.toBeInTheDocument();
  });

  it('parses a value with a thinking suffix into model + thinking selections', () => {
    render(<ModelSelect models={models} value="anthropic/claude-sonnet-5:high" onChange={vi.fn()} />);
    expect(screen.getByLabelText('Model')).toHaveValue('anthropic/claude-sonnet-5');
    expect(screen.getByLabelText('Thinking level')).toHaveValue('high');
  });

  it('emits the composed selector:thinking value when the thinking level changes', () => {
    const onChange = vi.fn();
    render(<ModelSelect models={models} value="anthropic/claude-sonnet-5" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Thinking level'), { target: { value: 'medium' } });
    expect(onChange).toHaveBeenCalledWith('anthropic/claude-sonnet-5:medium');
  });

  it('emits the bare selector when a new model is picked', () => {
    const onChange = vi.fn();
    render(<ModelSelect models={models} value="anthropic/claude-haiku-4-5" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Model'), { target: { value: 'openai/gpt-5' } });
    expect(onChange).toHaveBeenCalledWith('openai/gpt-5');
  });

  it('renders an unrecognized current value as a disabled option instead of dropping it', () => {
    render(<ModelSelect models={models} value="openai/some-unknown-model" onChange={vi.fn()} />);
    const option = screen.getByText('openai/some-unknown-model (current, not in catalog)');
    expect(option).toBeInTheDocument();
    expect(option.closest('option')).toBeDisabled();
    // The visible select value falls back to empty (no real model matched), not the unrecognized string.
    expect(screen.getByLabelText('Model')).toHaveValue('');
  });

  it('shows "Use agent default" as the first option when allowInherit is set', () => {
    render(<ModelSelect models={models} value="" onChange={vi.fn()} allowInherit />);
    expect(screen.getByText('Use agent default')).toBeInTheDocument();
  });
});
