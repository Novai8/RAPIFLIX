import test from 'node:test';
import assert from 'node:assert/strict';
import core from '../player-core.js';

const MOVIE = 'https://vidcore.org/embed/movie/{tmdb_id}';
const TV = 'https://vidcore.org/embed/tv/{tmdb_id}/{season}/{episode}';

test('movie embed URL is built from a valid numeric TMDB id', () => {
  const result = core.buildEmbedUrl({ mediaType: 'movie', tmdbId: 27205, template: MOVIE });
  assert.equal(result.ok, true);
  assert.equal(result.url, 'https://vidcore.org/embed/movie/27205');
  assert.equal(result.origin, 'https://vidcore.org');
});

test('TMDB ids are normalised from safe numeric strings', () => {
  assert.equal(core.normalizeTmdbId('533535'), 533535);
  assert.equal(core.normalizeTmdbId(533535), 533535);
  assert.equal(core.normalizeTmdbId(' 533535 '), 533535);
});

test('IMDb ids, zero, negatives, decimals and junk are rejected', () => {
  for (const value of ['tt1375666', 0, -1, 1.5, '', null, undefined, 'abc', '1e5', true, {}]) {
    assert.equal(core.normalizeTmdbId(value), null, `expected reject for ${String(value)}`);
  }
});

test('TV embed URL requires and uses season and episode', () => {
  const result = core.buildEmbedUrl({ mediaType: 'tv', tmdbId: 1399, season: 2, episode: 9, template: TV });
  assert.equal(result.ok, true);
  assert.equal(result.url, 'https://vidcore.org/embed/tv/1399/2/9');
});

test('TV playback without a season or episode is rejected', () => {
  assert.equal(core.buildEmbedUrl({ mediaType: 'tv', tmdbId: 1399, episode: 1, template: TV }).code, 'missing_tv_context');
  assert.equal(core.buildEmbedUrl({ mediaType: 'tv', tmdbId: 1399, season: 1, template: TV }).code, 'missing_tv_context');
});

test('season 0 is valid for specials but episode 0 is not', () => {
  assert.equal(core.buildEmbedUrl({ mediaType: 'tv', tmdbId: 1399, season: 0, episode: 1, template: TV }).ok, true);
  assert.equal(core.buildEmbedUrl({ mediaType: 'tv', tmdbId: 1399, season: 1, episode: 0, template: TV }).code, 'invalid_episode');
});

test('media type is validated and movie/TV templates cannot be crossed', () => {
  assert.equal(core.buildEmbedUrl({ mediaType: 'anime', tmdbId: 1, template: MOVIE }).code, 'invalid_media_type');
  assert.equal(core.buildEmbedUrl({ mediaType: 'movie', tmdbId: 1, template: TV }).code, 'media_type_mismatch');
  assert.equal(core.buildEmbedUrl({ mediaType: 'tv', tmdbId: 1, season: 1, episode: 1, template: MOVIE }).code, 'media_type_mismatch');
});

test('unapproved, insecure and self-referential templates are rejected', () => {
  assert.equal(core.buildEmbedUrl({ mediaType: 'movie', tmdbId: 1, template: 'https://evil.example/embed/movie/{tmdb_id}' }).code, 'provider_not_approved');
  assert.equal(core.buildEmbedUrl({ mediaType: 'movie', tmdbId: 1, template: 'http://vidcore.org/embed/movie/{tmdb_id}' }).code, 'provider_not_approved');
  assert.equal(core.buildEmbedUrl({ mediaType: 'movie', tmdbId: 1, template: 'https://rapiflix.online/watch/{tmdb_id}' }).code, 'provider_not_approved');
  assert.equal(core.buildEmbedUrl({ mediaType: 'movie', tmdbId: 1, template: 'https://vidcore.org/watch/{tmdb_id}' }).code, 'invalid_provider_template');
});

test('templates with unresolved placeholders are rejected', () => {
  assert.equal(core.buildEmbedUrl({ mediaType: 'movie', tmdbId: 1, template: 'https://vidcore.org/embed/movie/{tmdb_id}?lang={language}' }).code, 'invalid_provider_template');
});

