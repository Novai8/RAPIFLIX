/* Rapiflix app: routing, data access, views and the watch room. */
(() => {
  "use strict";

  const ui = window.RapiflixUI || {};
  const $ = ui.$ || ((selector, root = document) => root.querySelector(selector));
  const $$ = ui.$$ || ((selector, root = document) => Array.from(root.querySelectorAll(selector)));
  const esc = ui.esc || ((value) => String(value ?? ""));
  const providers = window.RapiflixProviders;

  const app = $("#app");
  const IMG = "https://image.tmdb.org/t/p/";
  const PAGE_SIZE = 20;
  const EMPTY_IMAGE = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='2' height='3'%3E%3C/svg%3E";

  const GENRES = [
    { id: "28", slug: "action", label: "Action" },
    { id: "35", slug: "comedy", label: "Comedy" },
    { id: "18", slug: "drama", label: "Drama" },
    { id: "27", slug: "horror", label: "Horror" },
    { id: "878", slug: "sci-fi", label: "Sci-Fi" },
    { id: "53", slug: "thriller", label: "Thriller" }
  ];

  /* ---------- state ---------- */
  const state = {
    route: null,
    streams: {},
    cache: new Map(),
    inflight: new Map(),
    favorites: new Set(readFavorites()),
    feeds: {},
    titles: new Map(),
    seasons: new Map(),
    hero: { items: [], index: 0, timer: 0, paused: false },
    player: { hls: null, frame: null, timers: [] },
    providerIndex: 0,
    providerKey: "",
    sort: "popularity"
  };

  function readFavorites() {
    try {
      const parsed = JSON.parse(localStorage.getItem("rapiflix-favorites") || "[]");
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch (_) { return []; }
  }
  function saveFavorites() {
    try { localStorage.setItem("rapiflix-favorites", JSON.stringify([...state.favorites])); } catch (_) {}
  }

  /* ---------- helpers ---------- */
  const img = (path, size = "w342") => (path ? (path.startsWith("http") ? path : IMG + size + path) : "");
  const toast = (message) => (ui.toast ? ui.toast(message) : null);
  const dot = '<span class="dot" aria-hidden="true"></span>';
  const yearOf = (item) => Number(String(item.release_date || item.first_air_date || "").slice(0, 4)) || 0;
  const runtimeOf = (minutes) => (minutes ? `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m` : "");
  const money = (value) => (value ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value) : "Not reported");
  const ratingText = (value) => (Number(value) > 0 ? `★ ${Number(value).toFixed(1)}` : "★ —");
  const typeLabel = (type) => (type === "tv" ? "Series" : "Movie");

  function normalise(item, type) {
    const kind = type || (item.media_type === "tv" ? "tv" : "movie");
    return {
      id: Number(item.id),
      type: kind,
      title: item.title || item.name || "Untitled",
      year: yearOf(item),
      releaseDate: String(item.release_date || item.first_air_date || ""),
      rating: Number(item.vote_average) || 0,
      votes: Number(item.vote_count) || 0,
      overview: item.overview || "",
      poster: item.poster_path || "",
      backdrop: item.backdrop_path || "",
      genres: (item.genres || item.genre_names || []).map((genre) => (typeof genre === "string" ? genre : genre.name)).filter(Boolean),
      runtime: Number(item.runtime) || 0
    };
  }

  /* ---------- data layer ---------- */
  class ApiError extends Error {
    constructor(message, status) {
      super(message);
      this.name = "ApiError";
      this.status = status;
    }
  }

  function cacheGet(key) {
    const entry = state.cache.get(key);
    if (!entry) return null;
    if (entry.expires < Date.now()) { state.cache.delete(key); return null; }
    return entry.data;
  }
  function cacheSet(key, data, ttl) {
    if (state.cache.size > 140) state.cache.delete(state.cache.keys().next().value);
    state.cache.set(key, { data, expires: Date.now() + ttl });
  }

  async function request(path, retries, timeout) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(`/api/tmdb/${path}`, { signal: controller.signal, headers: { Accept: "application/json" } });
      let payload = null;
      try { payload = await response.json(); } catch (_) {}
      if (!response.ok) {
        throw new ApiError(payload?.error || (response.status === 404 ? "That title is not in the catalogue." : "The catalogue is unavailable right now."), response.status);
      }
      if (!payload) throw new ApiError("The catalogue returned an unreadable response.", 502);
      return payload;
    } catch (error) {
      if (error.name === "AbortError") throw new ApiError("The catalogue took too long to respond.", 504);
      if (retries > 0 && (!error.status || error.status >= 500)) {
        await new Promise((resolve) => setTimeout(resolve, 320));
        return request(path, retries - 1, timeout);
      }
      if (error instanceof ApiError) throw error;
      throw new ApiError("Could not reach the catalogue. Check your connection.", 0);
    } finally {
      clearTimeout(timer);
    }
  }

  function api(path, { ttl = 300000, retries = 1, timeout = 9000 } = {}) {
    const cached = cacheGet(path);
    if (cached) return Promise.resolve(cached);
    if (state.inflight.has(path)) return state.inflight.get(path);
    const promise = request(path, retries, timeout)
      .then((data) => { cacheSet(path, data, ttl); return data; })
      .finally(() => state.inflight.delete(path));
    state.inflight.set(path, promise);
    return promise;
  }

  async function loadStreams() {
    try {
      const response = await fetch("/streams.json", { headers: { Accept: "application/json" } });
      state.streams = response.ok ? await response.json() : {};
    } catch (_) {
      state.streams = {};
    }
  }

  async function titleData(id, requestedType) {
    const key = `${requestedType || "auto"}:${id}`;
    if (state.titles.has(key)) return state.titles.get(key);
    if (state.inflight.has(key)) return state.inflight.get(key);

    const run = (async () => {
      const types = requestedType ? [requestedType] : ["movie", "tv"];
      let lastError = null;
      for (const type of types) {
        try {
          const detail = await api(`${type}/${encodeURIComponent(id)}?language=en-US&append_to_response=credits%2Cvideos%2Cwatch%2Fproviders%2Crecommendations%2Csimilar`, { ttl: 600000 });
          const media = buildTitle(detail, type);
          state.titles.set(key, media);
          return media;
        } catch (error) {
          lastError = error;
        }
      }
      throw lastError || new ApiError("That title could not be loaded.", 404);
    })();

    state.inflight.set(key, run);
    try { return await run; } finally { state.inflight.delete(key); }
  }

  function buildTitle(detail, type) {
    const media = normalise(detail, type);
    const credits = detail.credits || {};
    const videos = detail.videos?.results || [];
    const trailer = videos.find((video) => video.site === "YouTube" && ["Trailer", "Teaser"].includes(video.type)) || videos.find((video) => video.site === "YouTube");
    const crew = (credits.crew || []).filter((member) => ["Director", "Writer", "Screenplay", "Creator"].includes(member.job)).slice(0, 4);
    const related = (detail.recommendations?.results || detail.similar?.results || [])
      .filter((item) => item.poster_path)
      .slice(0, 10)
      .map((item) => normalise(item, type));

    return {
      ...media,
      genres: (detail.genres || []).map((genre) => genre.name),
      runtime: Number(detail.runtime) || Number(detail.episode_run_time?.[0]) || 0,
      status: detail.status || "",
      language: (detail.original_language || "").toUpperCase(),
      budget: Number(detail.budget) || 0,
      revenue: Number(detail.revenue) || 0,
      seasons: Array.isArray(detail.seasons) ? detail.seasons.filter((season) => Number(season.season_number) >= 0) : [],
      cast: (credits.cast || []).slice(0, 14).map((member) => ({
        name: member.name,
        role: member.character || "",
        profile: member.profile_path || ""
      })),
      crew: crew.map((member) => ({ name: member.name, job: member.job })),
      trailer: trailer ? `https://www.youtube.com/watch?v=${trailer.key}` : "",
      providers: detail["watch/providers"]?.results || {},
      related
    };
  }

  /* ---------- feeds ---------- */
  const today = () => new Date().toISOString().slice(0, 10);
  const lastYear = () => {
    const date = new Date();
    date.setDate(date.getDate() - 365);
    return date.toISOString().slice(0, 10);
  };

  function feedPath(page, { genre = "", sort = "popularity", pageNum = 1 } = {}) {
    const common = `include_adult=false&page=${pageNum}`;
    if (page === "series") {
      const order = sort === "rating" ? "vote_average.desc&vote_count.gte=200" : "popularity.desc";
      return `discover/tv?sort_by=${order}&${common}`;
    }
    if (page === "anime") {
      const order = sort === "rating" ? "vote_average.desc&vote_count.gte=200" : "popularity.desc";
      return `discover/movie?with_genres=16&with_original_language=ja&sort_by=${order}&${common}`;
    }
    const genreId = GENRES.find((entry) => entry.slug === genre)?.id;
    const order = sort === "rating" ? "vote_average.desc&vote_count.gte=200" : "popularity.desc";
    const range = "primary_release_date.gte=1995-01-01&primary_release_date.lte=" + today();
    return `discover/movie?${range}&sort_by=${order}${genreId ? `&with_genres=${genreId}` : ""}&${common}`;
  }

  async function loadFeed(page, options = {}) {
    const { pageNum = 1, append = false, genre = "", sort = "popularity" } = options;
    const type = page === "series" ? "tv" : "movie";
    const data = await api(feedPath(page, { genre, sort, pageNum }), { ttl: 240000 });
    const items = (data.results || []).map((item) => normalise(item, type)).filter((item) => item.poster);
    const previous = append && state.feeds[page] ? state.feeds[page].items : [];
    const merged = [...previous, ...items.filter((item) => !previous.some((existing) => existing.id === item.id))];
    state.feeds[page] = {
      items: merged,
      page: Number(data.page) || pageNum,
      total: Math.min(Number(data.total_pages) || 1, 500),
      genre,
      sort
    };
    return state.feeds[page];
  }

  async function loadHome() {
    if (state.feeds.home) return state.feeds.home;
    if (state.inflight.has("home")) return state.inflight.get("home");

    const run = (async () => {
      const requests = await Promise.allSettled([
        api("trending/all/week?language=en-US", { ttl: 240000 }),
        api("trending/movie/week?language=en-US", { ttl: 240000 }),
        api("trending/tv/week?language=en-US", { ttl: 240000 }),
        api("movie/popular?language=en-US&page=1", { ttl: 240000 }),
        api("tv/popular?language=en-US&page=1", { ttl: 240000 }),
        api("discover/movie?with_genres=16&with_original_language=ja&sort_by=popularity.desc&page=1&include_adult=false", { ttl: 240000 }),
        api(`discover/movie?primary_release_date.gte=${lastYear()}&primary_release_date.lte=${today()}&sort_by=primary_release_date.desc&page=1&include_adult=false`, { ttl: 240000 })
      ]);

      const pick = (index, type) => {
        const result = requests[index];
        if (result.status !== "fulfilled") return [];
        return (result.value.results || [])
          .filter((item) => !item.media_type || item.media_type === "movie" || item.media_type === "tv")
          .map((item) => normalise(item, type))
          .filter((item) => item.poster);
      };

      const featured = pick(0);
      const failures = requests.filter((result) => result.status === "rejected").length;
      const feed = {
        featured,
        trendingMovies: pick(1, "movie"),
        trendingSeries: pick(2, "tv"),
        popularMovies: pick(3, "movie"),
        popularSeries: pick(4, "tv"),
        anime: pick(5, "movie"),
        newMovies: pick(6, "movie"),
        failures
      };
      state.feeds.home = feed;
      return feed;
    })();

    state.inflight.set("home", run);
    try { return await run; } finally { state.inflight.delete("home"); }
  }

  async function searchCatalog(query) {
    const term = String(query || "").trim();
    if (!term) return { items: [], term };
    const data = await api(`search/multi?query=${encodeURIComponent(term)}&include_adult=false&page=1`, { ttl: 120000 });
    const items = (data.results || [])
      .filter((item) => item.media_type === "movie" || item.media_type === "tv")
      .map((item) => normalise(item, item.media_type))
      .filter((item) => item.poster);
    return { items, term };
  }

  async function seasonEpisodes(id, season) {
    const key = `${id}:${season}`;
    if (state.seasons.has(key)) return state.seasons.get(key);
    const data = await api(`tv/${encodeURIComponent(id)}/season/${encodeURIComponent(season)}?language=en-US`, { ttl: 600000 });
    const episodes = (data.episodes || []).map((episode) => ({
      number: Number(episode.episode_number) || 0,
      name: episode.name || "",
      overview: episode.overview || "",
      runtime: Number(episode.runtime) || 0,
      airDate: episode.air_date || "",
      still: episode.still_path || ""
    }));
    state.seasons.set(key, episodes);
    return episodes;
  }

  /* ---------- router ---------- */
  function route() {
    const path = location.pathname.replace(/\/+$/, "") || "/";
    const params = new URLSearchParams(location.search);
    if (path.startsWith("/title/")) return { page: "title", id: path.split("/")[2] || "", type: params.get("type") || "" };
    if (path.startsWith("/watch/")) {
      return {
        page: "watch",
        id: path.split("/")[2] || "",
        type: params.get("type") || "",
        season: Number(params.get("season")) || 1,
        episode: Number(params.get("episode")) || 1
      };
    }
    if (path === "/movies") return { page: "movies", genre: params.get("genre") || "" };
    if (path === "/series") return { page: "series" };
    if (path === "/anime") return { page: "anime" };
    if (path === "/new" || path === "/new-releases") return { page: "new" };
    if (path === "/search") return { page: "search", query: params.get("q") || "" };
    return { page: "home" };
  }

  let renderToken = 0;

  function go(path, { replace = false } = {}) {
    if (replace) history.replaceState({}, "", path);
    else history.pushState({}, "", path);
    render();
  }

  function setActive(page) {
    const current = page === "title" || page === "watch" ? "" : page;
    $$("[data-nav]").forEach((link) => {
      const key = link.dataset.nav;
      const active = key === current || (page === "title" && key === "movies");
      link.classList.toggle("active", active);
      if (active) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
  }

  function setTitle(text) {
    document.title = text ? `${text} — Rapiflix` : "Rapiflix — Stay for the story";
  }

  function skeletonCards(count = 8) {
    return Array.from({ length: count }, () => `<div class="sk-card" aria-hidden="true"><div class="sk sk-poster"></div><div class="sk sk-line"></div><div class="sk sk-line short"></div></div>`).join("");
  }

  function skeletonFor(r) {
    if (r.page === "title" || r.page === "watch") {
      return `<div class="hero-sk"><div class="hero-sk-grid"><div class="hero-sk-copy"><div class="sk sk-line"></div><div class="sk sk-line"></div><div class="sk sk-line"></div><div class="sk sk-line"></div></div><div class="sk sk-hero"></div></div></div>`;
    }
    if (r.page === "home") {
      return `<div class="hero-sk"><div class="hero-sk-grid"><div class="hero-sk-copy"><div class="sk sk-line"></div><div class="sk sk-line"></div><div class="sk sk-line"></div><div class="sk sk-line"></div></div><div class="sk sk-hero"></div></div></div>
      <div class="page"><div class="sk" style="height:26px;width:220px;margin:30px 0 22px"></div><div class="grid">${skeletonCards(6)}</div></div>`;
    }
    return `<div class="page"><div class="sk sk-line" style="width:120px;margin-top:40px"></div><div class="sk" style="height:52px;width:min(420px,70%);margin:16px 0 10px"></div><div class="sk sk-line" style="width:min(560px,90%);margin-bottom:28px"></div><div class="grid">${skeletonCards(12)}</div></div>`;
  }

  function errorState(error, retry) {
    return `<div class="app-error">
      <span class="kicker">RAPIFLIX / OUTAGE</span>
      <h1>We lost the reel.</h1>
      <p>${esc(error?.message || "The catalogue is unavailable right now.")}</p>
      ${retry ? `<button class="btn btn-accent" type="button" data-retry>Try again</button>` : ""}
    </div>`;
  }

  /* ---------- components ---------- */
  const monogram = (text) => String(text || "")
    .trim().split(/\s+/).filter(Boolean).slice(0, 2)
    .map((word) => Array.from(word)[0] || "").join("").toUpperCase() || "RF";

  function card(item, index = 0) {
    const saved = state.favorites.has(String(item.id));
    return `<article class="card" style="--d:${Math.min(index, 9) * 40}ms">
      <button class="card-btn" type="button" data-open="${esc(item.id)}" data-type="${esc(item.type)}" aria-label="Open ${esc(item.title)}">
        <span class="card-frame">
          ${item.poster
            ? `<img src="${esc(img(item.poster))}" alt="" width="300" height="450" loading="lazy" decoding="async">`
            : `<span class="card-plate" aria-hidden="true"><b>${esc(monogram(item.title))}</b><small>No plate on file</small></span>`}
          <span class="card-sprockets" aria-hidden="true"></span>
          <span class="card-index">${String(index + 1).padStart(3, "0")}</span>
          ${item.rating > 0 ? `<span class="card-rating">${esc(ratingText(item.rating))}</span>` : ""}
          <span class="card-type">${esc(typeLabel(item.type))}</span>
          <span class="card-hover" aria-hidden="true">Open ↗</span>
        </span>
        <span class="card-body">
          <span class="card-title">${esc(item.title)}</span>
          <span class="card-meta"><b>${esc(item.year || "—")}</b><i>${esc(typeLabel(item.type))}</i></span>
        </span>
      </button>
      <button class="card-save ${saved ? "is-saved" : ""}" type="button" data-save="${esc(item.id)}" aria-pressed="${saved}" aria-label="${saved ? "Remove" : "Save"} ${esc(item.title)}">${saved ? "♥" : "♡"}</button>
    </article>`;
  }

  function ledger(items, label) {
    const list = (items || []).slice(0, 5);
    if (!list.length) return "";
    return `<ol class="ledger" aria-label="${esc(label || "Catalogue index")}">
      ${list.map((item, index) => `<li><button type="button" data-open="${esc(item.id)}" data-type="${esc(item.type)}">
        <span class="ledger-no">${String(index + 1).padStart(2, "0")}</span>
        <span class="ledger-title">${esc(item.title)}</span>
        <span class="ledger-meta">${esc(item.year || "—")} · ${esc(ratingText(item.rating))}</span>
      </button></li>`).join("")}
    </ol>`;
  }

  const TICKER = ["Now showing", "Metadata by TMDB", "No ads inserted", "Authorised sources only", "Stay for the story"];
  function ticker() {
    const run = TICKER.map((text) => `<span><b>◆</b>${esc(text)}</span>`).join("");
    return `<div class="ticker" aria-hidden="true"><div class="ticker-track">${run}${run}</div></div>`;
  }

  function grid(items) {
    return `<div class="grid">${items.map((item, index) => card(item, index)).join("")}</div>`;
  }

  function reel(id, kicker, title, items, href, label) {
    if (!items || !items.length) return "";
    return `<section class="reel" data-reel="${esc(id)}">
      <div class="reel-head">
        <div><span class="kicker">${esc(kicker)}</span><h2 class="h2">${esc(title)}</h2></div>
        <div class="reel-tools">
          <button class="rail-btn" type="button" data-rail="prev" data-rail-target="${esc(id)}" aria-label="Scroll ${esc(title)} left">←</button>
          <button class="rail-btn" type="button" data-rail="next" data-rail-target="${esc(id)}" aria-label="Scroll ${esc(title)} right">→</button>
          ${href ? `<a class="reel-link" href="${esc(href)}" data-link>${esc(label || "See all")} ↗</a>` : ""}
        </div>
      </div>
      <div class="reel-track" id="rail-${esc(id)}">${items.map((item, index) => card(item, index)).join("")}</div>
    </section>`;
  }

  function emptyState(title, body, action) {
    return `<div class="empty-state"><strong>${esc(title)}</strong><p>${esc(body)}</p>${action || ""}</div>`;
  }

  /* ---------- views ---------- */
  function heroMarkup(items) {
    const first = items[0];
    if (!first) return "";
    return `<section class="hero" data-hero>
      <div class="hero-media" aria-hidden="true">
        <img class="hero-img is-on" data-hero-layer="a" src="${esc(img(first.backdrop, "w1280"))}" alt="" width="1280" height="720" fetchpriority="high" decoding="async">
        <img class="hero-img" data-hero-layer="b" src="${esc(EMPTY_IMAGE)}" alt="" width="1280" height="720" decoding="async">
      </div>
      <div class="hero-veil" aria-hidden="true"></div>
      <div class="hero-copy">
        <p class="hero-folio"><b>Now showing</b><span data-hero-folio>01 / ${String(items.length).padStart(2, "0")}</span></p>
        <span class="kicker">Featured · <span data-hero-kind>${esc(typeLabel(first.type))}</span></span>
        <h1 class="hero-title" data-hero-title>${esc(first.title)}</h1>
        <p class="hero-meta" data-hero-meta>${esc([first.year || "", ratingText(first.rating), typeLabel(first.type)].filter(Boolean).join(" · "))}</p>
        <p class="hero-overview" data-hero-overview>${esc(first.overview || "No synopsis is available for this title yet.")}</p>
        <div class="hero-actions">
          <a class="btn btn-accent" href="${esc(`/watch/${first.id}?type=${first.type}`)}" data-link data-hero-watch>▶ Watch now</a>
          <a class="btn btn-ghost" href="${esc(`/title/${first.id}?type=${first.type}`)}" data-link data-hero-details>Details</a>
        </div>
      </div>
      <div class="hero-side">
        <span class="hero-ghost" data-hero-ghost aria-hidden="true">01</span>
        <div class="hero-ticks" data-hero-ticks aria-hidden="true">
          ${items.map((_, index) => `<i class="${index === 0 ? "is-on" : ""}"></i>`).join("")}
        </div>
        <div class="hero-poster is-on"><img data-hero-poster="a" src="${esc(img(first.poster, "w500"))}" alt="" width="500" height="750" loading="eager" decoding="async"></div>
        ${items[1] ? `<div class="hero-poster is-off"><img data-hero-poster="b" src="${esc(img(items[1].poster, "w500"))}" alt="" width="500" height="750" loading="lazy" decoding="async"></div>` : ""}
      </div>
    </section>`;
  }

  function homeView(feed) {
    const featured = (feed.featured || []).filter((item) => item.backdrop).slice(0, 5);
    const fallbackFeatured = featured.length ? featured : [...feed.trendingMovies, ...feed.popularSeries].filter((item) => item.backdrop).slice(0, 5);
    const sections = [
      reel("trending", "This week", "Trending movies", feed.trendingMovies.slice(0, 14), "/movies", "All movies"),
      reel("series", "Episodic", "Trending series", feed.trendingSeries.slice(0, 14), "/series", "All series"),
      reel("popular", "Audience picks", "Popular films", feed.popularMovies.slice(0, 14), "/movies?sort=rating", "Browse"),
      reel("anime", "Animation", "Anime films", feed.anime.slice(0, 14), "/anime", "All anime"),
      reel("new", "Just released", "New this year", feed.newMovies.slice(0, 14), "/new", "See new releases")
    ].filter(Boolean).join("");

    const notice = feed.failures
      ? `<div class="load-error"><span>Some rows could not be loaded from TMDB (${feed.failures} request${feed.failures > 1 ? "s" : ""} failed).</span><button class="btn btn-quiet" type="button" data-retry>Reload</button></div>`
      : "";

    return `${heroMarkup(fallbackFeatured)}
      ${ticker()}
      <div class="page">
        ${notice}
        <div class="page-head" style="border-bottom:0;padding-bottom:0">
          <span class="kicker">The archive · Vol. 01</span>
          <h2 class="h2" style="margin-top:12px;max-width:24ch">Pick a mood.<br><em>Press play.</em></h2>
          <p>Five shelves of films, series and animation, pulled live from TMDB and framed like a contact sheet.</p>
        </div>
        ${sections || emptyState("Nothing to show yet", "The archive came back empty. Try reloading in a moment.")}
        <div class="notice">
          <div>
            <h2>No injected ads. No forced redirects.</h2>
            <p>Rapiflix never inserts advertising or popups into its own interface. Playback happens only through an authorised source; when none is configured for a title, we point you to official viewing options instead of faking a stream.</p>
          </div>
          <a class="btn btn-ghost" href="/new" data-link>New releases ↗</a>
        </div>
      </div>`;
  }

  function listingView(r) {
    const feed = state.feeds[r.page];
    const genre = r.genre || "";
    const genreEntry = GENRES.find((entry) => entry.slug === genre);
    const labels = {
      movies: { kicker: "Rapiflix / Movies", title: genreEntry ? `${esc(genreEntry.label)} <em>films</em>` : `The feature <em>reel</em>`, body: "Features from 1995 onwards, ordered by popularity. Filter by genre or switch to the highest-rated cut." },
      series: { kicker: "Rapiflix / Series", title: `Continue the <em>story</em>`, body: "Series and limited runs, ordered by what the archive is watching now. Load more reels as you go." },
      anime: { kicker: "Rapiflix / Anime", title: `Drawn <em>worlds</em>`, body: "Japanese animated features, kept on their own shelf so they never get buried." },
      new: { kicker: "Rapiflix / New", title: `Fresh <em>prints</em>`, body: "Films and series released in the last twelve months, newest first." }
    }[r.page];

    const tools = r.page === "movies"
      ? `<div class="page-tools">
          <a class="chip ${!genre ? "is-active" : ""}" href="/movies" data-link>All</a>
          ${GENRES.map((entry) => `<a class="chip ${genre === entry.slug ? "is-active" : ""}" href="/movies?genre=${entry.slug}" data-link>${esc(entry.label)}</a>`).join("")}
          <button class="chip ${state.sort === "rating" ? "is-active" : ""}" type="button" data-sort="${state.sort === "rating" ? "popularity" : "rating"}">Highest rated</button>
          <span class="count-note">${feed ? `${feed.items.length} loaded` : ""}</span>
        </div>`
      : `<div class="page-tools">
          <button class="chip ${state.sort === "popularity" ? "is-active" : ""}" type="button" data-sort="popularity">Popular</button>
          <button class="chip ${state.sort === "rating" ? "is-active" : ""}" type="button" data-sort="rating">Highest rated</button>
          <span class="count-note">${feed ? `${feed.items.length} loaded` : ""}</span>
        </div>`;

    const body = feed && feed.items.length
      ? grid(feed.items)
      : emptyState("No titles loaded", "This shelf came back empty. Try again, or explore another section.", `<button class="btn btn-ghost" type="button" data-retry>Reload</button>`);

    const more = feed && feed.page < feed.total
      ? `<div class="load-more-wrap"><button class="btn btn-ghost" type="button" data-more>Load more · page ${feed.page + 1}</button></div>`
      : "";

    return `<div class="page listing">
      <div class="page-head">
        <span class="kicker">${esc(labels.kicker)}</span>
        <h1 class="display">${labels.title}</h1>
        <p>${esc(labels.body)}</p>
        ${tools}
      </div>
      ${ledger(feed?.items, `${labels.kicker} index`)}
      ${body}
      ${more}
    </div>`;
  }

  function newView() {
    const feed = state.feeds.new;
    const movies = feed?.movies || [];
    const series = feed?.series || [];
    const more = feed && feed.page < feed.total
      ? `<div class="load-more-wrap"><button class="btn btn-ghost" type="button" data-more>Load more · page ${feed.page + 1}</button></div>`
      : "";
    return `<div class="page listing">
      <div class="page-head">
        <span class="kicker">Rapiflix / Just released</span>
        <h1 class="display">New movies<br><em>&amp; series.</em></h1>
        <p>Everything from the last twelve months, newest first. Sourced live from TMDB and framed as a contact sheet.</p>
      </div>
      ${ledger([...movies, ...series], "New releases index")}
      ${movies.length ? `<section class="reel"><div class="reel-head"><div><span class="kicker">Films</span><h2 class="h2">New movies</h2></div><span class="count-note">${movies.length} loaded</span></div>${grid(movies)}</section>` : emptyState("No new films yet", "Recent releases could not be loaded right now.", `<button class="btn btn-ghost" type="button" data-retry>Reload</button>`)}
      ${series.length ? `<section class="reel"><div class="reel-head"><div><span class="kicker">Series</span><h2 class="h2">New series</h2></div><span class="count-note">${series.length} loaded</span></div>${grid(series)}</section>` : ""}
      ${more}
    </div>`;
  }

  function searchView(result) {
    const items = result?.items || [];
    const term = result?.term || "";
    return `<div class="page listing">
      <div class="page-head">
        <span class="kicker">Rapiflix / Search</span>
        <h1 class="display">${term ? `Results for<br><em>${esc(term)}</em>` : "Find a favourite."}</h1>
        <p>${items.length ? `${items.length} ${items.length === 1 ? "title" : "titles"} surfaced from the movie and TV index.` : term ? "Nothing matched that search. Try a different title, or search by year." : "Use the search box to look up any movie or series."}</p>
        <div class="page-tools"><button class="chip" type="button" data-open-search>Refine search</button></div>
      </div>
      ${ledger(items, "Search index")}
      ${items.length ? grid(items) : emptyState("No matches", "TMDB returned no movie or series for that query.", `<button class="btn btn-ghost" type="button" data-open-search>Search again</button>`)}
    </div>`;
  }

  const CREW_LABELS = { Director: "Directed by", Creator: "Created by", Writer: "Written by", Screenplay: "Written by", Story: "Story by" };
  function crewLine(crew) {
    const groups = new Map();
    for (const member of crew) {
      const label = CREW_LABELS[member.job];
      if (!label) continue;
      if (!groups.has(label)) groups.set(label, []);
      const names = groups.get(label);
      if (!names.includes(member.name)) names.push(member.name);
    }
    return Array.from(groups).slice(0, 2).map(([label, names]) => `${label} ${names.join(", ")}`).join(" · ");
  }

  function titleView(media) {
    const saved = state.favorites.has(String(media.id));
    const genres = media.genres.length ? media.genres.join(" · ") : "";
    const runtime = runtimeOf(media.runtime);
    const providerList = Object.values(media.providers || {}).flatMap((region) => (region.flatrate || []).map((provider) => provider.provider_name));
    const facts = [
      ["Type", typeLabel(media.type)],
      ["Released", media.year || "Unknown"],
      ["Rating", media.rating ? `${media.rating.toFixed(1)} / 10` : "Not rated"],
      ["Runtime", runtime || "Unavailable"]
    ];
    if (media.type === "movie") {
      facts.push(["Budget", money(media.budget)], ["Box office", money(media.revenue)]);
    } else if (media.seasons.length) {
      facts.push(["Seasons", String(media.seasons.length)]);
    }
    if (media.language) facts.push(["Language", media.language]);

    const cast = media.cast.length
      ? `<section class="title-section">
          <div class="title-section-head"><div><span class="kicker">Cast</span><h2 class="h2">Faces in the frame</h2></div></div>
          <div class="cast-rail">${media.cast.map((member) => `<article class="cast-card">
            <div class="cast-avatar">${member.profile ? `<img src="${esc(img(member.profile, "w185"))}" alt="" width="185" height="185" loading="lazy" decoding="async">` : `<span class="cast-mono" aria-hidden="true">${esc(monogram(member.name))}</span>`}</div>
            <p class="cast-name">${esc(member.name || "")}</p>
            <p class="cast-role">${esc(member.role || "Cast")}</p>
          </article>`).join("")}</div>
        </section>`
      : "";

    const credit = crewLine(media.crew);
    const crew = credit
      ? `<p class="lede" style="margin-top:12px">${esc(credit)}</p>`
      : "";

    const episodes = media.type === "tv"
      ? (() => {
          const firstSeason = media.seasons.find((season) => Number(season.season_number) === 1)
            || media.seasons.find((season) => Number(season.season_number) > 0)
            || media.seasons[0];
          return `<section class="title-section episodes" id="episodes">
          <div class="title-section-head"><div><span class="kicker">Episode guide</span><h2 class="h2">Pick up the story</h2></div></div>
          <div class="episode-controls">
            <label for="seasonSelect">Season</label>
            <select id="seasonSelect" data-series-id="${esc(media.id)}">
              ${media.seasons.map((season) => `<option value="${esc(season.season_number)}" ${season === firstSeason ? "selected" : ""}>${esc(season.name || `Season ${season.season_number}`)}${season.episode_count ? ` · ${season.episode_count} episodes` : ""}</option>`).join("")}
            </select>
          </div>
          <div id="seasonEpisodes" class="episode-list" aria-live="polite"><p class="lede">Loading episodes…</p></div>
        </section>`;
        })()
      : "";

    const related = media.related.length
      ? `<section class="title-section">
          <div class="title-section-head"><div><span class="kicker">Because you opened this</span><h2 class="h2">Related titles</h2></div></div>
          ${grid(media.related.slice(0, 10))}
        </section>`
      : "";

    return `<section class="title-page">
      ${media.backdrop ? `<img class="title-bg" src="${esc(img(media.backdrop, "w1280"))}" alt="" width="1280" height="720" fetchpriority="high" decoding="async">` : ""}
      <div class="title-bg-veil" aria-hidden="true"></div>
      <div class="title-inner">
        <div class="title-index"><a class="back-link" href="/" data-link>← Archive</a><span>${esc(typeLabel(media.type))} / File ${String(media.id).padStart(6, "0")}</span></div>
        <div class="title-hero">
          <div class="title-poster"><img src="${esc(img(media.poster, "w500"))}" alt="${esc(media.title)} poster" width="500" height="750" fetchpriority="high" decoding="async"></div>
          <div class="title-copy">
            <span class="kicker">${esc(typeLabel(media.type))}${media.year ? ` · ${esc(media.year)}` : ""}</span>
            <h1>${esc(media.title)}</h1>
            <p class="title-meta">${[
              media.rating ? `<span class="title-score">${esc(ratingText(media.rating))}</span>` : "",
              esc(runtime),
              esc(genres),
              esc(media.status)
            ].filter(Boolean).join(dot)}</p>
            <p class="title-overview">${esc(media.overview || "No synopsis is available for this title yet.")}</p>
            <div class="title-actions">
              <a class="btn btn-accent" href="${esc(`/watch/${media.id}?type=${media.type}${media.type === "tv" ? "&season=1&episode=1" : ""}`)}" data-link>▶ Watch room</a>
              <button class="btn btn-ghost ${saved ? "is-saved" : ""}" type="button" data-save="${esc(media.id)}" aria-pressed="${saved}">${saved ? "♥ Saved" : "♡ Save title"}</button>
              ${media.trailer ? `<a class="btn btn-ghost" href="${esc(media.trailer)}" target="_blank" rel="noopener noreferrer">Watch trailer ↗</a>` : ""}
            </div>
            <div class="title-facts">${facts.map(([label, value]) => `<div><small>${esc(label)}</small><strong>${esc(value)}</strong></div>`).join("")}</div>
            ${crew}
            ${providerList.length ? `<p class="lede" style="margin-top:14px">Streaming providers listed by TMDB: ${esc([...new Set(providerList)].slice(0, 6).join(", "))}</p>` : ""}
          </div>
        </div>
        ${cast}
        ${episodes}
        ${related}
        <div class="notice">
          <div>
            <h2>One room for the story.</h2>
            <p>Playback is available only when an authorised source is configured for this title. Otherwise the watch room shows official viewing options rather than pretending a catalogue card is a free stream.</p>
          </div>
          <a class="btn btn-ghost" href="${esc(`/watch/${media.id}?type=${media.type}`)}" data-link>Open watch room ↗</a>
        </div>
      </div>
    </section>`;
  }

  function watchView(media, sources, selectedIndex = 0) {
    const isTv = media.type === "tv";
    const source = sources[selectedIndex] || null;
    const official = providers ? providers.officialUrl(media) : `https://www.themoviedb.org/${isTv ? "tv" : "movie"}/${media.id}/watch`;

    const stage = source
      ? `<div class="stage-mask" id="stageMask">
            <div class="boot-orbit"><img src="/favicon.svg" alt=""></div>
            <strong>Loading stream</strong>
            <small>${esc(source.label)}</small>
          </div>
          ${source.kind === "iframe"
            ? `<iframe id="providerFrame" src="${esc(source.url)}" title="${esc(media.title)} player" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowfullscreen sandbox="${esc(providers.IFRAME_SANDBOX)}" referrerpolicy="origin"></iframe>`
            : `<video id="videoStage" controls playsinline preload="metadata" poster="${esc(img(media.backdrop || media.poster, "w1280"))}"></video>`}`
      : `<div class="fallback">
          <span class="play-glyph" aria-hidden="true">▶</span>
          <span class="kicker">Official viewing only</span>
          <h1>${esc(media.title)}</h1>
          <p>No authorised playback source is configured for this title. Use the official options below instead of an unverified stream.</p>
          <a class="btn btn-accent" href="${esc(official)}" target="_blank" rel="noopener noreferrer">Official viewing options ↗</a>
        </div>`;

    const selector = sources.length > 1
      ? `<label class="source-pick" for="providerSelect">Source
           <select id="providerSelect">
             ${sources.map((item, index) => `<option value="${index}" ${index === selectedIndex ? "selected" : ""}>${esc(item.label)}</option>`).join("")}
           </select>
         </label>`
      : "";

    const status = source
      ? `<div class="stage-status" id="playerStatus" role="status" aria-live="polite"><span class="status-dot" id="statusDot"></span><span id="statusText">Connecting to ${esc(source.label)}…</span></div>`
      : "";

    return `<div class="watch">
      <div class="watch-top">
        <a class="back-link" href="${esc(`/title/${media.id}?type=${media.type}`)}" data-link>← Back to ${esc(media.title)}</a>
        <span class="kicker">Rapiflix / Screening room</span>
      </div>
      <div class="watch-grid">
        <div class="stage-wrap">
          <div class="stage-shell">
            <div class="stage-deck"><span>Rapiflix screening room</span><b>Screen 01${isTv ? ` · S${media.season || 1} E${media.episode || 1}` : ""}</b></div>
            <div class="stage" id="playerStage" data-kind="${esc(source?.kind || "none")}" data-source="${esc(source?.id || "")}">${stage}</div>
          </div>
          ${status}
          <div class="stage-tools">
            ${selector}
            ${source ? `<button class="btn btn-quiet" type="button" data-retry-player>↺ Reload stream</button>` : ""}
            <a class="btn btn-quiet" href="${esc(official)}" target="_blank" rel="noopener noreferrer">Official options ↗</a>
          </div>
          ${isTv ? `<nav class="episode-nav" id="episodeNav" aria-label="Episode navigation"></nav>` : ""}
        </div>
        <aside class="watch-aside">
          <span class="kicker">Now playing${isTv ? ` · S${media.season || 1} E${media.episode || 1}` : ""}</span>
          <h1>${esc(media.title)}</h1>
          <p class="lede">${esc(media.overview || "No synopsis is available for this title yet.")}</p>
          <div class="aside-facts">
            <span><small>Released</small><b>${esc(media.year || "—")}</b></span>
            <span><small>Rating</small><b>${esc(ratingText(media.rating))}</b></span>
            <span><small>Runtime</small><b>${esc(runtimeOf(media.runtime) || "—")}</b></span>
            <span><small>Type</small><b>${esc(typeLabel(media.type))}</b></span>
          </div>
          <div class="aside-links">
            <a class="btn btn-ghost" href="${esc(`/title/${media.id}?type=${media.type}`)}" data-link>Full details ↗</a>
            <a class="btn btn-ghost" href="${esc(official)}" target="_blank" rel="noopener noreferrer">Official options ↗</a>
          </div>
        </aside>
      </div>
    </div>`;
  }

  /* ---------- hero rotation ---------- */
  function setupHero(items) {
    clearInterval(state.hero.timer);
    const hero = $("[data-hero]");
    if (!hero || items.length < 2 || ui.reduce) return;

    state.hero.items = items;
    state.hero.index = 0;
    state.hero.paused = false;
    let layer = "a";

    hero.addEventListener("pointerenter", () => { state.hero.paused = true; });
    hero.addEventListener("pointerleave", () => { state.hero.paused = false; });

    state.hero.timer = window.setInterval(() => {
      if (state.hero.paused || document.hidden || !hero.isConnected) return;
      const list = state.hero.items;
      state.hero.index = (state.hero.index + 1) % list.length;
      const item = list[state.hero.index];
      const next = layer === "a" ? "b" : "a";
      const nextImage = $(`[data-hero-layer="${next}"]`);
      const activeImage = $(`[data-hero-layer="${layer}"]`);
      const nextPoster = $(`[data-hero-poster="${next}"]`);
      const activePoster = $(`[data-hero-poster="${layer}"]`);

      hero.classList.add("is-swapping");
      const applyPosters = () => {
        if (!hero.isConnected) return;
        nextImage?.classList.add("is-on");
        activeImage?.classList.remove("is-on");
        nextImage && nextPoster && nextPoster.closest(".hero-poster")?.classList.remove("is-off");
        activePoster?.closest(".hero-poster")?.classList.add("is-off");
        hero.classList.remove("is-swapping");
      };

      if (nextImage) {
        nextImage.src = img(item.backdrop, "w1280");
        if (nextImage.complete) applyPosters();
        else nextImage.addEventListener("load", applyPosters, { once: true });
      } else {
        applyPosters();
      }
      if (nextPoster) nextPoster.src = img(item.poster, "w500");

      const title = $("[data-hero-title]", hero);
      const meta = $("[data-hero-meta]", hero);
      const overview = $("[data-hero-overview]", hero);
      const kind = $("[data-hero-kind]", hero);
      const folio = $("[data-hero-folio]", hero);
      const ghost = $("[data-hero-ghost]", hero);
      const watch = $("[data-hero-watch]", hero);
      const details = $("[data-hero-details]", hero);
      if (title) title.textContent = item.title;
      if (meta) meta.textContent = [item.year || "", ratingText(item.rating), typeLabel(item.type)].filter(Boolean).join(" · ");
      if (overview) overview.textContent = item.overview || "No synopsis is available for this title yet.";
      if (kind) kind.textContent = typeLabel(item.type);
      if (folio) folio.textContent = `${String(state.hero.index + 1).padStart(2, "0")} / ${String(list.length).padStart(2, "0")}`;
      if (ghost) ghost.textContent = String(state.hero.index + 1).padStart(2, "0");
      $$("[data-hero-ticks] i", hero).forEach((tick, index) => tick.classList.toggle("is-on", index === state.hero.index));
      if (watch) watch.href = `/watch/${item.id}?type=${item.type}`;
      if (details) details.href = `/title/${item.id}?type=${item.type}`;

      layer = next;
    }, 9000);
  }

  /* ---------- player ---------- */
  function teardownPlayer() {
    state.player.timers.forEach((timer) => clearTimeout(timer));
    state.player.timers = [];
    if (state.player.hls) {
      try { state.player.hls.destroy(); } catch (_) {}
      state.player.hls = null;
    }
    const video = $("#videoStage");
    if (video) {
      try { video.pause(); video.removeAttribute("src"); video.load(); } catch (_) {}
    }
    state.player.frame = null;
  }

  function setStatus(text, level) {
    const target = $("#statusText");
    const dotEl = $("#statusDot");
    if (target) target.textContent = text;
    if (dotEl) {
      dotEl.classList.toggle("is-live", level === "live");
      dotEl.classList.toggle("is-warn", level === "warn");
    }
  }

  function hideMask() {
    const mask = $("#stageMask");
    if (!mask || mask.classList.contains("is-gone")) return;
    mask.classList.add("is-gone");
    state.player.timers.push(setTimeout(() => mask.remove(), 600));
  }

  async function setupPlayer(media, sources) {
    const source = sources[0];
    if (!source) return;
    const stage = $("#playerStage");
    if (!stage) return;

    if (source.kind === "iframe") {
      const frame = $("#providerFrame");
      if (!frame) return;
      state.player.frame = frame;

      let settled = false;
      const loaded = () => {
        settled = true;
        hideMask();
        setStatus("Player loaded. Press play inside the frame — Rapiflix cannot verify the provider's playback state.", "live");
      };
      frame.addEventListener("load", loaded, { once: true });

      /* A cross-origin frame can stay blank forever; never spin indefinitely. */
      state.player.timers.push(setTimeout(() => {
        if (settled || !frame.isConnected) return;
        hideMask();
        setStatus("The provider did not finish loading. Reload the stream or use official options.", "warn");
      }, 14000));
      return;
    }

    const video = $("#videoStage");
    if (!video) return;

    if (source.kind === "hls") {
      try {
        const Hls = await providers.loadHls();
        if (!video.isConnected) return;
        if (Hls.isSupported()) {
          const hls = new Hls({ enableWorker: true, lowLatencyMode: false });
          state.player.hls = hls;
          hls.loadSource(source.url);
          hls.attachMedia(video);
          hls.on(Hls.Events.MANIFEST_PARSED, () => { hideMask(); setStatus("Stream ready. Press play.", "live"); });
          hls.on(Hls.Events.ERROR, (_event, data) => {
            if (data?.fatal) setStatus("The HLS stream failed. Reload or use official options.", "warn");
          });
        } else {
          video.src = source.url;
          hideMask();
          setStatus("HLS is not supported in this browser. Try another source.", "warn");
        }
      } catch (error) {
        hideMask();
        setStatus(error.message || "The HLS library could not be loaded.", "warn");
      }
      return;
    }

    video.src = source.url;
    video.addEventListener("loadedmetadata", () => { hideMask(); setStatus("Stream ready. Press play.", "live"); }, { once: true });
    video.addEventListener("error", () => { hideMask(); setStatus("This video file could not be played. Check the source or use official options.", "warn"); }, { once: true });
  }

  async function setupEpisodeNav(media) {
    const nav = $("#episodeNav");
    if (!nav) return;
    try {
      const episodes = await seasonEpisodes(media.id, media.season || 1);
      if (!nav.isConnected) return;
      const index = episodes.findIndex((episode) => episode.number === Number(media.episode || 1));
      const previous = index > 0 ? episodes[index - 1] : null;
      const next = index >= 0 && index < episodes.length - 1 ? episodes[index + 1] : null;
      const link = (episode, direction) => `<a class="${direction}" href="/watch/${media.id}?type=tv&season=${media.season || 1}&episode=${episode.number}" data-link>
        <small>${direction === "next" ? "Next episode" : "Previous episode"}</small>
        <strong>E${String(episode.number).padStart(2, "0")} · ${esc(episode.name || "Untitled")}</strong>
      </a>`;
      nav.innerHTML = `${previous ? link(previous, "prev") : ""}${next ? link(next, "next") : ""}`;
      if (!nav.innerHTML) nav.remove();
    } catch (_) {
      nav.remove();
    }
  }

  async function setupSeasonBrowser(media) {
    const select = $("#seasonSelect");
    const container = $("#seasonEpisodes");
    if (!select || !container) return;

    const load = async () => {
      const season = Number(select.value || 0);
      container.innerHTML = `<div class="episode-skel">${Array.from({ length: 3 }, () => `<div class="sk sk-line" style="height:56px"></div>`).join("")}</div>`;
      try {
        const episodes = await seasonEpisodes(media.id, season);
        if (!container.isConnected) return;
        if (!episodes.length) {
          container.innerHTML = `<p class="lede">No episode details are available for this season.</p>`;
          return;
        }
        container.innerHTML = episodes.map((episode) => `<article class="episode">
          <span class="episode-no">E${String(episode.number).padStart(2, "0")}</span>
          <div class="episode-copy">
            <strong>${esc(episode.name || `Episode ${episode.number}`)}</strong>
            <p>${esc(episode.overview || "Episode synopsis is not available.")}</p>
            <small>${[episode.airDate, episode.runtime ? `${episode.runtime} min` : ""].filter(Boolean).map(esc).join(" · ") || "Details unavailable"}</small>
          </div>
          <a class="episode-watch" href="/watch/${esc(media.id)}?type=tv&season=${esc(season)}&episode=${esc(episode.number)}" data-link>Watch ↗</a>
        </article>`).join("");
      } catch (error) {
        if (container.isConnected) container.innerHTML = `<p class="lede">${esc(error.message || "Episodes could not be loaded.")}</p>`;
      }
    };

    select.addEventListener("change", load);
    await load();
  }

  /* ---------- binding ---------- */
  function bindView(r) {
    $$("[data-retry]").forEach((button) => button.addEventListener("click", () => {
      state.cache.clear();
      state.feeds = {};
      render();
    }));

    $$("[data-open-search]").forEach((button) => button.addEventListener("click", () => ui.openSearch?.()));

    $$("[data-sort]").forEach((button) => button.addEventListener("click", async () => {
      state.sort = button.dataset.sort === "rating" ? "rating" : "popularity";
      const page = ["movies", "series", "anime"].includes(r.page) ? r.page : "movies";
      delete state.feeds[page];
      await render();
    }));

    $$("[data-more]").forEach((button) => button.addEventListener("click", async () => {
      button.disabled = true;
      const label = button.textContent;
      button.textContent = "Loading…";
      try {
        if (r.page === "new") {
          const feed = state.feeds.new;
          const pageNum = (feed?.page || 1) + 1;
          const [movies, series] = await Promise.allSettled([loadNewPage("movie", pageNum), loadNewPage("tv", pageNum)]);
          if (feed) {
            if (movies.status === "fulfilled") feed.movies = mergeUnique(feed.movies, movies.value.items);
            if (series.status === "fulfilled") feed.series = mergeUnique(feed.series, series.value.items);
            feed.page = pageNum;
            feed.total = Math.max(movies.value?.total || 1, series.value?.total || 1, 1);
          }
        } else {
          await loadFeed(r.page, {
            pageNum: (state.feeds[r.page]?.page || 1) + 1,
            append: true,
            genre: r.genre || "",
            sort: state.sort
          });
        }
        render();
      } catch (error) {
        button.disabled = false;
        button.textContent = label;
        toast(error.message || "Could not load more titles.");
      }
    }));

    $$("[data-rail]").forEach((button) => button.addEventListener("click", () => {
      const track = $(`#rail-${CSS.escape(button.dataset.railTarget)}`);
      if (!track) return;
      const direction = button.dataset.rail === "next" ? 1 : -1;
      track.scrollBy({ left: direction * Math.max(240, track.clientWidth * 0.8), behavior: ui.reduce ? "auto" : "smooth" });
    }));

    $$("[data-save]").forEach((button) => button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const id = String(button.dataset.save);
      const adding = !state.favorites.has(id);
      if (adding) state.favorites.add(id);
      else state.favorites.delete(id);
      saveFavorites();
      $$(`[data-save="${CSS.escape(id)}"]`).forEach((element) => {
        element.classList.toggle("is-saved", adding);
        element.setAttribute("aria-pressed", String(adding));
        if (element.closest(".title-copy")) element.textContent = adding ? "♥ Saved" : "♡ Save title";
        else element.textContent = adding ? "♥" : "♡";
      });
      toast(adding ? "Saved to your list" : "Removed from your list");
    }));

    $$("[data-open]").forEach((element) => element.addEventListener("click", (event) => {
      if (event.target.closest("[data-save]")) return;
      go(`/title/${element.dataset.open}?type=${element.dataset.type || "movie"}`);
    }));

    $$("[data-retry-player]").forEach((button) => button.addEventListener("click", () => render({ keepScroll: true })));

    const providerSelect = $("#providerSelect");
    providerSelect?.addEventListener("change", () => {
      state.providerIndex = Number(providerSelect.value) || 0;
      render({ keepScroll: true });
    });

    if (r.page === "title" && r.media) {
      if (r.media.type === "tv") setupSeasonBrowser(r.media);
    }
    if (r.page === "watch" && r.media && r.sources) {
      const active = r.sources[r.sourceIndex] ? [r.sources[r.sourceIndex], ...r.sources.filter((_, position) => position !== r.sourceIndex)] : [];
      setupPlayer(r.media, active);
      if (r.media.type === "tv") setupEpisodeNav(r.media);
    }
  }

  function mergeUnique(current, addition) {
    const list = current || [];
    return [...list, ...addition.filter((item) => !list.some((existing) => existing.id === item.id))];
  }

  async function loadNewPage(type, pageNum) {
    const params = new URLSearchParams({
      sort_by: type === "tv" ? "first_air_date.desc" : "primary_release_date.desc",
      page: String(pageNum),
      include_adult: "false"
    });
    if (type === "tv") {
      params.set("first_air_date.gte", lastYear());
      params.set("first_air_date.lte", today());
    } else {
      params.set("primary_release_date.gte", lastYear());
      params.set("primary_release_date.lte", today());
    }
    const data = await api(`discover/${type}?${params.toString()}`, { ttl: 240000 });
    return {
      items: (data.results || []).map((item) => normalise(item, type)).filter((item) => item.poster),
      total: Math.min(Number(data.total_pages) || 1, 500)
    };
  }

  /* ---------- render ---------- */
  async function render({ keepScroll = false } = {}) {
    const token = ++renderToken;
    const r = route();
    state.route = r;
    teardownPlayer();
    clearInterval(state.hero.timer);
    setActive(r.page);
    document.body.dataset.page = r.page;
    if (!keepScroll) window.scrollTo({ top: 0, behavior: "auto" });
    if (r.page !== "search") state.sort = state.sort || "popularity";

    try {
      if (r.page === "home") {
        if (!state.feeds.home) app.innerHTML = skeletonFor(r);
        const feed = await loadHome();
        if (token !== renderToken) return;
        app.innerHTML = homeView(feed);
        setTitle("");
        setupHero((feed.featured || []).filter((item) => item.backdrop).slice(0, 5));
        bindView(r);
        return;
      }

      if (["movies", "series", "anime"].includes(r.page)) {
        const feed = state.feeds[r.page];
        const needsFeed = !feed || feed.genre !== (r.genre || "") || feed.sort !== state.sort;
        if (needsFeed) app.innerHTML = skeletonFor(r);
        if (needsFeed) await loadFeed(r.page, { genre: r.genre || "", sort: state.sort });
        if (token !== renderToken) return;
        app.innerHTML = listingView(r);
        setTitle(r.page === "movies" ? (r.genre ? `${r.genre} films` : "Movies") : r.page === "series" ? "Series" : "Anime");
        bindView(r);
        return;
      }

      if (r.page === "new") {
        if (!state.feeds.new) app.innerHTML = skeletonFor(r);
        if (!state.feeds.new) {
          const [movies, series] = await Promise.allSettled([loadNewPage("movie", 1), loadNewPage("tv", 1)]);
          if (token !== renderToken) return;
          if (movies.status === "rejected" && series.status === "rejected") throw movies.reason;
          state.feeds.new = {
            movies: movies.status === "fulfilled" ? movies.value.items : [],
            series: series.status === "fulfilled" ? series.value.items : [],
            page: 1,
            total: Math.max(movies.value?.total || 1, series.value?.total || 1, 1)
          };
        }
        if (token !== renderToken) return;
        app.innerHTML = newView();
        setTitle("New releases");
        bindView(r);
        return;
      }

      if (r.page === "search") {
        app.innerHTML = skeletonFor(r);
        const result = await searchCatalog(r.query);
        if (token !== renderToken) return;
        app.innerHTML = searchView(result);
        setTitle(result.term ? `Search: ${result.term}` : "Search");
        bindView(r);
        return;
      }

      if (r.page === "title" || r.page === "watch") {
        app.innerHTML = skeletonFor(r);
        const media = await titleData(r.id, r.type);
        if (token !== renderToken) return;
        if (r.page === "watch") {
          const watchMedia = { ...media, season: r.season, episode: r.episode };
          const sources = providers.sources(state.streams, watchMedia);
          const key = `${watchMedia.id}:${r.season}:${r.episode}`;
          if (state.providerKey !== key) { state.providerKey = key; state.providerIndex = 0; }
          const index = Math.min(state.providerIndex, Math.max(0, sources.length - 1));
          app.innerHTML = watchView(watchMedia, sources, index);
          setTitle(`Watch ${watchMedia.title}`);
          bindView({ ...r, media: watchMedia, sources, sourceIndex: index });
        } else {
          app.innerHTML = titleView(media);
          setTitle(media.title);
          bindView({ ...r, media });
        }
        return;
      }

      app.innerHTML = errorState(new Error("That route does not exist."), false);
    } catch (error) {
      if (token !== renderToken) return;
      app.innerHTML = errorState(error, true);
      bindView({ ...r, media: null, sources: null });
      setTitle("Unavailable");
    }
  }

  /* ---------- global wiring ---------- */
  document.addEventListener("click", (event) => {
    const link = event.target.closest("a[data-link]");
    if (!link) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    const url = new URL(link.href, location.href);
    if (url.origin !== location.origin) return;
    event.preventDefault();
    const target = url.pathname + url.search;
    if (target === location.pathname + location.search) return;
    go(target);
  });

  window.addEventListener("popstate", () => render());

  window.addEventListener("error", () => toast("Something went wrong on this page. Reload if it keeps happening."));
  window.addEventListener("unhandledrejection", (event) => {
    event.preventDefault?.();
    toast(event.reason?.message || "A request failed. Try again.");
  });

  async function init() {
    await loadStreams();
    await render();
  }

  window.RapiflixApp = { go, render };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
