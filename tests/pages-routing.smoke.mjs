/*
 * Real Cloudflare Pages routing smoke test.
 *
 * Starts `wrangler pages dev` and checks the routing contract over HTTP, so
 * this covers _routes.json, middleware precedence and the /api catch-all in
 * the same runtime Cloudflare Pages uses instead of a mocked Node server.
 */
import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = Number(process.env.RAPIFLIX_PAGES_PORT || 8791);
const BASE = `http://127.0.0.1:${PORT}`;
const wranglerArgs = [
  '--yes', 'wrangler', 'pages', 'dev', '.',
  '--port', String(PORT),
  '--binding', 'TMDB_API_KEY=smoke-test-key',
  '--compatibility-date', '2026-11-23',
  '--show-interactive-dev-session=false',
  '--log-level', 'warn'
];

const isWindows = process.platform === 'win32';
const server = isWindows
  ? spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', ['npx', ...wranglerArgs].join(' ')], {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  })
  : spawn('npx', wranglerArgs, {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    detached: true
  });

let serverOutput = '';
server.stdout.on('data', (chunk) => { serverOutput += chunk; });
server.stderr.on('data', (chunk) => { serverOutput += chunk; });

async function waitForServer() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await fetch(`${BASE}/api/health`);
      if (response.ok) return;
    } catch {}
    await sleep(500);
  }
  throw new Error(`wrangler pages dev did not start\n${serverOutput.slice(-2000)}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function expectRoute(path, init, expected) {
  const response = await fetch(`${BASE}${path}`, init);
  const contentType = response.headers.get('content-type') || '';
  const cacheControl = response.headers.get('cache-control') || '';
  const text = await response.text();
  assert(response.status === expected.status, `${path}: expected ${expected.status}, got ${response.status}`);
  assert(contentType.includes(expected.contentType), `${path}: unexpected Content-Type ${contentType}`);
  if (expected.cacheControl) assert(cacheControl === expected.cacheControl, `${path}: unexpected Cache-Control ${cacheControl}`);
  if (expected.bodyIncludes) assert(text.includes(expected.bodyIncludes), `${path}: body missing ${expected.bodyIncludes}`);
  if (expected.notHtml) assert(!/<html/i.test(text), `${path}: returned SPA HTML`);
  console.log(`ok ${init?.method || 'GET'} ${path} -> ${response.status} ${contentType}`);
}

try {
  await waitForServer();

  await expectRoute('/api/nope', undefined, {
    status: 404,
    contentType: 'application/json',
    cacheControl: 'no-store',
    bodyIncludes: 'This Rapiflix API route does not exist.',
    notHtml: true
  });
  await expectRoute('/api/nope', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }, {
    status: 404,
    contentType: 'application/json',
    cacheControl: 'no-store',
    notHtml: true
  });
  await expectRoute('/api/tmdb/invalid', undefined, {
    status: 404,
    contentType: 'application/json',
    cacheControl: 'no-store',
    bodyIncludes: 'TMDB endpoint is not available',
    notHtml: true
  });
  await expectRoute('/api/health', undefined, {
    status: 200,
    contentType: 'application/json',
    cacheControl: 'no-store',
    bodyIncludes: 'rapiflix-api'
  });
  await expectRoute('/api/assistant-chat', undefined, {
    status: 200,
    contentType: 'application/json',
    cacheControl: 'no-store',
    bodyIncludes: 'assistant-chat'
  });
  // Supported POST path without AI credentials must be a JSON configuration
  // error, never the SPA shell or a routing 404.
  await expectRoute('/api/assistant-chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'Hello' }] })
  }, {
    status: 503,
    contentType: 'application/json',
    bodyIncludes: 'not configured',
    notHtml: true
  });
  await expectRoute('/', undefined, {
    status: 200,
    contentType: 'text/html',
    bodyIncludes: 'id="app"'
  });
  await expectRoute('/app.js', undefined, {
    status: 200,
    contentType: 'javascript',
    bodyIncludes: 'RapiflixPlayer'
  });
  await expectRoute('/styles.css', undefined, {
    status: 200,
    contentType: 'text/css',
    bodyIncludes: '--bg'
  });

  console.log('PAGES_ROUTING_OK');
} finally {
  if (isWindows && server.pid) {
    spawnSync('taskkill', ['/pid', String(server.pid), '/t', '/f'], { stdio: 'ignore', windowsHide: true });
  } else if (server.pid) {
    try {
      process.kill(-server.pid, 'SIGTERM');
    } catch {
      server.kill();
    }
  } else {
    server.kill();
  }
}
