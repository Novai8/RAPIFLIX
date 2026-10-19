# Rapiflix final recovery report

**Audit date:** 2026-10-19 UTC
**Working checkout:** `arena/53cd78d9-rapiflix`
**Protected starting commit:** `b93de1fe9ac9bec15b9acf216cdb2bd9794c4bc7`
**Backup tag:** annotated `pre-final-backup`, created on and pushed for the starting commit

## Plain-language result

The recovery work is implemented in the checkout, but production success is **not claimed**. The source has passing API and unit contracts and now includes a Playwright test harness. A real browser executable was not available in this environment, so the Playwright assertions have not run here. Cloudflare Pages, DNS, the three live domains, production environment variables, a real phone, and the third-party player were also not available for verification.

The site remains origin-agnostic: it uses same-origin `/api/...` requests and does not redirect visitors from one host to another. The intended behavior is the same on `rapiflix.online`, `www.rapiflix.online`, `rapiflix.pages.dev`, and a Pages preview URL once the same Pages project serves them.

## 1. Last-good comparison and grouped damage report

The history audit found these useful checkpoints:

| Checkpoint | Commit | Finding |
|---|---|---|
| Pre-profile comparison checkpoint | `445b79f49b82ee593f8598b1ce4df113fb169a8b` | Most recent supported checkpoint before the clearly titled full-page profile redesign. It is a source comparison point, not proof of a live working deployment. |
| Full-page profile redesign begins | `9582c598db4f3bc4aea62ab4c625dcd499cef93d` | Introduced the dedicated title-page direction. |
| Profile interaction change | `f63cc8bd190ae02c2963bc684c7886251220dc9c` | Made Watch Now wait for a group of profile requests and exposed the loading race. |
| Starting main head | `b93de1fe9ac9bec15b9acf216cdb2bd9794c4bc7` | Protected starting point for this repair. |

The comparison from the checkpoint to the starting head reported 62 commits and these net-different groups:

### A — Watch Now could not be tapped

- The profile code disabled Watch Now while the base title, cast, recommendations, similar titles, video and provider calls were all awaited.
- A slow or failed optional call therefore made the visible action unavailable.
- The later modal-first rollback also removed the dedicated title route and its rewrite.

### B — A title page could load forever

- The original profile used an all-or-nothing request group without a timeout.
- The TMDB proxy allowlist did not include the profile's movie/TV credits, recommendations or similar endpoints.
- The TV player waited for additional metadata before mounting the player.

### C — API/deployment contracts had drifted

- The front end called `/api/cinepro/...`, and `_routes.json` mentioned that path, but no CinePro Pages Function existed in the inspected base snapshot.
- TMDB profile endpoints used by the UI were not all accepted by the proxy.
- There was no public health handler, no root package/lockfile, no deployment workflow, and no `wrangler.toml` in the inspected base snapshot.
- No database, authentication, payment, schema or migration implementation was found in the audited source. No migration was run.

### D — Poster artwork was cropped

- Existing poster rules used `object-fit: cover` and hover zooming in catalogue, hero and related-title areas.
- The popup background did not guarantee contained poster artwork.
- The repair keeps cinematic backdrops cover-cropped but keeps poster foreground artwork fully visible over a blurred backing.

The historical report with the longer source evidence is retained at `docs/recovery-report.md`.

## 2. What changed in this recovery

### Front end and routes

