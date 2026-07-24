import React, { useState } from 'react';

/**
 * Small copy-to-clipboard button used by every content view. Falls back to
 * a hidden textarea + execCommand when `navigator.clipboard` is unavailable
 * (e.g. non-secure/http contexts).
 */
export default function CopyButton({ text }) {
  const [status, setStatus] = useState('idle'); // idle | copied | failed

  const handleClick = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text ?? '');
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text ?? '';
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setStatus('copied');
    } catch {
      setStatus('failed');
    }
    setTimeout(() => setStatus('idle'), 1500);
  };

  return (
    <button type="button" className="copy-button" onClick={handleClick} aria-label="Copy">
      {status === 'copied' ? 'Copied ✓' : status === 'failed' ? 'Copy failed' : 'Copy'}
    </button>
  );
}
