# VidCore playback audit

Checked 2026-10-21.

- `https://vidcore.org/embed/movie/533535` returned HTTP 200.
- Fallback movie IDs `27205`, `157336`, `438631`, `569094`, `414906`, `329865`, `238`, and `666277` returned HTTP 200 from the VidCore movie endpoint.
- `https://vidcore.org/embed/tv/1399/1/1` returned HTTP 200.
- `https://vidcore.org/embed/series/1399/1/1` returned HTTP 404, so RAPIFLIX keeps the `/embed/tv/{id}/{season}/{episode}` template.
- The public API documentation is https://www.vidcore.org/movie-embed-api.
- `streams.json` currently has no per-movie overrides, so provider fallback is used.
- A playback bug was found in source selection: array-valued `streams.movies[id]` entries were treated as the source object instead of selecting a valid source from the array.
