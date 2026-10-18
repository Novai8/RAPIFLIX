# Rapiflix redesign v2 review notes

## Scope
This branch replaces the old Rapiflix page shell and stylesheet with a route-aware cinematic interface. It intentionally retains the mixed catalog/player runtime because the existing `app.js` owns TMDB discovery, the Internet Archive rights-screening and file resolver, watch progress, HLS playback, subtitle/audio/quality controls, provider lookup, and the existing details/player overlays. Rewriting that entire file at the same time would make it harder to verify that playback still works.

## Removed or replaced
| Path | Change | Reason |
|---|---|---|
| `rapiflix/index.html` | Replaced the previous visual page structure, nav, hero, catalog layout and modal shell; migrated the existing project and TMDB/Internet Archive attribution text into the new layout. | New route-aware product design and accessible title/player overlays. |
| `rapiflix/styles.css` | Replaced the old Space Grotesk / static dark-red design system, noise layer, old hero composition and old page animation styling. | Implement new Unbounded/DM Sans design tokens, animated hue engine, light/dark themes, blobs, mouse glow, responsive catalog and motion. |
| `rapiflix/routes.js` | Added. | Real path handling, search URLs, hue recoloring, loading curtain, theme persistence, cursor and title deep-link support. |
| `rapiflix/_redirects` | Added. | Cloudflare Pages rewrites for client-rendered paths. |
| `rapiflix/functions/api/tmdb/[[path]].js` | Extended allowlist and query parameters. | Required TV, discover and multi-search endpoints; existing secret-backed API proxy is retained. |

## Intentionally kept
| Path | Why |
|---|---|
| `rapiflix/app.js` | Contains shared catalog mapping, rights-screened Archive file resolution, playback progress, HLS.js integration, source/provider validation, title details, watch-provider lookup and player controls. It also still contains some rendering glue and should be split into modules in a later focused refactor. |
| `rapiflix/streams.json` | Runtime stream manifest schema remains available. A provider's `authorized: true` value is an operator attestation, not independent proof of rights. Only configure sources you are authorized to embed. |
| `rapiflix/functions/api/cinepro/[[path]].js` | Preserved rather than deleted because this redesign instruction explicitly says to keep backend/API infrastructure unless confirmed presentation-only. **Needs owner decision** if the CinePro proxy should be removed in a separate change. |
| `rapiflix/functions/api/tmdb/[[path]].js` | Preserved secret-backed TMDB proxy and extended for TV/discovery. |
| `rapiflix/_routes.json` | Preserved Cloudflare Pages function routing. |
| `.github/workflows/rapiflix-check.yml` | Preserved CI checks. |
| `rapiflix/README.md` | Preserved existing setup and playback documentation; update it after browser QA. |
| `rapiflix/streams.json`, legal attribution and source notes | Kept for runtime configuration and attribution. |

## Needs owner decision
- Whether to remove the CinePro API proxy entirely. It is retained in this branch to avoid deleting potentially shared backend behavior without an explicit route-by-route review.
- The requested prototype `rapiflix-hero.html` was not available in the repository or accessible conversation files during implementation. The written brief was used as the design source.
- Current TMDB-backed discovery is not a source of streaming rights. Commercial title playback remains limited to configured sources; the default fallback is the title's official TMDB watch-options page.
- The color engine uses stable per-title hue seeds where specified and a title hash fallback. Server-side dominant-poster-color ingestion and analytics-based trending order require a backend/analytics contract that is not currently present.

## QA status
- JavaScript syntax validation passed for `app.js`, `routes.js`, and the Cloudflare function (module export normalized for syntax validation).
- Checked that all 51 IDs queried directly by the retained runtime are present in the new HTML, including hidden compatibility hooks.
- Not yet browser-tested, visually compared against the missing prototype, or verified against a live Cloudflare Pages deployment. Do not treat this as production QA sign-off.
