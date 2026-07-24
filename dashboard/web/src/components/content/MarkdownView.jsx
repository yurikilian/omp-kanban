import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import CodeView from './CodeView';
import CopyButton from './CopyButton';

export default function MarkdownView({ source }) {
  const [mode, setMode] = useState('Rendered'); // Rendered | Raw

  return (
    <div className="content-view markdown-view">
      <div className="content-view-header">
        <div className="segmented-toggle">
          {['Rendered', 'Raw'].map((opt) => (
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
        <CopyButton text={source} />
      </div>
      {mode === 'Rendered' ? (
        <div className="markdown-body">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{source || ''}</ReactMarkdown>
        </div>
      ) : (
        <CodeView language="markdown" code={source} />
      )}
    </div>
  );
}
