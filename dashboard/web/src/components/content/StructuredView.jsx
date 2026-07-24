import React, { useState } from 'react';
import ContentView from './ContentView';
import CodeView from './CodeView';
import TextView from './TextView';

function parseAttrs(attrString) {
  const attrs = {};
  for (const m of attrString.matchAll(/(\w+)="([^"]*)"/g)) {
    attrs[m[1]] = m[2];
  }
  return attrs;
}

/**
 * Renders `task`/`hub` `<task-result>` XML as a structured status card,
 * with a Card/Raw toggle. Falls back to TextView on any parse miss —
 * never throws.
 */
export default function StructuredView({ text }) {
  const [mode, setMode] = useState('Card'); // Card | Raw

  const resultMatch = /<task-result\s+([^>]*)>/.exec(text || '');
  if (!resultMatch) {
    return <TextView text={text} />;
  }

  const attrs = parseAttrs(resultMatch[1]);
  const previewMatch = /<preview[^>]*>([\s\S]*?)<\/preview>/.exec(text || '');
  const inner = previewMatch ? previewMatch[1] : '';
  const isCompleted = attrs.status === 'completed';

  return (
    <div className="content-view structured-view">
      <div className="content-view-header">
        <div className="segmented-toggle">
          {['Card', 'Raw'].map((opt) => (
            <button
              key={opt}
              type="button"
              className={mode === opt ? 'active' : ''}
              onClick={() => setMode(opt)}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>
      {mode === 'Card' ? (
        <div className="structured-card">
          <div className="structured-card-meta">
            <span className={`status-pill ${isCompleted ? 'status-completed' : 'status-pending'}`}>
              {attrs.status || 'unknown'}
            </span>
            <span className="structured-card-id">
              {[attrs.id, attrs.agent, attrs.duration].filter(Boolean).join(' · ')}
            </span>
          </div>
          <div className="structured-card-body">
            <ContentView toolName="" content={inner} />
          </div>
        </div>
      ) : (
        <CodeView language="markup" code={text} />
      )}
    </div>
  );
}
