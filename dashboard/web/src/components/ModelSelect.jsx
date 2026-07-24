import React, { useMemo } from 'react';

export default function ModelSelect({ models, value, onChange, allowInherit, disabled }) {
  const byProvider = useMemo(() => {
    const map = new Map();
    for (const m of models) {
      if (!map.has(m.provider)) map.set(m.provider, []);
      map.get(m.provider).push(m);
    }
    return map;
  }, [models]);

  const lastColon = value ? value.lastIndexOf(':') : -1;
  const candidateSelector = lastColon > 0 ? value.slice(0, lastColon) : (value || '');
  const candidateThinking = lastColon > 0 ? value.slice(lastColon + 1) : '';
  const matchedModel = models.find((m) => m.selector === candidateSelector);
  const selector = matchedModel ? candidateSelector : '';
  const thinking = matchedModel ? candidateThinking : '';
  const isUnrecognized = Boolean(value) && !matchedModel;

  const composeAndEmit = (nextSelector, nextThinking) => {
    if (!nextSelector) { onChange(''); return; }
    onChange(nextThinking ? `${nextSelector}:${nextThinking}` : nextSelector);
  };

  return (
    <div className="model-select">
      <select value={selector} disabled={disabled} onChange={(e) => composeAndEmit(e.target.value, '')} aria-label="Model">
        {allowInherit && <option value="">Use agent default</option>}
        {!allowInherit && !selector && <option value="" disabled>Select a model…</option>}
        {isUnrecognized && <option value="" disabled>{value} (current, not in catalog)</option>}
        {[...byProvider.entries()].map(([provider, list]) => (
          <optgroup key={provider} label={provider}>
            {list.map((m) => <option key={m.selector} value={m.selector}>{m.name || m.id}</option>)}
          </optgroup>
        ))}
      </select>
      {matchedModel?.thinking?.length > 0 && (
        <select className="model-select-thinking" value={thinking} disabled={disabled}
          onChange={(e) => composeAndEmit(selector, e.target.value)} aria-label="Thinking level">
          <option value="">(default)</option>
          {matchedModel.thinking.map((level) => <option key={level} value={level}>{level}</option>)}
        </select>
      )}
    </div>
  );
}
