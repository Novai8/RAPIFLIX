# Rapiflix

Rapiflix is a cinematic movie-discovery website for films, series and anime. This repository now uses a small route-driven vanilla frontend with no ad injection and a rights-aware playback policy.

## What changed

- Replaced the previous modal-first catalogue with a new animated shell.
- Added animated poster/backdrop gradients, ambient image movement, a custom pointer, and a detailed loading sequence.
- Added URL-addressable title rooms at `/title/:id` with overview, rating, runtime, budget, box office, cast, trailer link and related viewing actions.
- Added dedicated watch rooms at `/watch/:id` with a responsive VidCore iframe stage for authorized movie and TV playback.
- Added keyboard-friendly search, theme switching, saved titles, responsive navigation and mobile layouts.
- Kept the Cloudflare TMDB/CinePro proxy contracts and restored the authorized VidCore provider templates in `streams.json`.

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

Playback uses the authorized VidCore iframe templates in `streams.json` for movies and TV episodes. Additional sources may be added only when you are authorized to embed or stream them. Supported source types are direct video URLs, HLS (`type: "hls"`) and authorized iframe embeds (`mode: "iframe"`). Rapiflix does not inject its own advertising, trigger popup windows, or open a second tab when the user presses Play.

Because VidCore is cross-origin, Rapiflix cannot inspect, remove, or guarantee the absence of advertising or popup behavior generated inside VidCore's own iframe. That provider-controlled behavior must be disabled or covered by the VidCore authorization/configuration itself.

TMDB provides metadata and watch-provider information; it does not grant movie playback rights. Rapiflix does not insert advertising into its own interface or player.
