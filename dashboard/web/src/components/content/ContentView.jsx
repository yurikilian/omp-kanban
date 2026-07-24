import React from 'react';
import CodeView from './CodeView';
import MarkdownView from './MarkdownView';
import TerminalView from './TerminalView';
import StructuredView from './StructuredView';
import TextView from './TextView';
import './content.css';

const EXT_LANG = {
  md: 'markdown', markdown: 'markdown', mdx: 'markdown',
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  ts: 'typescript', tsx: 'typescript',
  json: 'json',
  py: 'python',
  go: 'go',
  rs: 'rust',
  sh: 'bash', bash: 'bash',
  css: 'css',
  html: 'html',
  yml: 'yaml', yaml: 'yaml'
};

export function extLang(filePath) {
  const ext = (filePath || '').split('.').pop()?.toLowerCase();
  return EXT_LANG[ext] || 'text';
}

const FILE_SNAPSHOT_HEADER = /^\[([^\]#\n]+)(?:#[0-9A-Fa-f]{4})?\]$/;
const NUMBERED_PREFIX = /^\s*\*?\s*\d+(?:-\d+)?:/;

/**
 * Heuristically classify a tool-result/read payload into a content kind so
 * the right renderer picks it up. Never throws; unknown/empty degrades to
 * `text`.
 */
export function detectView(toolName, content) {
  const trimmed = (content || '').trim();
  if (!trimmed) return { kind: 'text', rawText: '' };

  const lines = trimmed.split('\n');
  const headerMatch = FILE_SNAPSHOT_HEADER.exec(lines[0].trim());
  if (headerMatch) {
    const filePath = headerMatch[1];
    const rawText = lines.slice(1).map(l => l.replace(NUMBERED_PREFIX, '')).join('\n');
    const language = extLang(filePath);
    if (language === 'markdown') return { kind: 'markdown', rawText };
    return { kind: 'code', language, rawText, path: filePath };
  }

  if (trimmed.includes('<task-result') || trimmed.includes('<preview') || trimmed.includes('<meta ')) {
    return { kind: 'structured', rawText: content };
  }

  if (toolName === 'bash' || toolName === 'hub') {
    return { kind: 'terminal', rawText: content };
  }

  const firstNonEmpty = lines.find(l => l.trim().length > 0) || '';
  if (toolName !== 'grep' && /^#{1,6}\s/.test(firstNonEmpty)) {
    return { kind: 'markdown', rawText: content };
  }

  return { kind: 'text', rawText: content };
}

export default function ContentView({ toolName, content }) {
  const view = detectView(toolName, content);

  switch (view.kind) {
    case 'code':
      return <CodeView language={view.language} code={view.rawText} path={view.path} />;
    case 'markdown':
      return <MarkdownView source={view.rawText} />;
    case 'structured':
      return <StructuredView text={view.rawText} />;
    case 'terminal':
      return <TerminalView text={view.rawText} />;
    default:
      return <TextView text={view.rawText} />;
  }
}
