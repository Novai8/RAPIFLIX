/*
 * Browser regression suite for the Rapiflix watch room.
 *
 * Real provider traffic is blocked here on purpose: these tests assert the
 * contract Rapiflix owns (URLs, origins, states, recovery). A separate live
 * smoke script checks the real provider.
 */
import { test, expect } from '@playwright/test';

const BASE = process.env.RAPIFLIX_BASE || 'http://127.0.0.1:4173';
const PLAYER_ORIGIN = 'https://vidcore.org';

async function blockProvider(page) {
  await page.route(`${PLAYER_ORIGIN}/**`, (route) => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: '<!doctype html><html><body><div id="mock-provider">VidCore mock</div><script>parent.postMessage({event:"vidcore:play"},"*");</script></body></html>'
  }));
}

async function gotoWatch(page, path) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
  // Wait past the loading skeleton to a settled room (player or explicit error).
  await expect(page.locator('.watch-page, .detail-page, .error-page')).toBeVisible();
  await expect(page.locator('.title-skeleton')).toHaveCount(0);
}

test('movie watch page mounts exactly one approved provider iframe', async ({ page }) => {
  await blockProvider(page);
  await gotoWatch(page, '/watch/27205?type=movie');
  const frame = page.locator('#playerStage iframe');
  await expect(frame).toHaveCount(1);
  const src = await frame.getAttribute('src');
  expect(src).toBe('https://vidcore.org/embed/movie/27205');
  expect(new URL(src).origin).toBe(PLAYER_ORIGIN);
});

test('a catalogue-external movie still resolves and plays (main regression)', async ({ page }) => {
  await blockProvider(page);
  await gotoWatch(page, '/watch/533535?type=movie');
  await expect(page.locator('#playerStage iframe')).toHaveAttribute('src', 'https://vidcore.org/embed/movie/533535');
  await expect(page.locator('.error-page')).toHaveCount(0);
  await expect(page.locator('.watch-sidebar h1')).toHaveText('Deadpool & Wolverine');
});

test('the provider iframe never loads Rapiflix inside Rapiflix', async ({ page }) => {
  await blockProvider(page);
  for (const path of ['/watch/27205?type=movie', '/watch/157336?type=movie', '/watch/1399?type=tv&season=1&episode=2']) {
    await gotoWatch(page, path);
    const frames = await page.locator('#playerStage iframe').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('src')));
    expect(frames.length).toBe(1);
    const origin = new URL(frames[0]).origin;
    expect(origin).toBe(PLAYER_ORIGIN);
    expect(frames[0]).not.toContain('rapiflix.online');
    expect(frames[0]).not.toMatch(/\/watch\//);
    expect(frames[0]).not.toMatch(/\/title\//);
  }
});

test('TV embeds carry the selected season and episode', async ({ page }) => {
  await blockProvider(page);
  await gotoWatch(page, '/watch/1399?type=tv&season=1&episode=2');
  await expect(page.locator('#playerStage iframe')).toHaveAttribute('src', 'https://vidcore.org/embed/tv/1399/1/2');
});

test('TV without season/episode defaults safely and never builds a malformed URL', async ({ page }) => {
  await blockProvider(page);
  await gotoWatch(page, '/watch/1399?type=tv');
  await expect(page.locator('#playerStage iframe')).toHaveAttribute('src', 'https://vidcore.org/embed/tv/1399/1/1');
});

test('invalid seasons and episodes are rejected rather than interpolated', async ({ page }) => {
  await blockProvider(page);
  await gotoWatch(page, '/watch/1399?type=tv&season=abc&episode=-4');
  const src = await page.locator('#playerStage iframe').getAttribute('src');
  expect(src).toBe('https://vidcore.org/embed/tv/1399/1/1');
});

test('a real play event from the provider removes the loader', async ({ page }) => {
  await blockProvider(page);
  await gotoWatch(page, '/watch/27205?type=movie');
  await expect(page.locator('#playerStage')).toHaveAttribute('data-state', 'playing', { timeout: 10000 });
  await expect(page.locator('#playerBrandLoader')).toHaveCount(0);
});

