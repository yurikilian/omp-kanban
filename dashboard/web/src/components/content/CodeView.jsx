import React from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useTheme } from '../../context/ThemeContext';
import CopyButton from './CopyButton';

export default function CodeView({ language, code, path }) {
  const { theme } = useTheme();

  return (
    <div className="content-view code-view">
      <div className="content-view-header">
        <span className="content-view-label">{path || language}</span>
        <CopyButton text={code} />
      </div>
      <SyntaxHighlighter
        language={language}
        style={theme === 'dark' ? oneDark : oneLight}
        showLineNumbers
        customStyle={{ margin: 0, background: 'transparent' }}
      >
        {code || ''}
      </SyntaxHighlighter>
    </div>
  );
}
