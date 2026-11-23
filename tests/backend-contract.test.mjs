import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFile(path.join(root, file), 'utf8');

const fileUrl = (file) => pathToFileURL(path.join(root, file)).href;
const { onRequest: tmdbOnRequest } = await import(fileUrl('functions/api/tmdb/[[path]].js'));
const { onRequest: middleware } = await import(fileUrl('functions/api/_middleware.js'));

function jsonRequest(pathname, init) {
  return new Request(`https://rapiflix.online${pathname}`, init);
}

function tmdbContext(pathname, env = {}, method = 'GET') {
  const url = new URL(`https://rapiflix.online${pathname}`);
  return {
    request: jsonRequest(pathname, { method }),
    env,
    params: { path: url.pathname.replace(/^\/api\/tmdb\/?/, '').split('/') }
  };
}

function mockFetch(handler) {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  return () => { globalThis.fetch = original; };
}

test('TMDB proxy refuses to run without a server-side key', async () => {
  const response = await tmdbOnRequest(tmdbContext('/api/tmdb/movie/27205'));
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('Content-Type'), 'application/json; charset=utf-8');
  const body = await response.json();
  assert.match(body.error, /TMDB is not configured/);
});

test('TMDB proxy keeps the API key server-side and forwards allowed params', async () => {
  let seenUrl = null;
  const restore = mockFetch(async (input) => {
    seenUrl = String(input);
    return new Response(JSON.stringify({ id: 27205, title: 'Inception' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  });
  try {
    const response = await tmdbOnRequest(tmdbContext('/api/tmdb/movie/27205?language=en-US&api_key=attacker&evil=1', { TMDB_API_KEY: 'server-secret' }));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.id, 27205);
    assert.ok(seenUrl.includes('api_key=server-secret'));
    assert.ok(!seenUrl.includes('attacker'), 'client-supplied api_key must be discarded');
    assert.ok(!seenUrl.includes('evil=1'), 'unlisted params must be discarded');
    assert.equal(response.headers.get('Cache-Control'), 'public, max-age=60, s-maxage=240');
  } finally {
    restore();
  }
});

test('TMDB proxy allows movie, TV and season detail endpoints', async () => {
  const paths = ['movie/27205', 'tv/1399', 'tv/1399/season/1', 'tv/1399/season/0'];
  for (const route of paths) {
    const restore = mockFetch(async () => new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
    try {
      const response = await tmdbOnRequest(tmdbContext(`/api/tmdb/${route}`, { TMDB_API_KEY: 'k' }));
      assert.equal(response.status, 200, `${route} should be allowed`);
    } finally {
      restore();
    }
  }
});

test('TMDB proxy rejects routes outside the allowlist', async () => {
  const restore = mockFetch(async () => { throw new Error('should not be called'); });
  try {
    for (const route of ['account', 'movie/../../etc/passwd', 'authentication/session', 'movie/0', 'tv/abc']) {
      const response = await tmdbOnRequest(tmdbContext(`/api/tmdb/${route}`, { TMDB_API_KEY: 'k' }));
      assert.equal(response.status, 404, `${route} must be rejected`);
    }
  } finally {
    restore();
  }
});

test('TMDB proxy never caches upstream failures as if they were valid', async () => {
  for (const status of [404, 429, 500]) {
    const restore = mockFetch(async () => new Response(JSON.stringify({ error: 'upstream' }), { status, headers: { 'Content-Type': 'application/json' } }));
    try {
      const response = await tmdbOnRequest(tmdbContext('/api/tmdb/movie/27205', { TMDB_API_KEY: 'k' }));
      assert.equal(response.status, status);
      assert.equal(response.headers.get('Cache-Control'), 'no-store');
    } finally {
      restore();
    }
  }
});

test('TMDB proxy surfaces a JSON 502 on network failure without leaking secrets', async () => {
  const restore = mockFetch(async () => { throw new TypeError('network down'); });
  try {
    const response = await tmdbOnRequest(tmdbContext('/api/tmdb/movie/27205', { TMDB_API_KEY: 'super-secret' }));
    assert.equal(response.status, 502);
    const text = await response.text();
    assert.match(text, /could not be reached/);
    assert.ok(!text.includes('super-secret'));
  } finally {
    restore();
  }
});

test('TMDB proxy only accepts GET', async () => {
  const response = await tmdbOnRequest(tmdbContext('/api/tmdb/movie/27205', { TMDB_API_KEY: 'k' }, 'POST'));
  assert.equal(response.status, 405);
});

test('/api middleware converts an SPA HTML fallback into a JSON 404', async () => {
  const response = await middleware({
    request: jsonRequest('/api/does-not-exist'),
    next: async () => new Response('<!doctype html><html><body>Rapiflix</body></html>', {
      status: 404,
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    })
  });
  assert.equal(response.status, 404);
  assert.equal(response.headers.get('Content-Type'), 'application/json; charset=utf-8');
  const body = await response.json();
  assert.match(body.error, /does not exist/);
});

test('/api middleware rejects a 200 HTML body from an API path', async () => {
  const response = await middleware({
    request: jsonRequest('/api/health/x'),
    next: async () => new Response('<!doctype html><html></html>', { status: 200, headers: { 'Content-Type': 'text/html' } })
  });
  assert.equal(response.status, 502);
  assert.match((await response.json()).error, /unexpected document/);
});

test('/api middleware leaves JSON responses untouched', async () => {
  const response = await middleware({
    request: jsonRequest('/api/health'),
    next: async () => new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' } })
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
});

test('streams.json declares exactly one approved VidCore provider', async () => {
  const streams = JSON.parse(await read('streams.json'));
  assert.equal(streams.embedProviders.length, 1);
  const [provider] = streams.embedProviders;
  assert.equal(provider.provider, 'VidCore');
  assert.equal(provider.authorized, true);
  assert.equal(provider.mode, 'iframe');
  assert.equal(provider.movieUrlTemplate, 'https://vidcore.org/embed/movie/{tmdb_id}');
  assert.equal(provider.tvUrlTemplate, 'https://vidcore.org/embed/tv/{tmdb_id}/{season}/{episode}');
  assert.equal(streams.movies && Object.keys(streams.movies).length, 0, 'no per-title overrides are configured');
});

test('the shell loads the shared player core before app.js', async () => {
  const html = await read('index.html');
  const coreIndex = html.indexOf('/player-core.js');
  const appIndex = html.indexOf('/app.js');
  assert.ok(coreIndex > 0, 'player-core.js must be loaded');
  assert.ok(appIndex > coreIndex, 'app.js must load after player-core.js');
  assert.match(html, /routes\.js/);
});

test('the frontend has exactly one embed URL construction path', async () => {
  const app = await read('app.js');
  assert.equal((app.match(/buildEmbedUrl\(/g) || []).length, 1);
  assert.equal((app.match(/vidcore\.org/g) || []).length, 0, 'provider origin must not be hard-coded in app.js');
  assert.equal((app.match(/replaceAll\('\{tmdb_id\}'/g) || []).length, 0);
});

test('watch rooms guard the iframe and never hard-code an internal URL', async () => {
  const app = await read('app.js');
  assert.match(app, /assertPlayerFrameUrl\(/);
  assert.match(app, /frame\.getAttribute\('src'\)/);
  assert.doesNotMatch(app, /src="\/watch\//);
  assert.doesNotMatch(app, /src="\/title\//);
  assert.doesNotMatch(app, /src="\/"/);
});
