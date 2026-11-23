# Rapiflix streaming architecture

Updated 2026-11-23 for branch `fix/rapiflix-streaming-reliability`.

## Playback flow

```
poster / search result
        │  /title/:id?type=movie|tv
        ▼
titleData()  ── TMDB detail + credits + videos + providers
        │      (works for any numeric TMDB id, catalogue membership is not required)
        ▼
/watch/:id?type=…&season=…&episode=…
        │
        ├─ normalizeTmdbId()        reject IMDb ids, 0, decimals, junk
        ├─ normalizeInteger()       season 0–999, episode 1–99999
        ▼
resolvePlayback()
        ├─ PeerTube per-title mapping (when configured)
        ├─ streams.json movies[] entry (validated iframe only)
        └─ providerEmbed()          the only VidCore URL builder
                │  buildEmbedUrl()  approved origin + template + params
                │  assertPlayerFrameUrl()  blocks Rapiflix recursion
                ▼
        <iframe sandbox="allow-scripts allow-same-origin allow-forms allow-presentation">
        │
        ├─ load   → embed_loaded
        ├─ postMessage vidcore:play (origin + source verified) → playing
        ├─ no playback event after timeout → unverified (never an error)
        └─ document never loads → timeout (dismiss + retry)
```

## Layers

| Layer | File | Responsibility |
|---|---|---|
| Provider core | `player-core.js` | URL builder, id/param validation, error classification, state machine, trusted-message checks, diagnostics |
| App shell | `app.js` | routing, TMDB metadata, watch room rendering, player lifecycle, run tokens |
| API guard | `functions/api/_middleware.js` | every `/api/*` path answers JSON, never the SPA |
| API catch-all | `functions/api/[[path]].js` | unmatched `/api/*` paths return a no-store JSON 404 |
| TMDB proxy | `functions/api/tmdb/[[path]].js` | allowlisted metadata, server-side key, safe caching |

## Provider facts verified in this audit

- Domain: `https://vidcore.org` (the only approved origin).
- Movie embed: `/embed/movie/{tmdb_id}`.
- TV embed: `/embed/tv/{tmdb_id}/{season}/{episode}`.
- VidCore renders an inner `https://vidspark.to/...` player.
- VidCore returns **HTTP 200 for unknown ids too**, so status codes cannot
  prove availability.
- VidCore does **not** emit `vidcore:play` / `vidcore:pause` / `vidcore:ended`
  postMessage events to the parent page. Rapiflix therefore listens for them
  defensively (origin + source checked) but treats the loaded player as
  `unverified`, never as a confirmed stream.

## Regression guarantees

- A player iframe can never point at Rapiflix (guard is enforced in the URL
  builder, in source resolution and again before mount).
- Only one player instance exists at a time.
- Switching title, season or episode disposes the previous player and its
  timers/listeners.
- A failed TMDB response can never be cached as metadata and can never erase a
  previously resolved title.
- The app shell paints from the bundled fallback catalogue before catalogue
  requests settle, so a stalled metadata API cannot leave `#app` empty.
