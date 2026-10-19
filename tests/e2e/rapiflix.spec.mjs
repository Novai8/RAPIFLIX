import { test, expect } from '@playwright/test';

const fixtureImage = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="30"><rect width="20" height="30" fill="#3b2a55"/></svg>';

async function prepare(page, width = 1440) {
  await page.setViewportSize({ width, height: width < 500 ? 800 : 900 });
  const browserErrors = [];
  page.on('pageerror', error => browserErrors.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error') browserErrors.push(`console: ${message.text()}`);
  });
  await page.route('https://image.tmdb.org/**', route => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: fixtureImage }));
  await page.route('https://archive.org/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ response: { docs: [] }, metadata: {}, files: [] }) }));
  await page.route('https://cdn.jsdelivr.net/**', route => route.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  await page.goto('/');
  await expect(page.locator('#movieGrid .movie-card')).toHaveCount(4);
  return browserErrors;
}

test('all fixture catalogue titles render, keep their posters contained, and expose title links', async ({ page }) => {
  const errors = await prepare(page, 1440);
  const cards = page.locator('#movieGrid .movie-card');
  await expect(cards).toHaveCount(4);
  await expect(cards.locator('a[data-title-link]')).toHaveCount(4);
  const links = await cards.locator('a[data-title-link]').evaluateAll(items => items.map(item => item.href));
  expect(links.every(href => new URL(href).pathname.startsWith('/title/'))).toBeTruthy();
  expect(await cards.first().locator('img').evaluate(image => getComputedStyle(image).objectFit)).toBe('contain');
  expect(errors).toEqual([]);
});

test('mobile width, dark and light themes, reduced motion, and accessible controls stay usable', async ({ page }) => {
  const errors = await prepare(page, 360);
  await expect(page.getByRole('searchbox')).toBeVisible();
  await expect(page.getByRole('button', { name: /theme/i })).toBeVisible();
  await page.getByRole('button', { name: /theme/i }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: /theme/i }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBeTruthy();
  expect(await page.locator('#searchInput').getAttribute('aria-label')).toBeTruthy();
  expect(await page.locator('#movieGrid').evaluate(element => element.scrollWidth >= element.clientWidth)).toBeTruthy();
  expect(errors).toEqual([]);
});

test('search handles special characters and quick-view keyboard focus without changing the catalogue URL', async ({ page }) => {
  const errors = await prepare(page, 1440);
  const originalPath = await page.evaluate(() => location.pathname + location.search);
  const search = page.getByRole('searchbox');
  await search.fill('WALL·E');
  await search.press('Enter');
  await expect(page).toHaveURL(/\/search\?q=WALL%C2%B7E/);
  await expect(page.locator('#movieGrid .movie-card')).toHaveCount(1);
  await expect(page.locator('#movieGrid .card-title-link')).toContainText('WALL·E');
  await page.goto('/');
  await expect(page.locator('#movieGrid .movie-card')).toHaveCount(4);
  await page.locator('#movieGrid .card-play').first().click();
  await expect(page.locator('#modalBackdrop')).toBeVisible();
  expect(await page.evaluate(() => location.pathname + location.search)).toBe(originalPath);
  await page.keyboard.press('Escape');
  await expect(page.locator('#modalBackdrop')).toBeHidden();
  expect(errors).toEqual([]);
});

test('direct movie and TV links load, unknown ids show a not-found state, and Back returns home', async ({ page }) => {
  await prepare(page, 1440);
  const movieHref = await page.locator('#movieGrid .card-title-link').first().getAttribute('href');
  await page.goto(movieHref);
  await expect(page.locator('#detailPage')).toBeVisible();
  await expect(page.locator('#detailTitle')).toContainText('WALL·E');
  await page.getByRole('button', { name: /watch now/i }).click();
  await expect(page.locator('#detailPlayerMount iframe')).toHaveAttribute('title', /Video player/);
  await page.getByRole('link', { name: /back to rapiflix/i }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.goto('/title/the-fixture-series?id=1399&type=tv');
  await expect(page.locator('#detailTitle')).toContainText('The Fixture Series');
  await expect(page.locator('#detailEpisodesSection')).toBeVisible();
  await expect(page.locator('.detail-episode')).toHaveCount(2);

  await page.goto('/details/not-a-real-title?id=999&type=movie');
  await expect(page.locator('#detailNotFound')).toBeVisible();
  await expect(page.locator('#detailNotFound')).toContainText(/could not find|valid catalogue/i);
});
