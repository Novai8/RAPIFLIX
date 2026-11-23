import { test, expect } from '@playwright/test';

const BASE = process.env.RAPIFLIX_BASE || 'http://127.0.0.1:4173';
const PLAYER_ORIGIN = 'https://vidcore.org';

test.beforeEach(async ({ page }) => {
  await page.route(`${PLAYER_ORIGIN}/**`, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><body>mock</body></html>' }));
});

test('home renders the catalogue and rails', async ({ page }) => {
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.hero h1')).toBeVisible();
  await expect(page.locator('.category-rail').first()).toBeVisible();
});

test('movie title room renders details and a watch link', async ({ page }) => {
  await page.goto(`${BASE}/title/27205?type=movie`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.detail-copy h1')).toHaveText('Inception');
  await expect(page.locator('.detail-actions a.primary-button')).toHaveAttribute('href', '/watch/27205?type=movie');
  await expect(page.locator('.cast-list .cast-row').first()).toBeVisible();
});

test('a title outside the initial catalogue still opens', async ({ page }) => {
  await page.goto(`${BASE}/title/533535?type=movie`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.detail-copy h1')).toHaveText('Deadpool & Wolverine');
});

test('search route shows results and links to title rooms', async ({ page }) => {
  await page.goto(`${BASE}/search?q=dune`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.page-heading')).toBeVisible();
  await expect(page.locator('.movie-card').first()).toBeVisible();
});

test('the site shell and design tokens are intact', async ({ page }) => {
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.site-header .brand')).toBeVisible();
  const palette = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--lime').trim());
  expect(palette.length).toBeGreaterThan(0);
});