test('frame URL guard blocks Rapiflix recursion and unapproved origins', () => {
  assert.equal(core.assertPlayerFrameUrl('https://rapiflix.online/watch/27205').reason, 'recursive_rapiflix_embed');
  assert.equal(core.assertPlayerFrameUrl('https://www.rapiflix.online/title/1').reason, 'recursive_rapiflix_embed');
  assert.equal(core.assertPlayerFrameUrl('https://rapiflix.hussnaintariq-ai.workers.dev/watch/1').reason, 'recursive_rapiflix_embed');
  assert.equal(core.assertPlayerFrameUrl('https://evil.example/embed/movie/1').reason, 'provider_not_approved');
  assert.equal(core.assertPlayerFrameUrl('about:blank').ok, false);
  assert.equal(core.assertPlayerFrameUrl('https://vidcore.org/embed/movie/27205').ok, true);
});

test('provider HTTP status classifies into actionable categories', () => {
  assert.deepEqual(core.classifyStatus(404).category, 'not_found');
  assert.equal(core.classifyStatus(404).retryable, false);
  assert.equal(core.classifyStatus(429, { get: () => '12' }).category, 'rate_limited');
  assert.equal(core.classifyStatus(429, { get: () => '12' }).retryAfterMs, 12000);
  assert.equal(core.classifyStatus(500).category, 'server_error');
  assert.equal(core.classifyStatus(503).retryable, true);
  assert.equal(core.classifyStatus(403).category, 'forbidden');
  assert.equal(core.classifyStatus(400).category, 'client_error');
  assert.equal(core.classifyStatus(0).category, 'network_error');
});

test('network and abort failures are classified without leaking request data', () => {
  assert.equal(core.classifyFetchError({ name: 'TypeError' }).category, 'network_error');
  assert.equal(core.classifyFetchError({ name: 'AbortError' }).category, 'timeout');
});

test('retry policy backs off, respects Retry-After and has a hard cap', () => {
  assert.equal(core.retryDelayMs(1, { baseMs: 500, random: () => 0 }), 500);
  assert.equal(core.retryDelayMs(2, { baseMs: 500, random: () => 0 }), 1000);
  assert.equal(core.retryDelayMs(3, { baseMs: 1000, maxMs: 1500, random: () => 0 }), 1500);
  assert.equal(core.retryDelayMs(1, { baseMs: 500, retryAfterMs: 9000, random: () => 0 }), 9000);
  assert.equal(core.canRetry(0, 2), true);
  assert.equal(core.canRetry(1, 2), true);
  assert.equal(core.canRetry(2, 2), false);
});

function machine(options = {}) {
  let now = 0;
  const timers = [];
  const transitions = [];
  const instance = core.createPlaybackMachine({
    timeoutMs: 1000,
    playbackWaitMs: 500,
    setTimer: (fn, ms) => { const t = { fn, ms, cancelled: false }; timers.push(t); return t; },
    clearTimer: (t) => { if (t) t.cancelled = true; },
    now: () => now,
    onTransition: (event) => transitions.push(event.next),
    ...options
  });
  return {
    instance,
    transitions,
    fire(ms) {
      const pending = timers.filter(t => !t.cancelled && t.ms === ms);
      const last = pending[pending.length - 1];
      assert.ok(last, `expected a pending ${ms}ms timer`);
      last.cancelled = true;
      last.fn();
    },
    pending(ms) { return timers.filter(t => !t.cancelled && t.ms === ms).length; }
  };
}

test('state machine follows the documented loading path', () => {
  const h = machine();
  const token = h.instance.begin();
  assert.equal(h.instance.state(), 'validating');
  h.instance.iframeLoading(token);
  assert.equal(h.instance.state(), 'iframe_loading');
  h.instance.iframeLoaded(token);
  assert.equal(h.instance.state(), 'embed_loaded');
  h.instance.play(token);
  assert.equal(h.instance.state(), 'playing');
  assert.deepEqual(h.transitions, ['preparing', 'validating', 'iframe_loading', 'embed_loaded', 'playing']);
});

test('timeout fires when the iframe never loads', () => {
  const h = machine();
  const token = h.instance.begin();
  h.instance.iframeLoading(token);
  h.fire(1000);
  assert.equal(h.instance.state(), 'timeout');
});

test('a loaded iframe with no playback event becomes unverified, not an error', () => {
  const h = machine();
  const token = h.instance.begin();
  h.instance.iframeLoaded(token);
  assert.equal(h.instance.state(), 'embed_loaded');
  h.fire(500);
  assert.equal(h.instance.state(), 'unverified');
});

