import React from 'react';
import CopyButton from './CopyButton';

// Trailing footer lines like "Wall time: 1.2s" / "Command exited with code 0"
// are dimmed rather than treated as command output.
const FOOTER_LINE = /^(Wall time:|Command exited)/;

export default function TerminalView({ text }) {
  const lines = (text || '').split('\n');

  return (
    <div className="content-view terminal-view">
      <div className="content-view-header">
        <CopyButton text={text} />
      </div>
      <pre className="term">
        {lines.map((line, idx) => (
          <span key={idx} className={FOOTER_LINE.test(line) ? 'term-footer-line' : undefined}>
            {line}
            {idx < lines.length - 1 ? '\n' : ''}
          </span>
        ))}
      </pre>
    </div>
  );
}
