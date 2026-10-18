# Rapiflix

## Redesign v2 (in review)

The redesign branch replaces the previous visual shell with a responsive hue-reactive interface. Client-side routes are `/`, `/movies`, `/series`, `/anime`, `/search?q=...`, and `/title/:slug`; Cloudflare Pages rewrites are defined in `_redirects`. The catalog and player runtime is retained until the redesigned shell is browser-tested against the configured Cloudflare Pages environment. See [REDESIGN-REVIEW.md](./REDESIGN-REVIEW.md) for removals, preserved logic and QA gaps.

Rapiflix is a standalone movie-discovery and playback project in `/rapiflix` on branch `rapiflix/site`. It is separate from the existing Rapigents site branch.

## What works in this build

- **In-page playback:** the player looks up the Internet Archive item's live metadata instead of trusting hard-coded file names. It tries compatible MP4/M4V/WebM/OGV files, retries alternate files if playback fails, and remembers local watch progress.
- **Separate catalogues:** current/commercial TMDB titles are shown in a discovery section with regional external watch options; the free-film section contains only source items that pass the app's compatible-file and rights-statement screening. TMDB discovery cards are not represented as playable streams.
- **Unified playback controls:** rights-cleared items use one in-page player with source/file selection, quality selection when resolution metadata is available, WebVTT subtitle selection when tracks are present, and audio-track selection when the browser or authorized source exposes tracks. HLS `.m3u8` streams now work through HLS.js on supported browsers (or native HLS where available), with adaptive quality and manifest-provided audio/subtitle track selection. Failed sources fall through to the next available candidate.
- **Licensed new-release stream hook:** `/streams.json` can map TMDB movie IDs to explicitly authorized full-length URLs, including HLS manifests and third-party iframe players. Set `mode: "iframe"` to render a provider's licensed embed page; set `type: "hls"` for a direct HLS manifest. When an entry is configured, the title's main button plays that source inside Rapiflix. No commercial stream is bundled by default because the URL must come from a distributor/rightsholder or player provider that authorizes embedding.

### Configure a licensed full-length stream

Edit streams.json and use the numeric TMDB movie ID as the key under movies. Example only; replace every example URL with a media URL supplied by a rightsholder or distributor that has approved on-site playback:

    {
      "_notice": "Only list movies that you are authorized to stream on Rapiflix.",
      "movies": {
        "12345": [
          {
            "authorized": true,
            "provider": "Licensed distributor",
            "label": "1080p HLS",
            "url": "https://media.example.com/master.m3u8",
            "type": "hls",
            "height": 1080,
            "subtitles": [
              {
                "label": "English",
                "language": "en",
                "src": "https://media.example.com/subtitles/en.vtt"
              }
            ],
            "audioTracks": []
          }
        ]
      }
    }

- Replace 12345 with the real TMDB movie ID. The authorized flag is an operator assertion, not a licence check.
- For a licensed embed-player URL instead of a direct media file, use `"mode": "iframe"`, keep `"authorized": true`, and set `"url"` to the embed URL provided under your license. Rapiflix will render it inside the player and let viewers switch between configured embed sources.
- HLS manifests need CORS enabled by the media provider for your site origin. The player supports HLS quality levels and manifest-declared audio/subtitle tracks where the source exposes them.
- Use subtitles for authorized WebVTT subtitle URLs. HLS manifest subtitle/audio renditions may appear automatically in the track selectors.
- Do not use store pages, TMDB IDs, trailer URLs, scraped third-party links, or DRM-protected playback URLs as if they were direct movie streams. A retailer listing is not a media file.
- The committed manifest is intentionally empty. There is no lawful Spider-Man or other new-release stream URL to add without authorization from the rights holder or distributor. This player plumbing makes licensed streams playable once that permission and source are obtained; it does not grant the underlying movie rights.
- **Archive search:** when running locally without a TMDB key, search looks up Archive titles directly. Dynamically discovered Archive uploads are played in Rapiflix only if the item metadata declares public-domain or Creative Commons status.
- **New-release discovery:** trending, now-playing, upcoming and popular movie metadata can load from TMDB. A release-period filter supports latest (last two release years), 2020s, 2010s, 2000s, and pre-2000 titles. TMDB is a catalogue, not a source of video streams.
- **Regional watch options:** TMDB reports streaming, rental and purchase availability by country using JustWatch data. Rapiflix opens the region-specific official availability page, and adds official Apple TV, Prime Video and Netflix search links when present provider data is missing or incomplete. The Spider-Man: Brand New Day details panel also links to Sony Pictures' official film page. These are service hand-offs, not free streams supplied by Rapiflix; availability and payment depend on the provider and country. Original-language metadata is displayed when available.
- **Official trailer preview:** when TMDB supplies a YouTube trailer, the film details panel embeds that preview through YouTube's privacy-enhanced embed domain. A trailer preview is not the full movie stream.
- **Subtitle discovery:** film details include a search link to OpenSubtitles. This opens their listing/search site; it does not guarantee subtitles exist, download them automatically, or add dubbed audio to the player. In-player subtitle and audio choices still depend on tracks supplied by the authorized video source.
- **No Rapiflix-inserted ad breaks:** the built-in player plays the source file directly. Rapiflix does not insert ads or require an account for the local library. That does not make every third-party upload lawful, nor can it control ads or restrictions on external commercial services.
- **Saved titles and playback resume:** the saved list and progress are stored in the visitor's browser.

## Run locally

The archive-based library and player do not need a TMDB key.

```bash
cd rapiflix
python -m http.server 8000
```