test('an iframe load alone never counts as playback', () => {
  const h = machine();
  const token = h.instance.begin();
  h.instance.iframeLoaded(token);
  assert.notEqual(h.instance.state(), 'playing');
});

test('a real play event clears pending timers', () => {
  const h = machine();
  const token = h.instance.begin();
  h.instance.iframeLoaded(token);
  h.instance.play(token);
  assert.equal(h.pending(500), 0);
  assert.equal(h.instance.state(), 'playing');
});

test('a late real play event still upgrades an unverified player', () => {
  const h = machine();
  const token = h.instance.begin();
  h.instance.iframeLoaded(token);
  h.fire(500);
  assert.equal(h.instance.state(), 'unverified');
  assert.equal(h.instance.play(token), true);
  assert.equal(h.instance.state(), 'playing');
});

test('a stale token cannot update the active player', () => {
  const h = machine();
  const first = h.instance.begin();
  const second = h.instance.begin();
  assert.equal(h.instance.iframeLoaded(first), false);
  assert.equal(h.instance.play(first), false);
  assert.equal(h.instance.iframeLoaded(second), true);
  assert.equal(h.instance.state(), 'embed_loaded');
});

test('errors transition to provider_error or unavailable by retryability', () => {
  const h = machine();
  const token = h.instance.begin();
  h.instance.fail(token, 'server_error', { retryable: true });
  assert.equal(h.instance.state(), 'provider_error');
  const h2 = machine();
  const t2 = h2.instance.begin();
  h2.instance.fail(t2, 'not_found', { retryable: false });
  assert.equal(h2.instance.state(), 'unavailable');
});

test('dispose prevents late events from any in-flight transition', () => {
  const h = machine();
  const token = h.instance.begin();
  h.instance.dispose();
  assert.equal(h.instance.iframeLoaded(token), false);
  assert.equal(h.instance.play(token), false);
  assert.equal(h.instance.state(), 'idle');
});

test('player messages must match origin and source window', () => {
  const frameWindow = { id: 'frame' };
  const expected = { origin: 'https://vidcore.org', source: frameWindow };
  assert.equal(core.isTrustedProviderMessage({ origin: 'https://vidcore.org', source: frameWindow, data: { event: 'vidcore:play' } }, expected), true);
  assert.equal(core.isTrustedProviderMessage({ origin: 'https://evil.example', source: frameWindow, data: { event: 'vidcore:play' } }, expected), false);
  assert.equal(core.isTrustedProviderMessage({ origin: 'https://vidcore.org', source: { id: 'other' }, data: { event: 'vidcore:play' } }, expected), false);
  assert.equal(core.isTrustedProviderMessage({ origin: 'https://vidcore.org', source: frameWindow, data: 'vidcore:play' }, expected), false);
  assert.equal(core.isTrustedProviderMessage({ origin: 'https://vidcore.org', source: frameWindow, data: { event: 'vidcore:play' } }, null), false);
});

test('provider event parsing only accepts documented names', () => {
  assert.equal(core.parseProviderEvent({ event: 'vidcore:play' }), 'play');
  assert.equal(core.parseProviderEvent({ event: 'vidcore:pause' }), 'pause');
  assert.equal(core.parseProviderEvent({ event: 'vidcore:ended' }), 'ended');
  assert.equal(core.parseProviderEvent({ event: 'vidcore:unknown' }), null);
  assert.equal(core.parseProviderEvent({ type: 'vidcore:play' }), 'play');
  assert.equal(core.parseProviderEvent('vidcore:play'), null);
});

test('diagnostics redact secret-bearing keys', () => {
  const diag = core.createDiagnostics({ enabled: true });
  diag.log('playback_requested', { tmdbId: 27205, apiKey: 'secret', authorization: 'Bearer x', provider: 'VidCore' });
  const [entry] = diag.entries();
  assert.equal(entry.tmdbId, 27205);
  assert.equal(entry.provider, 'VidCore');
  assert.equal('apiKey' in entry, false);
  assert.equal('authorization' in entry, false);
  const disabled = core.createDiagnostics({ enabled: false });
  disabled.log('x', { a: 1 });
  assert.equal(disabled.entries().length, 0);
});