- Added one shared browser-safe helper file, `shared.js`, for title slugs, duplicate-name disambiguation, HSL/RGB/hex conversion, luminance, accessible button text, accessible hue edge corrections and truthful money formatting.
- Added `/title/<slug>?id=<id>&type=movie|tv` as the primary TMDB title URL. Rights-screened Archive items use the same shell with `type=archive` and re-check their source metadata before playback.
- Kept `/details/<slug>?id=<id>&type=movie|tv` as a compatibility URL. Both enter the same full title-page flow, while compatibility URLs emit the `/title/` URL as canonical metadata without redirecting.
- Kept title links as ordinary anchors. Poster/play controls open the quick view; the quick view's TMDB Watch now action is a normal title-page anchor. This preserves keyboard, touch, middle-click and open-in-new-tab behavior.
- Added direct-route loading, invalid-id handling, unknown-title not-found messaging, visible retry behavior and a referrer-aware Back link.
- Split the required title request from optional profile metadata. The title has a 10-second bound; optional requests have 7-second bounds; episode metadata has a 5-second bound.
- Kept the existing VidCore player path and iframe behavior. No DRM, signed URL, rights, source authorization or player backend was replaced.
- Added responsive TMDB poster paths, `srcset`, `sizes`, contained object-fit rules, blurred poster backing, and contained hero/modal/detail/related art.
- Suppressed budget and box-office presentation unless both TMDB values are positive and reported. Missing values are not estimated.
- Kept expected network failures in visible status/retry UI instead of browser `console.warn`/`console.error` noise.
- Added canonical and Open Graph metadata updates without redirecting or forcing a canonical host.
- Added TMDB attribution in the page copy/footer and retained the statement that TMDB does not endorse or certify Rapiflix.
- Preserved dark/light themes, reduced-motion CSS paths, touch scrolling, focus restoration, Escape handling and modal Tab trapping.

### Backend and API

- Expanded `functions/api/tmdb/[[path]].js` only for the profile endpoints already used by the front end: credits, recommendations and similar for movies and TV.
- Kept the TMDB key server-side under the existing `TMDB_API_KEY` environment-variable name. The browser never receives that value.
- Added `functions/api/cinepro/[[path]].js` with strict GET/path checks, HTTPS production base validation, no-store responses, safe source/subtitle URL normalization and generic error responses. It does not invent a service URL or provide rights.
- Added `functions/api/health.js`, which exposes only `{ ok: true, service: "rapiflix-api" }` with no environment values.
- No schema, database, DRM, signed-URL or rights migration was made.

### Cloudflare Pages files

- `_redirects`: retained the existing catalogue/search SPA rewrites and added `/title/* / 200` and compatibility `/details/* / 200`.
- `_routes.json`: kept TMDB/CinePro function includes and added `/api/health`.
- `_headers`: added no-store/no-cache behavior for the HTML shell and route-aware JavaScript/CSS, long immutable caching for `/assets/*` and `/images/*`, and `nosniff` on application files.
- `.github/workflows/rapiflix-recovery-contracts.yml`: now runs syntax checks, Node API/unit contracts and Playwright browser contracts on main, `arena/**`, `fix/**`, and pull requests to main.
- Added `package.json`, `package-lock.json`, `playwright.config.mjs` and a deterministic local fixture server only for automated browser tests. No `wrangler.toml` was added because no Wrangler configuration was present or required by the existing Pages layout.

No production DNS setting, Cloudflare dashboard setting, billing setting or secret was changed.

## 3. Test evidence

Passed in this checkout:

- `node --check app.js`
- `node --check routes.js`
- `node --check shared.js`
- `node --check functions/api/tmdb/[[path]].js`
- `node --check functions/api/cinepro/[[path]].js`
- `node --check functions/api/health.js`
- `node --test tests/recovery-contract.test.mjs tests/frontend-unit.test.mjs` — **48 passed, 0 failed**
- `npx playwright test --list` — **4 browser tests discovered**
- `git diff --check` — no whitespace errors in the final working diff

The Node contracts cover TMDB success/error/missing-secret/network paths, endpoint allowlists, cache headers, health response, CinePro missing/insecure/configured paths, title routes, playback wiring, retry UI, poster containment, modal anchors and Cloudflare route files. The frontend unit suite covers accents/punctuation, duplicate slugs, all 360 hues for theme/button contrast, money edge cases and poster-fit contracts.

The Playwright test command was attempted locally. It did **not** execute browser assertions because this sandbox has no Playwright Chromium executable; all four tests stopped at browser launch with the documented “Executable doesn't exist” message. This is an environment limitation, not a product failure. GitHub Actions run `39326017341` then installed Chromium and passed the same four browser tests, alongside the Node contracts. Cloudflare Pages also reported a successful preview deployment for commit `e6468cf` at `https://90c1a981.rapiflix.pages.dev` and the branch preview `https://arena-53cd78d9-rapiflix.rapiflix.pages.dev`. Those deployment statuses are evidence of build/deploy success, not a manual visual or player smoke test.

## 4. Cloudflare Pages hand steps for the owner

Do these manually in the Cloudflare dashboard; no dashboard or DNS change was made by this repair:

1. Open the Pages project that serves Rapiflix and confirm its production branch is the intended merge target (`main` after the pull request is approved). Confirm the root directory is the repository root.
2. If there is no build system for this static site, leave **Build command** empty and set **Build output directory** to `/` (or the dashboard's root-directory equivalent). Do not add a generated `dist` directory unless the project is deliberately changed to use one.
3. Confirm Pages Functions are enabled by the repository's `functions/` directory and that the deployment includes `functions/api/tmdb/[[path]].js`, `functions/api/cinepro/[[path]].js` and `functions/api/health.js`.
4. Add the production encrypted variable/secret named exactly `TMDB_API_KEY`. Use the real TMDB v3 key; do not put it in HTML, JavaScript, Git, a build log or a chat message. Add it to Preview as well if preview title data is required.
5. If CinePro is intentionally used, add `CINEPRO_BASE_URL` as an environment variable for Production and, if needed, Preview. It must be the HTTPS origin of the owner-approved CinePro Core instance, without credentials, path, query or fragment. Leave it unset if the owner has not approved/configured CinePro; the API will visibly return a safe 503 rather than pretending playback is available.
6. Verify `_routes.json`, `_redirects` and `_headers` appear in the deployed output. Check that `/api/health`, `/api/tmdb/trending/movie/week`, a title route, and a legacy `/details/` route each return the expected response.
7. Do not configure a host redirect. The application intentionally works on the apex, `www`, `pages.dev`, and Pages preview hosts. If the owner wants `https://rapiflix.online` as the public canonical address, set that as an SEO/business decision separately; this repair only emits canonical metadata and does not redirect.
8. Confirm the three production hostnames and the Pages preview hostname are attached to the same Pages project. DNS/SSL and custom-domain state must be checked in the dashboard by the owner.
9. After deployment, smoke-test one movie, one TV series/episode, an unknown title, search with an accented/punctuated title, light/dark mode, Back, and Watch now on a real phone and desktop. Check the browser console and network panel for missing assets or API errors.

## 5. Data that can legitimately be missing

TMDB may omit or return zero for poster/backdrop, overview, release date, runtime, genres, original language, vote, status, budget, revenue, production companies/countries, cast, crew, trailer, translations, watch providers, seasons and episodes. The UI now shows an explicit fallback or hides a section instead of manufacturing a value. A TMDB watch-provider result is availability information, not a streaming right. TMDB metadata and artwork do not grant permission to stream a title.

The optional CinePro path still needs owner-provided source data. No approved provider list, signed URL manifest, DRM configuration, subtitle/audio rights, or CinePro service credentials were present in the repository and none were invented.

## 6. Needs owner decision

- Whether to configure `CINEPRO_BASE_URL` at all, and which owner-approved HTTPS service is allowed to supply sources.
- Which licensed provider/DRM/signed-URL contract should be represented in `streams.json` if commercial playback is required. The repair intentionally does not guess.
- Whether preview deployments should receive `TMDB_API_KEY`, or use only the deterministic Playwright fixture.
- Whether `/details/*` should remain as a long-term compatibility alias after existing links have been measured.
- Whether the proposed SEO canonical host should be `https://rapiflix.online`; no redirect has been enabled.
- Which country/region policy should be the default for TMDB provider display. The current UI includes Pakistan and several selectable regions but does not claim a provider is playable.
- Whether the external VidCore player is still the owner-approved player for movie and TV playback. Its real availability, DRM, signed URLs and rights cannot be certified by source tests.

## 7. Unverified items and release gate

Not verified here: DNS, SSL/custom-domain routing, Cloudflare dashboard variables, actual Pages deployments, all three production URLs, a real phone/touch screen, full assistive-technology audit, real TMDB responses, real Archive rights metadata, production rate limits/logs, VidCore playback, DRM, signed URLs, source authorization, ads, or production console cleanliness.

The automated preview gate is now **passed**: GitHub Actions installed Chromium and passed the API, unit, syntax and four Playwright browser contracts, and Pages reported the preview deployment successful. The remaining release work is owner-side: inspect the Pages preview visually at 360 and 1440 widths, verify real API secrets and playback, merge the open pull request normally only after that review, smoke-test all three production domains, and use `git revert` if a production regression is observed. The local sandbox's missing browser still means I did not personally perform that visual or real-player review.
