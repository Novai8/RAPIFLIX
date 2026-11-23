/*
 * Real-provider smoke test (not mocked).
 *
 * Serves the fixed app locally, then loads varied titles through the real
 * VidCore embed in Chromium. Records, per title:
 *   - the iframe URL Rapiflix constructed
 *   - whether the provider document and its inner player frame mounted
 *   - whether a <video> element with a real source exists
 *   - whether playback events were observed
 *
 * It never claims playback unless a media element actually advanced.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.SMOKE_PORT || 4174);
const BASE = `http://127.0.0.1:${PORT}`;

const CASES = [
  { type: 'movie', id: 27205, title: 'Inception', year: 2010 },
  { type: 'movie', id: 157336, title: 'Interstellar', year: 2014 },
  { type: 'movie', id: 533535, title: 'Deadpool & Wolverine', year: 2024 },
  { type: 'movie', id: 438631, title: 'Dune', year: 2021 },
  { type: 'movie', id: 569094, title: 'Spider-Man: Across the Spider-Verse', year: 2023 },
  { type: 'movie', id: 414906, title: 'The Batman', year: 2022 },
  { type: 'movie', id: 329865, title: 'Arrival', year: 2016 },
  { type: 'movie', id: 238, title: 'The Godfather', year: 1972 },
  { type: 'movie', id: 666277, title: 'Past Lives', year: 2023 },
  { type: 'movie', id: 155, title: 'The Dark Knight', year: 2008 },
  { type: 'movie', id: 680, title: 'Pulp Fiction', year: 1994 },
  { type: 'movie', id: 13, title: 'Forrest Gump', year: 1994 },
  { type: 'movie', id: 603, title: 'The Matrix', year: 1999 },
  { type: 'movie', id: 129, title: 'Spirited Away', year: 2001 },
  { type: 'movie', id: 872585, title: 'Oppenheimer', year: 2023 },
  { type: 'tv', id: 1399, title: 'Game of Thrones', season: 1, episode: 1 },
  { type: 'tv', id: 70523, title: 'Dark', season: 1, episode: 1 },
  { type: 'tv', id: 94997, title: 'House of the Dragon', season: 1, episode: 1 }
];

const server = spawn(process.execPath, ['serve.mjs'], {
  cwd: fileURLToPath(new URL('.', import.meta.url)),
  env: { ...process.env, PORT: String(PORT) },
  stdio: 'ignore'
});

async function waitForServer() {
  for (let i = 0; i < 50; i += 1) {
    try {
      const response = await fetch(`${BASE}/`);
      if (response.ok) return;
    } catch {}
    await sleep(200);
  }
  throw new Error('local server did not start');
}

async function inspect(page, testCase) {
  const query = testCase.type === 'tv' ? `?type=tv&season=${testCase.season}&episode=${testCase.episode}` : '?type=movie';
  const url = `${BASE}/watch/${testCase.id}${query}`;
  const errors = [];
  const popups = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('popup', (popup) => { popups.push(popup.url()); popup.close().catch(() => {}); });

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1200);
  const src = await page.locator('#playerStage iframe').first().getAttribute('src').catch(() => null);
  const iframeMountedAt = Date.now();
  await page.waitForTimeout(20000);

  const providerFrames = page.frames().filter((frame) => /vidcore\.org|vidspark\.to/.test(frame.url()));
  let videoCount = 0;
  let mediaPixels = false;
  for (const frame of providerFrames) {
    try {
      videoCount += await frame.evaluate(() => document.querySelectorAll('video').length);
      mediaPixels = mediaPixels || await frame.evaluate(() => {
        const video = document.querySelector('video');
        return !!video && (video.readyState > 0 || video.currentTime > 0);
      });
    } catch {}
  }
  const state = await page.locator('#playerStage').getAttribute('data-state');
  return { src, state, providerFrames: providerFrames.length, videoCount, mediaPixels, errors, popups: popups.length, waitedMs: Date.now() - iframeMountedAt };
}

try {
  await waitForServer();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const rows = [];
  for (const testCase of CASES) {
    const page = await context.newPage();
    try {
      const result = await inspect(page, testCase);
      rows.push({ ...testCase, ...result });
      console.log(JSON.stringify(rows[rows.length - 1]));
    } catch (error) {
      rows.push({ ...testCase, src: null, state: 'error', error: String(error).slice(0, 160) });
      console.log(JSON.stringify(rows[rows.length - 1]));
    } finally {
      await page.close();
    }
  }
  await browser.close();
  const summary = {
    total: rows.length,
    urlOk: rows.filter((row) => row.src && !/rapiflix/.test(row.src)).length,
    providerLoaded: rows.filter((row) => row.providerFrames > 0).length,
    withVideoElement: rows.filter((row) => row.videoCount > 0).length,
    playbackEvidence: rows.filter((row) => row.mediaPixels).length,
    rows
  };
  console.log('SMOKE_SUMMARY ' + JSON.stringify(summary));
} finally {
  server.kill();
}