test('iframe load alone does not claim playback', async ({ page }) => {
  await page.route(`${PLAYER_ORIGIN}/**`, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><body>quiet</body></html>' }));
  await gotoWatch(page, '/watch/27205?type=movie');
  await page.waitForTimeout(3000);
  const state = await page.locator('#playerStage').getAttribute('data-state');
  expect(state).not.toBe('playing');
});

test('messages from the wrong origin are ignored', async ({ page }) => {
  await page.route(`${PLAYER_ORIGIN}/**`, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><body>silent</body></html>' }));
  await gotoWatch(page, '/watch/27205?type=movie');
  await page.evaluate(() => window.postMessage({ event: 'vidcore:play' }, '*'));
  await page.waitForTimeout(600);
  const state = await page.locator('#playerStage').getAttribute('data-state');
  expect(state).not.toBe('playing');
});

test('a loaded provider that never signals playback is unverified, not an error', async ({ page }) => {
  await page.route(`${PLAYER_ORIGIN}/**`, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><body>silent</body></html>' }));
  await gotoWatch(page, '/watch/27205?type=movie');
  const note = page.locator('#playerVerifiedNote');
  await expect(note).toBeVisible({ timeout: 30000 });
  await expect(page.locator('#playerStage')).toHaveAttribute('data-state', 'unverified');
  await expect(page.locator('#playerStage iframe')).toHaveCount(1);
  await expect(note).toContainText('Press play inside the player');
  await expect(page.locator('.player-state-error')).toHaveCount(0);
  await note.locator('[data-dismiss-note]').click();
  await expect(note).toHaveCount(0);
  await expect(page.locator('#playerStage iframe')).toHaveAttribute('src', 'https://vidcore.org/embed/movie/27205');
});

test('an unknown title shows an honest 404 instead of a player', async ({ page }) => {
  await blockProvider(page);
  await gotoWatch(page, '/watch/424242?type=movie');
  await expect(page.locator('.error-page')).toBeVisible();
  await expect(page.locator('#playerStage')).toHaveCount(0);
});

test('non-numeric TMDB IDs are rejected with a clear message', async ({ page }) => {
  await blockProvider(page);
  await gotoWatch(page, '/watch/tt1375666?type=movie');
  await expect(page.locator('.error-page')).toContainText('TMDB');
  await expect(page.locator('#playerStage')).toHaveCount(0);
});

test('switching movies while the player loads keeps only the new frame', async ({ page }) => {
  await page.route(`${PLAYER_ORIGIN}/**`, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><body>slow</body></html>' });
  });
  await gotoWatch(page, '/watch/27205?type=movie');
  await page.evaluate(() => history.pushState({}, '', '/watch/157336?type=movie'));
  await page.evaluate(() => window.dispatchEvent(new PopStateEvent('popstate')));
  await expect(page.locator('#playerStage iframe')).toHaveCount(1, { timeout: 15000 });
  await expect(page.locator('#playerStage iframe')).toHaveAttribute('src', 'https://vidcore.org/embed/movie/157336');
});

test('rapid play and back/forward navigation do not duplicate players', async ({ page }) => {
  await blockProvider(page);
  await gotoWatch(page, '/title/27205?type=movie');
  await page.locator('.detail-actions a.primary-button').click();
  await expect(page.locator('#playerStage iframe')).toHaveCount(1);
  await page.goBack();
  await expect(page.locator('.detail-page')).toBeVisible();
  await page.goForward();
  await expect(page.locator('#playerStage iframe')).toHaveCount(1);
});

test('episode switching updates the embed and keeps one player', async ({ page }) => {
  await blockProvider(page);
  await gotoWatch(page, '/watch/1399?type=tv&season=1&episode=1');
  await expect(page.locator('#playerStage iframe')).toHaveAttribute('src', 'https://vidcore.org/embed/tv/1399/1/1');
  await page.evaluate(() => history.pushState({}, '', '/watch/1399?type=tv&season=1&episode=3'));
  await page.evaluate(() => window.dispatchEvent(new PopStateEvent('popstate')));
  await expect(page.locator('#playerStage iframe')).toHaveAttribute('src', 'https://vidcore.org/embed/tv/1399/1/3');
  await expect(page.locator('#playerStage iframe')).toHaveCount(1);
});

test('season browser loads episodes and links to the right watch URL', async ({ page }) => {
  await blockProvider(page);
  await page.goto(`${BASE}/title/1399?type=tv`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.episode-card').first()).toBeVisible({ timeout: 10000 });
  await page.locator('[data-watch-episode]').nth(1).click();
  await expect(page.locator('#playerStage iframe')).toHaveAttribute('src', 'https://vidcore.org/embed/tv/1399/1/2');
});

test('the mobile player keeps a 16:9 viewport without overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await blockProvider(page);
  await gotoWatch(page, '/watch/27205?type=movie');
  const box = await page.locator('#playerStage').boundingBox();
  expect(box.width).toBeLessThanOrEqual(390);
  expect(Math.abs(box.width / box.height - 16 / 9)).toBeLessThan(0.06);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('the player controls are keyboard focusable with visible focus', async ({ page }) => {
  await page.route(`${PLAYER_ORIGIN}/**`, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><body>quiet</body></html>' }));
  await gotoWatch(page, '/watch/27205?type=movie');
  const control = page.locator('#playerVerifiedNote [data-dismiss-note]').first();
  await expect(control).toBeVisible({ timeout: 30000 });
  await control.focus();
  await expect(control).toBeFocused();
});

test('debug diagnostics are opt-in and never expose a key', async ({ page }) => {
  await blockProvider(page);
  const logs = [];
  page.on('console', (message) => logs.push(message.text()));
  await gotoWatch(page, '/watch/27205?type=movie&debug=1');
  await expect(page.locator('#playerStage')).toHaveAttribute('data-state', 'playing', { timeout: 10000 });
  expect(logs.some((line) => line.includes('[rapiflix-player]'))).toBe(true);
  expect(logs.join('\n')).not.toMatch(/api[_-]?key|bearer|secret/i);
});
