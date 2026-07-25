import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const sessions = [{
  id: 'long-session',
  name: 'A deliberately long session title that must be ellipsized without wrapping or overflowing the fixed sidebar column',
  timestamp: '2026-07-25T12:00:00.000Z',
  modifiedAt: '2026-07-25T12:00:00.000Z',
  model: 'claude-opus-5',
  project: 'dashboard',
  stats: { messageCount: 4, toolCallCount: 1, inputTokens: 10, outputTokens: 20, cost: 0.01, agentCount: 2 },
}];

const longMarkdown = `# Long plan\n\n${Array.from({ length: 80 }, (_, index) => `- Item ${index}: **full-height markdown** with \`inline code\``).join('\n')}\n\n\`\`\`ts\n${Array.from({ length: 80 }, (_, index) => `const line${index} = ${index};`).join('\n')}\n\`\`\``;

const timeline = {
  id: 'long-session', name: sessions[0].name, project: 'dashboard', count: 4, agents: ['main', 'worker'],
  root: {
    agent: 'main', lane: 0, count: 4, firstTs: '2026-07-25T12:00:00.000Z', lastTs: '2026-07-25T12:03:00.000Z',
    events: [
      { role: 'user', agent: 'main', lane: 0, ts: '2026-07-25T12:00:00.000Z', content: longMarkdown },
      { role: 'assistant', agent: 'main', lane: 0, ts: '2026-07-25T12:01:00.000Z', content: '## Result\n\nA **rendered** response with a list:\n\n- one\n- two\n\n\`code\`' },
      { role: 'system', agent: 'main', lane: 0, ts: '2026-07-25T12:02:00.000Z', content: 'System event' },
      { role: 'tool_execution', agent: 'main', lane: 0, ts: '2026-07-25T12:03:00.000Z', toolName: 'bash', content: 'tool output', resultContent: 'tool output' },
    ],
  },
};

async function installApiFixture(page: Page, preferences: Record<string, unknown> = {}) {
  await page.route('**/api/preferences', async route => {
    if (route.request().method() === 'GET') await route.fulfill({ json: preferences });
    else await route.fulfill({ json: {} });
  });
  await page.route('**/api/sessions/long-session/timeline', route => route.fulfill({ json: timeline }));
  await page.route('**/api/sessions', route => route.fulfill({ json: sessions }));
}

async function load(page: Page, preferences: Record<string, unknown> = {}) {
  await installApiFixture(page, preferences);
  await page.goto('/');
  if (preferences.sidebarCollapsed) {
    await expect(page.getByRole('button', { name: 'Expand sidebar' })).toBeVisible();
  } else {
    await expect(page.locator('.session-item')).toHaveCount(1);
  }
  await expect(page.locator('.timeline-root')).toBeVisible();
}

async function loadWithPendingRequest(page: Page, url: string) {
  const deferred = Promise.withResolvers<void>();
  await installApiFixture(page);
  await page.unroute(url);
  await page.route(url, async route => {
    await deferred.promise;
    await route.fulfill({ json: url.endsWith('/timeline') ? timeline : sessions });
  });
  const navigation = page.goto('/', { waitUntil: 'domcontentloaded' });
  return { navigation, resolve: deferred.resolve };
}

