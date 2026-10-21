# VidCore playback audit

Code-level audit updated 2026-10-22.

## Playback routing findings

- `streams.json` has one authorized global VidCore iframe provider and no per-movie overrides. The frontend therefore generates a VidCore URL from each title's TMDB ID.
- The watch page now prefers a per-title source only when its URL is on `vidcore.org` or a VidCore subdomain. Otherwise it uses the configured global VidCore template first, then falls back to a valid HTTPS per-title source only if VidCore is not configured.
- Per-title source arrays are searched for a usable HTTPS URL instead of assuming the entry is a single object.
- TV playback continues to use `/embed/tv/{tmdb_id}/{season}/{episode}`; the previous audit found the `/embed/series/` route returned 404.
- HLS.js is now loaded for authorized HLS fallback sources in browsers that do not support HLS natively.

## Provider endpoint smoke checks recorded in the previous audit

These checks were recorded on 2026-10-21; they were not re-run by this code-only change.

- `https://vidcore.org/embed/movie/533535` returned HTTP 200.
- Fallback movie IDs `27205`, `157336`, `438631`, `569094`, `414906`, `329865`, `238`, and `666277` returned HTTP 200 from the VidCore movie endpoint.
- `https://vidcore.org/embed/tv/1399/1/1` returned HTTP 200.
- `https://vidcore.org/embed/series/1399/1/1` returned HTTP 404.

## Limits

A successful iframe HTTP response does not prove that the selected title has a playable stream. VidCore is cross-origin, so the Rapiflix page cannot reliably inspect the provider's internal playback state or determine whether every dynamic TMDB title is available. This audit confirms the routing/configuration path, not universal title availability. Unavailable titles should fall back to the official TMDB watch-options page rather than be represented as verified streams.
