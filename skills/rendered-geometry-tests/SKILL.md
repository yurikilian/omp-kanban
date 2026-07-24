---
name: rendered-geometry-tests
description: Write component tests that assert resolved CSS values instead of source text, so a selector that matches nothing fails the suite. Use when an acceptance criterion names a size, spacing, visibility, or layout outcome, when adding tests for a styling change, when a visual defect shipped past a green suite, or when a test asserts on a `.css` file's contents with a regex.
---

# Rendered-geometry tests

A component suite under jsdom does no layout. `toBeInTheDocument`, `toHaveClass`,
and a regex over a `.css` file all pass whether a rule matches the rendered
element or matches nothing at all. That is the gap this skill closes.

## The failure this prevents

A sidebar icon shipped at roughly 215px. The stylesheet said:

```css
.activity-rail-icon svg { width: 1.25rem; }
```

The component was `<section.icon className="activity-rail-icon" />`, and
heroicons put `className` on the `<svg>` itself. There was no descendant `svg`,
so the rule matched nothing, and a `viewBox`-only svg with no width stretches to
fill its flex parent.

The declaration was present. The value was correct. A source-text test asserting
`/\.activity-rail-icon svg[\s\S]*?width:\s*1\.25rem/` passed. Review passed. QA
passed. The icon was still ten times too large.

**A selector that matches nothing is indistinguishable, in source text, from one
that matches.** Only the resolved cascade tells them apart.

## Setup

Real stylesheets must reach jsdom. In `vitest.config.js`:

```js
export default defineConfig({
  test: {
    environment: 'jsdom',
    css: true   // without this, CSS imports are stubbed and every rule "matches"
  }
});
```

Without `css: true`, `getComputedStyle` returns nothing useful and these tests
are theatre.

## The pattern

```js
it('sizes the icons from the stylesheet rather than letting them stretch', () => {
  render(<ActivityRail active="sessions" onSelect={vi.fn()} />);
  const icon = document.querySelector('svg.activity-rail-icon');
  const { width, height } = getComputedStyle(icon);
  expect(width).toBe('1.25rem');
  expect(height).toBe('1.25rem');
  expect(width).not.toBe('auto');   // 'auto' is what a non-matching selector yields
});
```

Query by the selector **as the stylesheet writes it** (`svg.activity-rail-icon`,
not just `.activity-rail-icon`). That way the test fails if the class ever moves
to a wrapper and the sizing rule is left behind.

## Verify the test can fail

A geometry test that never goes red is worth less than no test, because it buys
false confidence. Before you commit it:

1. Break the selector in the stylesheet — restore the descendant form, or rename
   the class.
2. Run the test. It must fail, and the reported value should be `auto`.
3. Restore the stylesheet. It must pass.

If step 2 passes, `css: true` is not in effect and you are asserting nothing.

## What jsdom still cannot tell you

`getComputedStyle` returns the **resolved cascade**, not a laid-out box. It
reports `1.25rem`, never the final `20px`, and it knows nothing about flex
outcomes, overflow, or stacking. So:

- "Is this rule applied, with this value?" — jsdom answers. Use it.
- "Is this element actually 20px on screen, visible, and not overlapped?" — jsdom
  cannot answer. Drive a real browser, or record the criterion as a gap.

Never let a structural assertion stand in for a geometric one and report the
criterion as covered.

## Sibling case: state restored from storage

The same class of escape hides in persisted state. A width restored from the
server was applied verbatim while only the drag handler clamped it, so a stored
860px on a 1365px viewport left the content pane 0px wide. Every test passed —
all of them used the default.

Loading state is a different code path from setting it, and it is usually the
unvalidated one. Test it with out-of-bounds values:

```js
it('clamps an oversized stored width so the content pane keeps room', async () => {
  const sidebar = await renderWithStoredWidth(860);   // viewport 1365
  expect(parseFloat(sidebar.style.width)).toBeLessThanOrEqual(1365 * 0.4);
});
```
