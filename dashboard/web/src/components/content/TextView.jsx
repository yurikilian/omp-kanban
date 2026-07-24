import React from 'react';
import CopyButton from './CopyButton';

/**
 * Fallback plain-text view. Every content view degrades to this on
 * misdetection or parse failure — it never throws.
 */
export default function TextView({ text }) {
  return (
    <div className="content-view text-view">
      <div className="content-view-header">
        <CopyButton text={text} />
      </div>
      <pre className="text-view-body">{text}</pre>
    </div>
  );
}
