import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFile(path.join(root, file), 'utf8');

const [html, app, routes, providers, cursor, css, redirects, pageRoutes, streams, tmdb, cinepro, health, player] =
  await Promise.all([
    'index.html', 'app.js', 'routes.js', 'providers.js', 'mouse-interactions.js', 'styles.css',
    '_redirects', '_routes.json', 'streams.json',
    'functions/api/tmdb/[[path]].js', 'functions/api/cinepro/[[path]].js', 'functions/api/health.js',
    'player.html'
  ].map(read));

/* ---------- shell ---------- */

test('the cinematic shell mounts the app, boot loader, search dialog and palette control', () => {
  assert.match(html, /<main id="app" tabindex="-1">/);
  assert.match(html, /id="loader"/);
  assert.match(html, /id="loaderFill"/);
  assert.match(html, /id="loaderPercent"/);
  assert.match(html, /id="paletteToggle"/);
  assert.match(html, /id="themeToggle"/);
  assert.match(html, /id="searchOverlay"[\s\S]*hidden/);
  assert.match(html, /id="searchSuggestions"/);
  assert.match(html, /id="mobileNav"/);
  assert.match(html, /class="skip-link" href="#app"/);
  assert.match(html, /<noscript>/);
  assert.match(html, /data-build="rapiflix-cinematic-v1"/);
  assert.match(html, /styles\.css\?v=20261117-cinematic-v1/);
});

test('scripts load shell first, then providers, app, assistant and cursor', () => {
  const order = ['/routes.js', '/providers.js', '/app.js', '/assistant.js', '/mouse-interactions.js']
    .map((name) => html.indexOf(name));
  assert.ok(order.every((index) => index > -1), 'every script tag is present');
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  assert.match(html, /routes\.js\?v=20261117-shell-v1/);
  assert.match(html, /providers\.js\?v=20261117-providers-v1/);
  assert.match(html, /app\.js\?v=20261117-cinematic-v1/);
});

test('HLS is lazy-loaded instead of blocking the document', () => {
  assert.doesNotMatch(html, /hls(\.js|@)/i);
  assert.match(providers, /hls\.js@1\.6\.13/);
  assert.match(providers, /function loadHls\(\)/);
  assert.match(app, /await providers\.loadHls\(\)/);
});

/* ---------- routing / catalogue ---------- */

