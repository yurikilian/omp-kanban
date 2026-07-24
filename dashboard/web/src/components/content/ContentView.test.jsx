import { describe, it, expect } from 'vitest';
import { detectView, extLang } from './ContentView';

describe('detectView', () => {
  it('detects a code file snapshot and strips numbered-line prefixes', () => {
    const content = '[foo.ts#1A2B]\n1:const x = 1;\n2:const y = 2;';
    const view = detectView('read', content);
    expect(view.kind).toBe('code');
    expect(view.language).toBe('typescript');
    expect(view.path).toBe('foo.ts');
    expect(view.rawText).toBe('const x = 1;\nconst y = 2;');
  });

  it('detects a markdown file snapshot from its header extension', () => {
    const content = '[README.md#9F1A]\n1:# Title\n2:Body text';
    const view = detectView('read', content);
    expect(view.kind).toBe('markdown');
    expect(view.rawText).toBe('# Title\nBody text');
  });

  it('strips ranged numbered prefixes like "5-16:" (unmapped ext falls back to code/text lang)', () => {
    const content = '[notes.txt#0000]\n5-16:some collapsed summary line';
    const view = detectView('read', content);
    expect(view.kind).toBe('code');
    expect(view.language).toBe('text');
    expect(view.rawText).toBe('some collapsed summary line');
  });

  it('classifies bash tool output as terminal', () => {
    const view = detectView('bash', 'Wall time: 1.2s\n$ echo hi\nhi');
    expect(view.kind).toBe('terminal');
  });

  it('classifies hub tool output as terminal', () => {
    const view = detectView('hub', 'process started');
    expect(view.kind).toBe('terminal');
  });

  it('classifies <task-result> XML as structured', () => {
    const view = detectView('task', '<task-result id="1" agent="Scout" status="completed"><preview>done</preview></task-result>');
    expect(view.kind).toBe('structured');
  });

  it('classifies a heading-led non-file payload as markdown', () => {
    const view = detectView('read', '## Section\nSome content here');
    expect(view.kind).toBe('markdown');
  });

  it('never treats grep output headings as markdown', () => {
    const view = detectView('grep', '## some/file.js\n12: match line');
    expect(view.kind).toBe('text');
  });

  it('falls back to text for empty content', () => {
    const view = detectView('bash', '   ');
    expect(view.kind).toBe('text');
    expect(view.rawText).toBe('');
  });

  it('falls back to text for plain unstructured content', () => {
    const view = detectView('read', 'just some plain output');
    expect(view.kind).toBe('text');
  });
});

describe('extLang', () => {
  it('maps known extensions to highlighter languages', () => {
    expect(extLang('a.ts')).toBe('typescript');
    expect(extLang('a.py')).toBe('python');
    expect(extLang('a.rs')).toBe('rust');
    expect(extLang('a.md')).toBe('markdown');
    expect(extLang('a.yaml')).toBe('yaml');
  });

  it('falls back to text for unknown extensions', () => {
    expect(extLang('a.xyz')).toBe('text');
    expect(extLang('')).toBe('text');
  });
});
