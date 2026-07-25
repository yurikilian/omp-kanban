import { describe, it, expect } from 'vitest';
import React from 'react';
import fs from 'fs';
import path from 'path';
import { render } from '@testing-library/react';
import ContentView, { detectView, extLang } from './ContentView';
import { ThemeProvider } from '../../context/ThemeContext';

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

// ===== Single scroll region (E2-S1) =====
//
// The session detail owns exactly one vertical scroller: `.session-detail-messages`.
// Content blocks used to cap themselves at `max-height: 480px; overflow: auto`,
// which squeezed a long plan into a short box with its own scrollbar nested
// inside that region. These guard both the stylesheet fact and the rendered
// cascade (vitest runs with `css: true`, so getComputedStyle resolves it).

const CSS_SOURCE = fs
  .readFileSync(path.join(__dirname, './content.css'), 'utf-8')
  .replace(/\/\*[\s\S]*?\*\//g, '');

/** Split a stylesheet into [selectorList, declarations] pairs. */
function cssRules(source) {
  return [...source.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({
    selector: selector.trim(),
    declarations: body
      .split(';')
      .map(d => d.trim())
      .filter(Boolean)
  }));
}

/** Declarations of every rule whose selector list contains `selector`. */
function declarationsFor(selector) {
  return cssRules(CSS_SOURCE)
    .filter(rule => rule.selector.split(',').some(s => s.trim() === selector))
    .flatMap(rule => rule.declarations);
}

const SCROLLS = /^overflow(-y)?\s*:\s*(auto|scroll)$/;

const CAPPED_BLOCKS = ['.markdown-body', '.text-view-body', '.term', '.code-view > pre'];

describe('content.css scroll containment (E2-S1-AC2)', () => {
  it.each(CAPPED_BLOCKS)('%s renders at full height with no vertical scroll cap', (selector) => {
    const declarations = declarationsFor(selector);
    expect(declarations.length).toBeGreaterThan(0);
    expect(declarations.filter(d => /^max-height\s*:/.test(d))).toEqual([]);
    expect(declarations.filter(d => SCROLLS.test(d.replace(/\s*!important$/, '')))).toEqual([]);
  });

  it('declares no vertical scroll container anywhere in the content subtree (E2-S1-AC1)', () => {
    const offenders = cssRules(CSS_SOURCE)
      .flatMap(rule => rule.declarations
        .filter(d => SCROLLS.test(d.replace(/\s*!important$/, '')))
        .map(d => `${rule.selector} { ${d} }`));
    expect(offenders).toEqual([]);
  });

  it('keeps horizontal overflow on code blocks while explicitly suppressing vertical overflow', () => {
    const markdownCode = declarationsFor('.markdown-body pre');
    const codeView = declarationsFor('.code-view > pre');
    expect(markdownCode).toContain('overflow-x: auto');
    expect(markdownCode).toContain('overflow-y: hidden');
    expect(codeView).toContain('overflow-x: auto !important');
    expect(codeView).toContain('overflow-y: hidden !important');
  });
});

describe('ContentView rendered scroll containment (E2-S1-AC1, E2-S1-AC3)', () => {
  const LONG_LINES = Array.from({ length: 200 }, (_, i) => `line ${i}`).join('\n');

  const CASES = {
    markdown: ['read', `## Plan\n\n${LONG_LINES}`],
    code: ['read', `[plan.ts#1A2B]\n${LONG_LINES}`],
    terminal: ['bash', LONG_LINES],
    text: ['read', LONG_LINES]
  };

  it.each(Object.entries(CASES))('%s content is not height-capped', (_kind, [toolName, content]) => {
    const { container } = render(
      <ThemeProvider>
        <ContentView toolName={toolName} content={content} />
      </ThemeProvider>
    );
    const capped = [...container.querySelectorAll('*')].filter((el) => {
      const { maxHeight } = getComputedStyle(el);
      return maxHeight && maxHeight !== 'none';
    });
    expect(capped.map(el => el.className)).toEqual([]);
  });

  it.each(Object.entries(CASES))('%s content declares no nested vertical scroller', (_kind, [toolName, content]) => {
    const { container } = render(
      <ThemeProvider>
        <ContentView toolName={toolName} content={content} />
      </ThemeProvider>
    );
    const scrollable = v => v === 'auto' || v === 'scroll';
    const scrollers = [...container.querySelectorAll('*')].filter((el) => {
      // react-syntax-highlighter puts `overflow: auto` inline on its own <pre>.
      // That is third-party and outside this task's reach; it cannot produce a
      // scrollbar because nothing caps the height (asserted above). Everything
      // our own stylesheet governs must not scroll vertically at all.
      if ([el.style.overflow, el.style.overflowY].some(scrollable)) return false;
      const style = getComputedStyle(el);
      // jsdom does not expand the `overflow` shorthand into `overflowY`, so both
      // properties have to be read for the assertion to have any teeth.
      return [style.overflow, style.overflowY].some(scrollable);
    });
    expect(scrollers.map(el => el.className || el.tagName)).toEqual([]);
  });
});