test.describe('Dashboard UX browser acceptance', () => {
  test('E1-S1-AC1', async ({ page }) => { await load(page); await expect(page.locator('.plan-panel')).toHaveCount(0); });
  test('E1-S1-AC2', async ({ page }) => { await load(page); const bodies: string[] = []; page.on('request', request => { if (request.url().endsWith('/api/preferences') && request.method() === 'PUT') bodies.push(request.postData() || ''); }); await page.getByRole('button', { name: 'Collapse sidebar' }).click(); await expect.poll(() => bodies.length).toBeGreaterThan(0); expect(bodies.every(body => !body.includes('planPanelCollapsed'))).toBe(true); });
  test('E1-S1-AC3', async ({ page }) => { const plans: string[] = []; page.on('request', request => { if (request.url().includes('/api/plans')) plans.push(request.url()); }); await load(page); expect(plans).toEqual([]); });
  test('E1-S2-AC1', async ({ page }) => { await load(page); await expect(page.locator('.sidebar')).toHaveCSS('width', '280px'); await expect(page.locator('.sidebar')).not.toHaveAttribute('style', /width/); });
  test('E1-S2-AC2', async ({ page }) => { await load(page); await expect(page.locator('.sidebar-resize-handle')).toHaveCount(0); });
  test('E1-S2-AC3', async ({ page }) => { await load(page, { sidebarWidth: 860 }); await expect(page.locator('.sidebar')).toHaveCSS('width', '280px'); });
  test('E1-S2-AC4', async ({ page }) => { await load(page); await expect(page.locator('.sidebar-resize-handle')).toHaveCount(0); });
  test('E1-S3-AC1', async ({ page }) => { await load(page); const name = page.locator('.session-name'); await expect(name).toHaveCSS('white-space', 'nowrap'); await expect(name).toHaveCSS('text-overflow', 'ellipsis'); expect(await name.evaluate(el => el.clientHeight <= parseFloat(getComputedStyle(el).fontSize) * 2)).toBe(true); });
  test('E1-S3-AC2', async ({ page }) => { await load(page); expect(await page.locator('.session-item').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true); });
  test('E1-S4-AC1', async ({ page }) => { await load(page); await expect(page.locator('.session-list-header').getByRole('button', { name: 'Collapse sidebar' })).toBeVisible(); });
  test('E1-S4-AC2', async ({ page }) => { await load(page); await page.getByRole('button', { name: 'Collapse sidebar' }).click(); await expect(page.locator('.sidebar')).toHaveCount(0); await expect(page.getByRole('button', { name: 'Expand sidebar' })).toBeVisible(); });
  test('E1-S4-AC3', async ({ page }) => { await load(page, { sidebarCollapsed: true }); await expect(page.getByRole('button', { name: 'Expand sidebar' })).toBeVisible(); });
  test('E1-S4-AC4', async ({ page }) => { await load(page, { sidebarCollapsed: true }); await page.getByRole('button', { name: 'Expand sidebar' }).click(); await expect(page.locator('.sidebar')).toHaveCSS('width', '280px'); await expect(page.locator('.session-item')).toBeVisible(); });
  test('E2-S1-AC1', async ({ page }) => { await load(page); const scrollables = await page.locator('.session-detail *').evaluateAll(elements => elements.filter(el => ['auto', 'scroll'].includes(getComputedStyle(el).overflowY)).map(el => el.className)); expect(scrollables).toEqual(['session-detail-messages']); });
  test('E2-S1-AC2', async ({ page }) => { await load(page); for (const selector of ['.markdown-body', '.text-view-body', '.term', '.code-view > pre']) { const values = await page.locator(selector).evaluateAll(elements => elements.map(el => ({ maxHeight: getComputedStyle(el).maxHeight, overflowY: getComputedStyle(el).overflowY }))); expect(values.every(value => !(value.maxHeight === '480px' && ['auto', 'scroll'].includes(value.overflowY)))).toBe(true); } });
  test('E2-S1-AC3', async ({ page }) => { await load(page); const detail = page.locator('.session-detail-messages'); expect(await detail.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true); const nestedScrollable = await page.locator('.session-detail-messages *').evaluateAll(elements => elements.some(el => el.scrollHeight > el.clientHeight && ['auto', 'scroll'].includes(getComputedStyle(el).overflowY))); expect(nestedScrollable).toBe(false); });
  test('E3-S1-AC1', async ({ page }) => { await load(page); const style = await page.locator('.turn-user').evaluate(el => getComputedStyle(el)); expect(style.borderTopWidth).toBe('0px'); expect(style.borderRadius).toBe('0px'); });
  test('E3-S1-AC2', async ({ page }) => { await load(page); for (const selector of ['.turn-group', '.turn-group-following', '.tool-block', '.turn-role-user .turn-head', '.turn-role-assistant .turn-head']) { const borders = await page.locator(selector).evaluateAll(elements => elements.map(el => { const s = getComputedStyle(el); return [s.borderTopWidth, s.borderRightWidth, s.borderBottomWidth, s.borderLeftWidth]; })); expect(borders.flat().every(width => width === '0px')).toBe(true); } });
  test('E3-S1-AC3', async ({ page }) => { await load(page); await expect(page.locator('.turn-assistant .markdown-body h2')).toHaveText('Result'); await expect(page.locator('.turn-assistant .markdown-body ul')).toBeVisible(); await expect(page.locator('.turn-user .markdown-body code').first()).toBeVisible(); });
  test('E3-S1-AC4', async ({ page }) => { await load(page); const gap = await page.locator('.timeline-root').evaluate(el => getComputedStyle(el).gap); expect(parseFloat(gap)).toBeGreaterThan(0); });
  test('E3-S2-AC1', async ({ page }) => { await load(page); const width = await page.locator('.turn-assistant').evaluate(el => parseFloat(getComputedStyle(el).borderLeftWidth)); expect(width).toBeGreaterThan(0); expect(width).toBeLessThanOrEqual(4); });
  test('E3-S2-AC2', async ({ page }) => { await load(page); const assistant = page.locator('.turn-assistant'); const width = await assistant.evaluate(el => parseFloat(getComputedStyle(el).borderLeftWidth)); expect(width).toBeGreaterThan(0); expect(width).toBeLessThanOrEqual(4); expect(await assistant.evaluate(el => el.style.getPropertyValue('--lane-color'))).toBeTruthy(); });
  test('E3-S2-AC3', async ({ page }) => { await load(page); expect(await page.locator('.turn-wrap').first().evaluate(el => el.style.getPropertyValue('--lane-color'))).toBeTruthy(); });
  test('E3-S2-AC4', async ({ page }) => { await load(page); await page.getByRole('button', { name: /Tool calls/ }).click(); await expect(page.locator('.turn-dot')).toHaveCount(4); await expect(page.locator('.turn-dot').first()).toHaveCSS('background-color', 'rgb(59, 130, 246)'); });
  test('E3-S2-C3-guide-continuity', async ({ page }) => { await load(page); const guides = await page.locator('.turn-wrap').evaluateAll(wraps => wraps.map(wrap => { const dot = wrap.querySelector('.turn-dot') as HTMLElement | null; const turn = wrap.querySelector('.turn') as HTMLElement | null; const style = turn ? getComputedStyle(turn) : null; return { dot: dot ? dot.getBoundingClientRect().x : null, guideWidth: style?.borderLeftWidth ?? '0px' }; })); expect(guides.every(guide => guide.guideWidth !== '0px')).toBe(true); });
  test('E4-S1-AC1', async ({ page }) => { const pending = await loadWithPendingRequest(page, '**/api/sessions'); await expect(page.locator('.session-list-skeleton')).toBeVisible(); await expect(page.getByText('Loading sessions...')).toHaveCount(0); pending.resolve(); await pending.navigation; });
  test('E4-S1-AC2', async ({ page }) => { await load(page); await expect(page.locator('.session-list-skeleton')).toHaveCount(0); await expect(page.locator('.session-item')).toHaveCount(1); });
  test('E4-S1-AC3', async ({ page }) => { const pending = await loadWithPendingRequest(page, '**/api/sessions'); await expect(page.locator('.session-list-skeleton .skeleton').first()).toHaveCSS('animation-name', /.+/); pending.resolve(); await pending.navigation; });
  test('E4-S2-AC1', async ({ page }) => { const pending = await loadWithPendingRequest(page, '**/api/sessions/long-session/timeline'); await expect(page.locator('.session-detail-skeleton')).toBeVisible(); await expect(page.getByText('Loading timeline...')).toHaveCount(0); pending.resolve(); await pending.navigation; });
  test('E4-S2-AC2', async ({ page }) => { await load(page); await expect(page.locator('.session-detail-skeleton')).toHaveCount(0); await expect(page.locator('.timeline-root')).toBeVisible(); });
  test('E4-S2-AC3', async ({ page }) => { const pending = await loadWithPendingRequest(page, '**/api/sessions/long-session/timeline'); await expect(page.locator('.session-detail-skeleton .skeleton').first()).toHaveCSS('animation-name', /.+/); pending.resolve(); await pending.navigation; });
});
