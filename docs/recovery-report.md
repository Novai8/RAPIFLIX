# Rapiflix recovery report

**Branch:** fix/rapiflix-recovery  
**Base:** main  
**Scope:** repair the popup → title details → existing player flow, unblock API contracts, stop poster cropping, and add automated regression checks.

## 1. Ground truth and baseline

The tag legacy-site-backup was checked through GitHub and does not resolve (404). The user subsequently supplied Rapiflix.html, which has now been inspected directly and is treated as the design/behavior reference for this follow-up. It specifies the hero and quick-view flow, dedicated title page, real-data facts, budget/box-office visualization, cast strip, TV season/episode list, related titles, poster containment with a blurred backing, theme changes and motion details. The prototype's hard-coded list, approximate facts, color-block poster placeholders, fake episode names and simulated player are not copied into the live implementation.

| Reference | Commit / date | Why it was selected |
|---|---|---|
| Pre-profile comparison checkpoint | [445b79f49b82ee593f8598b1ce4df113fb169a8b](https://github.com/Novai8/RAPIFLIX/commit/445b79f49b82ee593f8598b1ce4df113fb169a8b), 2026-10-19 05:35:21 UTC | Most recent checkpoint found before the clearly titled full-page profile redesign. It is the best-supported source baseline, not a runtime-verified known-good build. |
| Full-page redesign begins | [9582c598db4f3bc4aea62ab4c625dcd499cef93d](https://github.com/Novai8/RAPIFLIX/commit/9582c598db4f3bc4aea62ab4c625dcd499cef93d), 2026-10-19 14:17:00 UTC | Commit message: “Fix responsive layout and make title routes full pages.” |
| Title profile interaction added | [f63cc8bd190ae02c2963bc684c7886251220dc9c](https://github.com/Novai8/RAPIFLIX/commit/f63cc8bd190ae02c2963bc684c7886251220dc9c), 2026-10-19 16:29:48 UTC | Diff shows the profile's six API requests were awaited together, and Watch Now was disabled before the requests finished. |
| main head at audit start | [b93de1fe9ac9bec15b9acf216cdb2bd9794c4bc7](https://github.com/Novai8/RAPIFLIX/commit/b93de1fe9ac9bec15b9acf216cdb2bd9794c4bc7), 2026-10-19 17:37:40 UTC | Head used for the recovery comparison. No writes were made to main. |

The compare-commits result for the checkpoint above versus that main head reported 62 commits and these net-different files:

| Category | Files and net diff reported |
|---|---|
| Front-end presentation | index.html (+146/-10); styles.css (+757/-0) |
| Front-end logic | app.js (+58/-13); routes.js (+187/-9) |
| Backend and API | functions/api/tmdb/[[path]].js (+2/-0). Those net additions allowed movie/TV translations used by the existing language guide. |
| Database schema / migrations | No schema or migration file appeared in this net diff. No database migration was run. |
| Environment / config | No environment file or secret change appeared in this net diff. Secret values are not readable through the GitHub connector and were not requested or exposed. |
| CI / deployment | No deployment workflow or dependency change appeared in the net diff. _redirects was changed in an intermediate profile commit to add /details/*, then removed in ca3dbbec07efdcf44a04786147eee7562c3d1567. _routes.json was unchanged in that comparison. |
| Dependencies | No package or lockfile change appeared in this net diff; this project has no root package.json or lockfile in the inspected branch. |

**Backend/config files to call out from the redesign history:**

- functions/api/tmdb/[[path]].js: net-changed in the redesign comparison. The translation allowlist is retained because the pre-existing popup's language guide calls this endpoint. The recovery adds the missing credits, recommendations, and similar allowlist patterns required by the restored title profile.
- _redirects: an intermediate commit added /details/*, and a later rollback removed it. The recovery restores the rule because a direct title-page URL must serve the app shell.
- _routes.json: not net-changed in the baseline comparison. It listed /api/cinepro/* despite there being no functions/api/cinepro/[[path]].js in either the checkpoint or current base. A narrowly allowlisted handler is added in this branch because the front-end already calls that API path.
- functions/api/health.js and the recovery CI workflow are new in this branch, not redesign-era changes.

The checkpoint does not prove the original site actually ran at that point. There is no connected production browser or staging environment in this session to verify a previously working deployment.

## 2. Root-cause report

### A. Watch Now temporarily cannot be tapped

**Evidence:** commit f63cc8b originally set the detail Watch Now button to disabled as title loading began. It then awaited the base title plus credits, recommendations, similar titles, videos and watch-provider requests in a single Promise.all before enabling the button. This directly made the button unavailable during that entire wait. The direct-detail rewrite was also removed later in the rollback.

**Fix in this branch:** Watch Now remains enabled while the profile loads; its click handler falls back to the TMDB ID already present in the URL. The core title request is awaited separately from optional metadata. /details/* is restored in _redirects. Custom cursor and mouse-glow rules already have pointer-events:none; the stylesheet has a global [hidden]{display:none!important} rule.

**Not verified:** the requested browser-level document.elementsFromPoint(x, y) hit-test was not run because Chrome/DevTools is not exposed in this session. Therefore the historical disabled-button race is proven from source, but an additional live overlay interception has not been ruled out through a real pointer test.

### B. Movie/series title page can keep loading forever

**Evidence:** the original profile loader awaited all six TMDB requests before painting the title. The proxy allowlist did not accept movie/:id/credits, /recommendations, /similar or the TV equivalents, so those requests returned 404. More importantly, the original Promise.all had no timeout; any request that never settled kept the whole profile in its loading state. The TV player also awaited series and season metadata before inserting the iframe without a timeout.

**Fix in this branch:**

- The core movie/series metadata request has a 10-second limit and produces a visible error state if it fails.
- Cast, related-title, trailer and provider requests run in parallel with 7-second limits, but only after the main title is rendered.
- The TV episode player bounds series/season metadata waits to 5 seconds and still attempts the existing VidCore episode route.
- The TMDB proxy allowlist now permits the exact profile metadata endpoints.
- The main popup's Watch Now uses location.assign('/details/...'), avoiding a popup blocker when moving to the dedicated profile page.

**Remaining external dependency:** the title profile's playback uses the existing VidCore embed; this code can ensure the iframe is created, but cannot guarantee that a third-party player has a playable source or that its site is reachable.

### C. Backend/API contract drift

**Evidence:**

- The TMDB proxy requires TMDB_API_KEY and explicitly returns a JSON 503 when it is absent. The configured production secret cannot be inspected by this GitHub-only session.
- _routes.json included /api/cinepro/*, and the front-end called /api/cinepro/v1/movies/:id and /api/cinepro/v1/tv/:id/seasons/:season/episodes/:episode, but the function file was absent in both the pre-profile checkpoint and the base branch.
- No database/auth/payment implementation or migration file was identified in the checked source paths or baseline net diff.

**Fix in this branch:** add functions/api/cinepro/[[path]].js with strict GET and path validation, server-configured CINEPRO_BASE_URL, HTTPS-only production configuration, URL normalization for returned sources/subtitles, no-store caching, generic JSON errors and redacted error-class logging. Add a public, non-secret-bearing GET /api/health function and include it in _routes.json. Expand the TMDB allowlist for the missing title profile paths. Both proxies log only the validated path and error class on network failures, never keys or full upstream URLs.

**Environment names:** TMDB_API_KEY remains the TMDB secret name. CINEPRO_BASE_URL is the configured base URL for the optional CinePro service. Neither secret's configured production value can be verified here.

### D. Poster image cropped instead of fully visible

**Evidence:** styles.css used object-fit:cover for hero and catalogue poster images, including a hover transform that zoomed the image inside an overflow-hidden frame. The popup poster is a CSS background image but its background sizing was not set to contain.

**Fix in this branch:** posters now use object-fit:contain in the hero, catalogue cards, popup, title profile and recommendations; background posters use background-size:contain; hover scaling is disabled for poster art. Backdrops remain cover-cropped because they are cinematic backgrounds, not poster artwork.

## Prototype-to-production mapping

| Prototype element | Recovery implementation |
|---|---|
| Title popup → dedicated film page | Existing popup navigates to the real `/details/:slug?id=…&type=movie|tv` route. |
| Poster plus cinematic backing | The title hero and catalogue cards display the entire poster over a blurred copy of the same TMDB artwork. |
| Watch section and simulated controls | A real VidCore iframe is mounted in the title page; movie and TV embed routes follow the existing player paths. |
| Title facts | Runtime, release, genre, language, status, ratings, seasons and episode counts come from TMDB; unknown values stay “Not reported”. |
| Budget and box-office bars | Animated bars use TMDB-reported numeric values only. No estimated figures are inserted. |
| Cast, season chips and episode list | Real TMDB people/season/episode records, with a fallback message if metadata is unavailable. |
| More like this | TMDB recommendations and similar titles open their own dedicated profiles. |
| Trending row | The main trending catalogue is a horizontal, touch-scrollable rail; movie/series/anime/search catalogues retain existing filters and live catalogue data. |
| Fake facts and simulated playback | Not ported. The current TMDB catalogue, saved list, language/provider lookups and existing VidCore player are retained. |

## 3. API/config audit

| Area | Finding / action |
|---|---|
| API routes and shapes | Contract tests cover the catalog endpoints, title, cast, related titles, translations, videos, watch providers and TV season requests used by the front-end, plus both configured CinePro source routes. |
| Environment and tokens | TMDB_API_KEY is inserted server-side into the upstream URL and is not returned to the browser. CINEPRO_BASE_URL is read server-side. Production presence/value is unverified. |
| CORS | The page calls /api/* on its own origin, so the app's first-party API does not need permissive cross-origin headers. No wildcard CORS policy was added. |
| Authentication / payments / database | No such route or data model was found in the inspected app/API paths or baseline net diff. This report cannot certify external services outside the repository. |
| Rate limiting | No application-level or edge rate-limit config is present in the inspected source. The proxy remains read-only and caches TMDB success responses; Cloudflare dashboard rules and production traffic were not accessible here. |
| Caching | TMDB success responses use public, max-age=60, s-maxage=240 with a 240-second Cloudflare cache; errors are no-store. CinePro responses and health responses are no-store because source URLs may expire and health should reflect current availability/configuration. |
| Logs / errors | Both proxy handlers return safe JSON errors and log a redacted endpoint plus error class on network failures. No production logs were available for inspection. |
| Migrations | No migration was added or run because no database schema/migration system was found in the checked repository snapshot. |

## 4. Automated checks

- tests/recovery-contract.test.mjs: Node built-in test runner, no third-party dependency needed.
- .github/workflows/rapiflix-recovery-contracts.yml: Node 22 job on the recovery branch and pull requests to main.
- Tests assert JSON status/shape contracts, missing-secret handling, endpoint allowlists, upstream status propagation, cache headers, error behavior, health shape, details route wiring, loading/timeout contracts, hidden-overlay CSS and poster contain rules.
- GitHub Actions run [39321622533](https://github.com/Novai8/RAPIFLIX/actions/runs/39321622533) completed successfully with **44 tests passed, 0 failed**, using Node 22 and mocked upstream handlers. This run includes the prototype-alignment checks for the inline player, real finance/episode sections, poster backing and trending rail.

## 5. Checks that still require production/staging access

1. Run Chrome DevTools document.elementsFromPoint at the popup's Watch Now center on several titles and inspect computed pointer-events, z-index, position, disabled state and hit box.
2. Open /api/health and /api/tmdb/trending/movie/week on staging and confirm the deployment responds as expected.
3. In Cloudflare Pages settings, check that TMDB_API_KEY and, if used, CINEPRO_BASE_URL are configured as encrypted secrets/variables on the production project.
4. Check Cloudflare Pages deployment logs and set rate-limiting rules for /api/tmdb/* and /api/cinepro/* if traffic policy requires them.
5. Smoke-test both a movie and a TV episode end-to-end. Third-party player availability cannot be validated by a mocked API contract test.
6. Cloudflare's PR bot reported a successful Pages preview deployment for prototype-aligned commit 9f6afcb at https://e9255e36.rapiflix.pages.dev, with the branch preview at https://fix-rapiflix-recovery.rapiflix.pages.dev. The web/container browser tools could not open the preview directly, so this confirms deployment status but is not a manual visual/player smoke test.
