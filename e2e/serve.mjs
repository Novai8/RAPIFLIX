/*
 * Minimal static server for local browser tests.
 *
 * It serves the real index.html, app.js, player-core.js and styles.css, and
 * answers /api/tmdb/* from a fixture so the watch journey can be exercised
 * without a TMDB key. Unknown /api paths answer JSON 404 just like the
 * Cloudflare middleware does.
 */
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixtures } from './fixtures.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 4173);

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg'
};

function json(status, body, headers = {}) {
  return { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers }, body: JSON.stringify(body) };
}

export function resolveApi(url) {
  const pathname = url.pathname.replace(/^\/api\/tmdb\/?/, '');
  if (!/^(movie|tv|search|discover|trending)/.test(pathname)) return json(404, { error: 'This Rapiflix API route does not exist.' });
  if (process.env.RAPIFLIX_METADATA_ORIGIN) return { proxy: pathname + url.search };
  if (fixtures[pathname]) return json(200, fixtures[pathname]);

  const seasonMatch = pathname.match(/^tv\/(\d+)\/season\/(\d+)/);
  if (seasonMatch) return json(200, fixtures.season || { episodes: [] });
  const creditsMatch = pathname.match(/^(movie|tv)\/(\d+)\/credits/);
  if (creditsMatch) return json(200, { cast: [], crew: [] });
  const videosMatch = pathname.match(/^(movie|tv)\/(\d+)\/videos/);
  if (videosMatch) return json(200, { results: [] });
  if (/watch\/providers/.test(pathname)) return json(200, { results: {} });
  if (/^trending|^discover|^search/.test(pathname)) return json(200, { page: 1, results: [], total_pages: 1 });
  if (/^(movie|tv)\/\d+/.test(pathname)) return json(404, { status_message: 'The resource you requested could not be found.' });
  return json(404, { error: 'not found' });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${port}`);

  if (url.pathname.startsWith('/api/')) {
    const result = resolveApi(url);
    if (result.proxy) {
      try {
        const upstream = await fetch(`${process.env.RAPIFLIX_METADATA_ORIGIN}/api/tmdb/${result.proxy}`, {
          headers: { Accept: 'application/json' }
        });
        const body = await upstream.text();
        res.writeHead(upstream.status, {
          'Content-Type': upstream.headers.get('Content-Type') || 'application/json; charset=utf-8',
          'Cache-Control': 'no-store'
        });
        res.end(body);
      } catch {
        res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'metadata proxy unavailable' }));
      }
      return;
    }
    res.writeHead(result.status, result.headers);
    res.end(result.body);
    return;
  }

  // Simulate the Cloudflare SPA rewrite for app routes.
  let file = url.pathname === '/' ? '/index.html' : url.pathname;
  if (!path.extname(file) || /^\/(title|watch|movies|series|anime|search|new)\//.test(file)) file = '/index.html';
  const full = path.join(root, file);
  if (!full.startsWith(root)) { res.writeHead(403); res.end('forbidden'); return; }
  try {
    const body = await readFile(full);
    res.writeHead(200, { 'Content-Type': types[path.extname(full)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html><html><body>Rapiflix 404 for ${url.pathname}</body></html>`);
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`rapiflix-e2e listening on http://127.0.0.1:${port}`);
});