test('SPA understands home, listing, title, watch and search routes', () => {
  assert.match(app, /path\.startsWith\("\/title\/"\)/);
  assert.match(app, /path\.startsWith\("\/watch\/"\)/);
  assert.match(app, /path === "\/anime"/);
  assert.match(app, /function titleView\(/);
  assert.match(app, /function watchView\(/);
  assert.match(app, /function listingView\(/);
  assert.match(app, /function searchView\(/);
});

test('movie catalogue covers 1995 to the current date with pagination and sorting', () => {
  assert.match(app, /primary_release_date\.gte=1995-01-01&primary_release_date\.lte=/);
  assert.match(app, /const today = \(\) => new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/);
  assert.match(app, /discover\/movie\?\$\{range\}/);
  assert.match(app, /data-more/);
  assert.match(app, /sortMode|state\.sort/);
  assert.match(app, /vote_average\.desc/);
});

test('TV and anime catalogues use real TMDB discovery data', () => {
  assert.match(app, /discover\/tv\?sort_by=/);
  assert.match(app, /discover\/movie\?with_genres=16&with_original_language=ja/);
  assert.match(app, /tv\/\$\{encodeURIComponent\(id\)\}\/season\/\$\{encodeURIComponent\(season\)\}/);
  assert.match(tmdb, /\^tv\\\/\[1-9\]\[0-9\]\*\\\/season\\\/\[0-9\]\+\$/);
});

test('home page exposes curated rails that link to their listing pages', () => {
  assert.match(app, /reel\("trending"/);
  assert.match(app, /reel\("series"/);
  assert.match(app, /reel\("popular"/);
  assert.match(app, /reel\("anime"/);
  assert.match(app, /reel\("new"/);
  assert.match(app, /class="reel-track"/);
  assert.match(app, /data-rail="next"/);
});

/* ---------- title + watch ---------- */

test('title pages show finance, cast, trailer, save state and TV episode guide', () => {
  assert.match(app, /\["Budget", money\(media\.budget\)\], \["Box office", money\(media\.revenue\)\]/);
  assert.match(app, /class="cast-rail"/);
  assert.match(app, /class="cast-card"/);
  assert.match(app, /Watch trailer/);
  assert.doesNotMatch(app, /\.map\(esc\)\.join\(dot\)/);
  assert.match(app, /data-save="\$\{esc\(media\.id\)\}"/);
  assert.match(app, /aria-pressed="\$\{saved\}"/);
  assert.match(app, /id="seasonSelect"/);
  assert.match(app, /class="episode-list"/);
});

test('watch room resolves sources through the provider registry with an explicit fallback order', () => {
  assert.match(app, /providers\.sources\(state\.streams, watchMedia\)/);
  assert.match(providers, /push\(peerTube\(config\.peerTube, media\)\)/);
  assert.match(providers, /push\(vidCore\(config, media\)\)/);
  assert.match(providers, /const override = \(config\.movies \|\| \{\}\)\[media\.id\]/);
  assert.match(streams, /"authorized": true/);
  assert.match(streams, /"provider": "VidCore"/);
  assert.match(streams, /movieUrlTemplate/);
  assert.match(streams, /tvUrlTemplate/);
});

test('provider URLs are HTTPS-only and host-checked, and PeerTube ids are validated', () => {
  assert.match(providers, /url\.protocol === "https:" && !url\.username && !url\.password/);
  assert.match(providers, /host === "vidcore\.org" \|\| host\.endsWith\("\.vidcore\.org"\)/);
  assert.match(providers, /const VIDEO_ID = \/\^\[A-Za-z0-9-\]\{8,80\}\$\//);
  assert.match(providers, /peerTubeConfig\.enabled !== true/);
  assert.match(providers, /base\.pathname !== "\/"/);
});

test('player frames are sandboxed against popups and top-level navigation', () => {
  assert.match(providers, /IFRAME_SANDBOX = "allow-scripts allow-same-origin allow-forms allow-presentation"/);
  assert.match(app, /sandbox="\$\{esc\(providers\.IFRAME_SANDBOX\)\}"/);
  assert.doesNotMatch(providers, /allow-popups/);
  assert.doesNotMatch(providers, /allow-top-navigation/);
  assert.doesNotMatch(app, /referrerpolicy="no-referrer"/);
  assert.match(app, /No injected ads\. No forced redirects\./);
});

test('watch room states playback honestly and always offers official links', () => {
  assert.match(app, /Rapiflix cannot verify the provider's playback state/);
  assert.match(app, /The provider did not finish loading\. Reload the stream or use official options\./);
  assert.match(app, /if \(settled \|\| !frame\.isConnected\) return;/);
  assert.match(app, /Official viewing options/);
  assert.match(providers, /https:\/\/www\.themoviedb\.org\/\$\{kind\}\/\$\{encodeURIComponent\(String\(media\?\.id \?\? ""\)\)\}\/watch/);
  assert.match(app, /rel="noopener noreferrer"/);
  assert.match(app, /No authorised playback source is configured for this title/);
});

test('TV watch rooms expose season, episode and neighbour navigation', () => {
  assert.match(app, /function setupSeasonBrowser\(/);
  assert.match(app, /data-series-id="\$\{esc\(media\.id\)\}"/);
  assert.match(app, /type=tv&season=\$\{esc\(season\)\}&episode=\$\{esc\(episode\.number\)\}/);
  assert.match(app, /function setupEpisodeNav\(/);
  assert.match(app, /Next episode/);
  assert.match(app, /Previous episode/);
});

/* ---------- search ---------- */

test('search overlay queries TMDB multi-search with keyboard navigation', () => {
  assert.match(routes, /\/api\/tmdb\/search\/multi\?query=/);
  assert.match(routes, /function paintResults\(list, query\)/);
  assert.match(routes, /function paintRecent\(\)/);
  assert.match(routes, /ArrowDown/);
  assert.match(routes, /ArrowUp/);
  assert.match(routes, /activeIndex/);
  assert.match(routes, /rapiflix-recent/);
  assert.match(css, /\.search-results/);
  assert.match(css, /\.search-result\.is-active/);
});

test('the /search route renders a full TMDB result page', () => {
  assert.match(app, /async function searchCatalog\(/);
  assert.match(app, /search\/multi\?query=/);
  assert.match(app, /function searchView\(/);
  assert.match(redirects, /^\/search \/ 200$/m);
});

/* ---------- shell behaviour ---------- */

test('theme and accent palette persist and the four palettes are token-driven', () => {
  assert.match(routes, /const PALETTES = \["lime", "coral", "cyan", "violet"\]/);
  assert.match(routes, /write\("rapiflix-palette", next\)/);
  assert.match(routes, /write\("rapiflix-theme", next\)/);
  assert.match(routes, /document\.documentElement\.dataset\.theme/);
  assert.match(css, /:root\[data-palette=coral\]/);
  assert.match(css, /:root\[data-palette=cyan\]/);
  assert.match(css, /:root\[data-palette=violet\]/);
  assert.match(css, /html\[data-theme=light\]\{/);
  assert.match(html, /<html lang="en" data-theme="dark" data-palette="lime">/);
});

test('search dialog and mobile sheet are accessible modal dialogs', () => {
  assert.match(html, /id="searchOverlay" role="dialog" aria-modal="true"/);
  assert.match(html, /id="mobileNav" role="dialog" aria-modal="true"/);
  assert.match(routes, /function trap\(event, root\)/);
  assert.match(routes, /if \(event\.key === "Escape"\)/);
  assert.match(routes, /aria-expanded/);
  assert.match(routes, /restore.*focus|focus\(\{ preventScroll: true \}\)/s);
});

test('the custom cursor is opt-in for fine pointers and removed for touch or reduced motion', () => {
  assert.match(cursor, /\(hover: hover\) and \(pointer: fine\)/);
  assert.match(cursor, /prefers-reduced-motion: reduce/);
  assert.match(cursor, /body\.classList\.add\("has-custom-cursor"\)/);
  assert.match(cursor, /function stop\(\)/);
  assert.match(cursor, /addEventListener\?\.\("change", sync\)/);
  assert.match(css, /\.cursor-ring\.is-active/);
  assert.match(css, /body\.has-custom-cursor input,body\.has-custom-cursor textarea,body\.has-custom-cursor select\{cursor:auto\}/);
});

test('cards tilt and primary buttons magnetise through CSS variables', () => {
  assert.match(cursor, /function tiltCard\(event\)/);
  assert.match(cursor, /event\.target\.closest\(TILT\)/);
  assert.match(cursor, /setProperty\("--rx"/);
  assert.match(cursor, /setProperty\("--ry"/);
  assert.match(css, /rotateX\(var\(--rx,0deg\)\) rotateY\(var\(--ry,0deg\)\)/);
  assert.match(css, /\.card:hover \.card-frame\{--lift:-5px/);
  assert.match(cursor, /MAGNETIC = "\.btn-accent,\.rail-btn"/);
});

/* ---------- responsive + design ---------- */

test('layout adapts from phone to desktop with a horizontal reel and poster grid', () => {
  assert.match(css, /\.reel-track\{[\s\S]*scroll-snap-type:x mandatory/);
  assert.match(css, /grid-auto-columns:clamp\(148px,16\.5vw,208px\)/);
  assert.match(css, /\.grid\{[\s\S]*auto-fill/);
  assert.match(css, /@media\(min-width:900px\)\{\.grid/);
  assert.match(css, /@media\(max-width:1180px\)/);
  assert.match(css, /@media\(max-width:1000px\)/);
  assert.match(css, /@media\(max-width:860px\)/);
  assert.match(css, /@media\(max-width:680px\)/);
  assert.match(css, /\.reel-track\{grid-auto-columns:40vw/);
});

test('motion respects reduced-motion and skeleton loading states exist', () => {
  assert.match(css, /prefers-reduced-motion/);
  assert.match(routes, /prefers-reduced-motion: reduce/);
  assert.match(css, /\.sk-line/);
  assert.match(css, /\.sk-poster/);
  assert.match(app, /class="sk/);
});

test('light theme overrides every surface the dark theme defines', () => {
  assert.match(css, /html\[data-theme=light\]\{[\s\S]*--surface/);
  assert.match(css, /html\[data-theme=light\] \.watch-aside/);
  assert.match(css, /html\[data-theme=light\] \.site-header/);
  assert.match(css, /html\[data-theme=light\] \.episodes/);
});

/* ---------- backend ---------- */

test('TMDB proxy stays allowlisted and injects the key server-side only', () => {
  assert.match(tmdb, /const ALLOWED = \[/);
  assert.match(tmdb, /Only GET requests are supported/);
  assert.match(tmdb, /upstream\.searchParams\.set\("api_key", env\.TMDB_API_KEY\)/);
  assert.match(tmdb, /if \(!env\.TMDB_API_KEY\)/);
  assert.doesNotMatch(app, /api_key/);
  assert.doesNotMatch(routes, /api_key/);
});

test('CinePro proxy only allows movie and episode lookups on HTTPS bases', () => {
  assert.match(cinepro, /const ALLOWED_PATHS = \[/);
  assert.match(cinepro, /\^v1\\\/movies\\\/\[1-9\]/);
  assert.match(cinepro, /if \(url\.protocol !== "https:" && !\(localHost/);
  assert.match(cinepro, /return jsonResponse\(\{ error: "This CinePro endpoint is not available through Rapiflix\." \}, 404\)/);
});

test('health endpoint and Pages route filter stay JSON/API-scoped', () => {
  assert.match(health, /service: "rapiflix-api"/);
  assert.match(health, /Content-Type/);
  assert.match(pageRoutes, /"include": \["\/api\/tmdb\/\*", "\/api\/cinepro\/\*", "\/api\/health"/);
});

test('SPA rewrites cover listing, title and watch routes', () => {
  assert.match(redirects, /^\/movies \/ 200$/m);
  assert.match(redirects, /^\/title\/\* \/ 200$/m);
  assert.match(redirects, /^\/watch\/\* \/ 200$/m);
});

/* ---------- standalone player + no ad injection ---------- */

test('standalone player is sandboxed and branded', () => {
  assert.match(player, /aspect-ratio: 16 \/ 9/);
  assert.match(player, /RAPIFLIX — Loading Stream\.\.\./);
  assert.match(player, /sandbox="allow-scripts allow-same-origin allow-forms allow-presentation"/);
  assert.doesNotMatch(player, /allow-popups/);
});

test('Rapiflix never injects ads or popunders of its own', () => {
  for (const source of [html, app, routes, providers]) {
    assert.doesNotMatch(source, /adsbygoogle|googlesyndication|popunder|popads|propellerads/i);
  }
  assert.doesNotMatch(app, /window\.open\(/);
});
