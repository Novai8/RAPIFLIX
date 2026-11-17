# Rapiflix

Rapiflix is a cinematic movie, series and anime discovery site. The frontend is a small route-driven vanilla SPA (no framework, no bundler) served by Cloudflare Pages, with TMDB metadata proxied through Pages Functions.

## Structure

- `index.html` — the shell: header, boot loader, mobile sheet, search overlay, toast, `#app` mount.
- `styles.css` — one token-driven design system (dark/light themes, four accent palettes, motion, responsive layouts).
- `routes.js` — theme and palette persistence, boot sequence, sticky header, focus-trapped mobile sheet, search overlay with recent history and keyboard navigation, shortcuts.
- `providers.js` — provider registry: validates HTTPS sources, PeerTube embeds, per-title overrides, authorised VidCore templates and the iframe sandbox policy. HLS.js is fetched only when a source needs it.
- `app.js` — router and views (`/`, `/movies`, `/series`, `/anime`, `/new`, `/search`, `/title/:id`, `/watch/:id`), TMDB data layer with request caching/de-duplication, skeletons, error states and the watch room.
- `assistant.js` — the existing AI guide widget (unchanged contract).
- `mouse-interactions.js` — fine-pointer cursor ring, card tilt and magnetic primary buttons; disabled for touch and reduced motion.
- `functions/api/tmdb/[[path]].js` — allowlisted TMDB proxy; the key stays in a Pages secret.
- `functions/api/cinepro/[[path]].js` — optional CinePro source lookup proxy.
- `functions/api/health.js` — JSON health check.

## Data policy

There is no fabricated fallback catalogue. Every card, cast credit, season and episode comes from TMDB through `/api/tmdb/*`. If `TMDB_API_KEY` is not configured, the API returns `503` and the UI shows an explicit outage state instead of inventing titles.

## Development

UI work without TMDB credentials:

```bash
node tests/fixture-server.mjs   # http://127.0.0.1:4173 with deterministic fixtures
```

Full stack with Functions:

```bash
# .dev.vars: TMDB_API_KEY=...
npx wrangler pages dev .
```

Checks:

```bash
node --check app.js && node --check routes.js && node --check providers.js && node --check mouse-interactions.js
node --test tests/recovery-contract.test.mjs
```

## Playback policy

Playback only happens through sources the operator is authorised to embed:

- `peerTube` — self-hosted PeerTube instances (`enabled: false` by default, no instance configured).
- `movies[id]` — per-title HTTPS overrides (iframe, HLS or direct file).
- `embedProviders` — the authorised VidCore iframe templates for movies and TV episodes.

Sources are resolved in that order. Iframes are sandboxed with `allow-scripts allow-same-origin allow-forms allow-presentation`; popups and top-level navigation are not permitted. Rapiflix never injects advertising, opens popunders or fabricates a stream URL. When no source is configured, the watch room shows TMDB's official viewing options.

VidCore is cross-origin, so Rapiflix cannot inspect its playback state or anything rendered inside its frame; the watch room says so explicitly instead of claiming success. Metadata by TMDB does not grant playback rights.
