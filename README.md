# Rapiflix

Rapiflix is a cinematic movie-discovery website for films, series and anime. This repository now uses a small route-driven vanilla frontend with no ad injection and a rights-aware playback policy.

## What changed

- Replaced the previous modal-first catalogue with a new animated shell.
- Added animated poster/backdrop gradients, ambient image movement, a custom pointer, and a detailed loading sequence.
- Added URL-addressable title rooms at `/title/:id` with overview, rating, runtime, budget, box office, cast, trailer link and related viewing actions.
- Added dedicated watch rooms at `/watch/:id` with a responsive video/iframe stage and official viewing fallback when no authorized source is configured.
- Added keyboard-friendly search, theme switching, saved titles, responsive navigation and mobile layouts.
- Kept the Cloudflare TMDB/CinePro proxy contracts and made the default `streams.json` empty so metadata is never mistaken for a lawful stream.

## Routes

- `/` — cinematic home and trending rail
- `/movies` — feature catalogue
- `/series` — series catalogue
- `/anime` — animated catalogue
- `/search?q=...` — local catalogue search
- `/title/:id` — complete title page
- `/watch/:id` — responsive watch room

## Development

The site works without a TMDB key by using a local fallback catalogue. When deployed with `TMDB_API_KEY`, the frontend enriches the catalogue and title rooms through `/api/tmdb/*`.

```bash
python3 -m http.server 8000
```

For Cloudflare Pages Functions locally, use Wrangler with a `.dev.vars` file containing `TMDB_API_KEY` and run `npx wrangler pages dev .`.

## Authorized playback

Add only sources you are authorized to embed or stream to `streams.json`. Supported source types are direct video URLs, HLS (`type: "hls"`) and authorized iframe embeds (`mode: "iframe"`). If no source exists, Rapiflix shows an official TMDB watch-options link instead of pretending a catalogue title is a free stream.

TMDB provides metadata and watch-provider information; it does not grant movie playback rights. Rapiflix does not insert advertising into its own interface or player.