Open `http://localhost:8000`. To load TMDB data while using the simple local HTTP server, click **Connect TMDB** and enter a temporary v3 API key in your own browser. The key is used only by localhost development mode and is not committed to GitHub. If the key was shared in chat, screenshots, or source control, revoke it and make a new one first.

The simple Python server cannot run Cloudflare Pages Functions. For production-like local proxy testing, install Wrangler and run Pages locally with the new key as a binding, for example:

```bash
npx wrangler pages dev . --binding=TMDB_API_KEY=YOUR_NEW_V3_API_KEY
```

Do not paste a real key into a source file or commit it to the repository.

## Deploy on Cloudflare Pages

Use a Git-integrated Cloudflare Pages project configured as follows:

1. Select branch `rapiflix/site`.
2. Set **Root directory** to `rapiflix`.
3. Use no build command and serve the current directory as the static output.
4. In **Settings → Variables and Secrets**, add a **Secret** named `TMDB_API_KEY` with a new, unexposed TMDB v3 key.
5. Trigger a new deployment.

The Pages Function at `functions/api/tmdb/[[path]].js` proxies only approved, read-only catalogue, watch-provider, and official trailer-metadata endpoints. It keeps the API key on the server and limits which API paths can be requested. `_routes.json` restricts Function handling to `/api/tmdb/*`. If the secret is missing, the site's Archive search/player still work, but TMDB catalogue and watch-provider calls show an error.

## Optional CinePro source provider

Rapiflix now keeps VidCore as its default movie/TV embed and offers CinePro as an additional source option. CinePro Core is a separate backend service; there is no separate generic "CinePro API key" in the documented setup.

1. Deploy your own CinePro Core instance using the [official quickstart](https://docs.cinepro.cc/quickstart).
2. Configure a fresh TMDB v3 API key as the CinePro backend's `TMDB_API_KEY` environment variable. Do not put this key in `app.js`, `streams.json`, or browser storage.
3. Make the CinePro backend reachable over HTTPS. CinePro's documentation warns that it is not secure for public hosting by default and is intended for personal, home, and educational use.
4. In Cloudflare Pages for Rapiflix, add `CINEPRO_BASE_URL` as an environment variable or secret, set to the base HTTPS URL of your CinePro instance (for example, `https://cinepro.example.com`, without a path). Redeploy the `rapiflix/site` branch with root directory `rapiflix`.
5. Open a movie and select **CinePro sources**, or open a TV series and select **Try CinePro sources** for the chosen episode. VidCore remains available through the provider controls.

The Pages Function at `functions/api/cinepro/[[path]].js` only permits the documented movie and TV-episode source endpoints, keeps the backend address out of frontend code, and makes returned relative source/subtitle URLs absolute. The source URLs are still provided by third parties, can expire or fail, and may not have CORS enabled. Finding a source does not prove that the content is licensed for your use; verify rights before public distribution. CinePro itself does not host video files.

For local testing with `python -m http.server`, the CinePro Pages Function is not available. Use Cloudflare Pages local development with the required `CINEPRO_BASE_URL` binding or test on the deployed Pages preview.

## Content rights and reliability

Internet Archive explicitly warns that it does **not** guarantee that an uploaded item's claimed copyright status or license is accurate. The app checks all curated and dynamically discovered Archive titles for a compatible video file plus an explicit, non-conflicting public-domain or Creative Commons signal in the item metadata. Curated titles that fail are hidden from the playable catalogue; discovered titles that fail are not added, and playback checks rights again before starting. This is a conservative technical screen, not a legal determination; metadata can be incomplete or incorrect and license conditions can vary by country.

The current 17-item starter list is only the initial candidate set, not a certified rights catalogue. Check each title's rights in your target countries before operating Rapiflix publicly. Uploader statements can be wrong, and a metadata label does not transfer copyright or guarantee the uploaded copy is authorized. Keep a rights/takedown contact and process before inviting public submissions or operating the site at scale.

Rapiflix does not bypass DRM, authentication, paywalls, or access controls, and it does not scrape unofficial links to copyrighted commercial releases. New-release cards provide discovery data and official watch options, not the movie file. There is no legitimate universal API that grants a new commercial release for free, ad-free streaming without the rightsholder's permission. For that catalogue you need a licensing agreement or a service that authorizes embedding.

## Research references

- [FreeReel / free-stream](https://github.com/noknows08/free-stream): an open-source reference for a static interface and Internet Archive playback of public-domain/Creative Commons classics.
- [Movie-App public-domain streaming example](https://github.com/AlaaAl-Gohary/Movie-App): separates titles confirmed for public-domain playback from titles without a confirmed stream.
- [Internet Archive rights guidance](https://archivesupport.zendesk.com/hc/en-us/articles/360014759692-Rights): Archive uploads are not guaranteed to be correctly labeled from a rights perspective.
- [Internet Archive metadata API](https://archive.org/developers/metadata.html): metadata and files used to resolve candidate video files.
- [TMDB movie watch-provider endpoint](https://developer.themoviedb.org/reference/movie-watch-providers): provides regional service availability, not video files; JustWatch attribution is required.
- [TMDB authentication](https://developer.themoviedb.org/docs/authentication-application): v3 API key and application-level auth details.
- [TMDB attribution and commercial-use FAQ](https://developer.themoviedb.org/docs/faq): requires the approved logo and attribution notice, and says commercial use requires a separate license.

## TMDB attribution

The About section includes the approved TMDB logo and required notice: “This website uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by TMDB.” Provider availability is attributed to JustWatch via TMDB.

TMDB's developer API is for non-commercial use under its standard terms. If the project's primary purpose becomes revenue generation, obtain the appropriate commercial permission from TMDB before operating it that way.
