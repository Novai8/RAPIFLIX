import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => readFile(path.join(root, relativePath), "utf8");

const tmdbSource = await read("functions/api/tmdb/[[path]].js");
const healthSource = await read("functions/api/health.js");

function loadTmdbHandler(fetchImpl) {
  const source = tmdbSource.replace(
    "export async function onRequest(context)",
    "async function onRequest(context)"
  );
  return new Function("fetch", source + "\nreturn onRequest;")(fetchImpl);
}

function loadHealthHandler() {
  const source = healthSource.replace(
    "export async function onRequestGet()",
    "async function onRequestGet()"
  );
  return new Function(source + "\nreturn onRequestGet;")();
}

const endpointPaths = [
  "genre/movie/list",
  "genre/tv/list",
  "trending/movie/day",
  "trending/movie/week",
  "trending/tv/week",
  "trending/all/week",
  "discover/movie",
  "discover/tv",
  "movie/now_playing",
  "movie/upcoming",
  "movie/popular",
  "movie/top_rated",
  "tv/airing_today",
  "tv/on_the_air",
  "tv/popular",
  "tv/top_rated",
  "search/multi",
  "movie/550",
  "tv/1399",
  "movie/550/credits",
  "movie/550/recommendations",
  "movie/550/similar",
  "tv/1399/credits",
  "tv/1399/recommendations",
  "tv/1399/similar",
  "movie/550/watch/providers",
  "tv/1399/watch/providers",
  "movie/550/videos",
  "tv/1399/videos",
  "movie/550/translations",
  "tv/1399/translations",
  "tv/1399/season/1"
];

function fixtureFor(endpoint) {
  if (endpoint.startsWith("genre/")) return { genres: [{ id: 18, name: "Drama" }] };
  if (endpoint.endsWith("/watch/providers")) return { id: 550, results: { PK: { link: "https://www.themoviedb.org/" } } };
  if (endpoint.endsWith("/translations")) return { id: 550, translations: [] };
  if (endpoint.endsWith("/credits")) return { id: 550, cast: [], crew: [] };
  if (/^tv\/\d+\/season\/\d+$/.test(endpoint)) return { id: 1, season_number: 1, episodes: [] };
  if (/^(movie|tv)\/\d+$/.test(endpoint)) return endpoint.startsWith("tv/")
    ? { id: 1399, name: "Fixture Series", genres: [], status: "Returning Series" }
    : { id: 550, title: "Fixture Film", genres: [], status: "Released" };
  if (endpoint.endsWith("/videos")) return { id: 550, results: [] };
  return { page: 1, results: [{ id: 550, title: "Fixture Film" }], total_pages: 1, total_results: 1 };
}

function assertEndpointShape(endpoint, body) {
  if (endpoint.startsWith("genre/")) {
    assert.ok(Array.isArray(body.genres), endpoint + " must return a genres array");
  } else if (/^movie\/\d+$/.test(endpoint)) {
    assert.equal(typeof body.id, "number", endpoint + " must return a numeric id");
    assert.equal(typeof body.title, "string", endpoint + " must return a title");
  } else if (/^tv\/\d+$/.test(endpoint)) {
    assert.equal(typeof body.id, "number", endpoint + " must return a numeric id");
    assert.equal(typeof body.name, "string", endpoint + " must return a series name");
  } else if (endpoint.endsWith("/credits")) {
    assert.ok(Array.isArray(body.cast), endpoint + " must return cast[]");
    assert.ok(Array.isArray(body.crew), endpoint + " must return crew[]");
  } else if (endpoint.endsWith("/watch/providers")) {
    assert.ok(body.results && typeof body.results === "object" && !Array.isArray(body.results), endpoint + " must return a region-keyed results object");
  } else if (endpoint.endsWith("/translations")) {
    assert.ok(Array.isArray(body.translations), endpoint + " must return translations[]");
  } else if (/^tv\/\d+\/season\/\d+$/.test(endpoint)) {
    assert.ok(Array.isArray(body.episodes), endpoint + " must return episodes[]");
  } else {
    assert.ok(Array.isArray(body.results), endpoint + " must return results[]");
  }
}

test("TMDB proxy rejects non-GET requests with a JSON error contract", async () => {
  let upstreamCalled = false;
  const handler = loadTmdbHandler(async () => { upstreamCalled = true; return new Response("{}"); });
  const response = await handler({
    request: new Request("https://rapiflix.test/api/tmdb/trending/movie/week", { method: "POST" }),
    env: { TMDB_API_KEY: "test-key" },
    params: { path: ["trending", "movie", "week"] }
  });
  assert.equal(response.status, 405);
  assert.match(response.headers.get("content-type") || "", /application\/json/);
  assert.equal(typeof (await response.json()).error, "string");
  assert.equal(upstreamCalled, false);
});

test("TMDB proxy reports a missing production secret without leaking configuration", async () => {
  let upstreamCalled = false;
  const handler = loadTmdbHandler(async () => { upstreamCalled = true; return new Response("{}"); });
  const response = await handler({
    request: new Request("https://rapiflix.test/api/tmdb/trending/movie/week"),
    env: {},
    params: { path: ["trending", "movie", "week"] }
  });
  const body = await response.json();
  assert.equal(response.status, 503);
  assert.equal(typeof body.error, "string");
  assert.equal(upstreamCalled, false);
});

test("TMDB proxy rejects endpoints outside its allowlist", async () => {
  let upstreamCalled = false;
  const handler = loadTmdbHandler(async () => { upstreamCalled = true; return new Response("{}"); });
  const response = await handler({
    request: new Request("https://rapiflix.test/api/tmdb/configuration"),
    env: { TMDB_API_KEY: "test-key" },
    params: { path: ["configuration"] }
  });
  assert.equal(response.status, 404);
  assert.equal(typeof (await response.json()).error, "string");
  assert.equal(upstreamCalled, false);
});

for (const endpoint of endpointPaths) {
  test("TMDB contract: GET /api/tmdb/" + endpoint, async () => {
    let upstreamUrl;
    let upstreamOptions;
    const fixture = fixtureFor(endpoint);
    const handler = loadTmdbHandler(async (url, options) => {
      upstreamUrl = new URL(url);
      upstreamOptions = options;
      return new Response(JSON.stringify(fixture), {
        status: 200,
        headers: { "Content-Type": "application/json; charset=utf-8" }
      });
    });
    const pathSegments = endpoint.split("/");
    const response = await handler({
      request: new Request("https://rapiflix.test/api/tmdb/" + endpoint + "?language=en-US&region=PK&ignored=drop-me"),
      env: { TMDB_API_KEY: "contract-test-key" },
      params: { path: pathSegments }
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") || "", /application\/json/);
    assert.match(response.headers.get("cache-control") || "", /max-age=60/);
    assert.equal(upstreamUrl.origin, "https://api.themoviedb.org");
    assert.equal(upstreamUrl.pathname, "/3/" + endpoint);
    assert.equal(upstreamUrl.searchParams.get("api_key"), "contract-test-key");
    assert.equal(upstreamUrl.searchParams.get("language"), "en-US");
    assert.equal(upstreamUrl.searchParams.get("region"), "PK");
    assert.equal(upstreamUrl.searchParams.has("ignored"), false);
    assert.equal(upstreamOptions.headers.Accept, "application/json");
    const body = await response.json();
    assert.deepEqual(body, fixture);
    assertEndpointShape(endpoint, body);
  });
}

test("TMDB proxy preserves upstream error status and disables shared caching on errors", async () => {
  const handler = loadTmdbHandler(async () => new Response(JSON.stringify({ status_message: "fixture error" }), {
    status: 401,
    headers: { "Content-Type": "application/json" }
  }));
  const response = await handler({
    request: new Request("https://rapiflix.test/api/tmdb/trending/movie/week"),
    env: { TMDB_API_KEY: "contract-test-key" },
    params: { path: ["trending", "movie", "week"] }
  });
  assert.equal(response.status, 401);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal((await response.json()).status_message, "fixture error");
});

test("TMDB proxy maps upstream network failures to a JSON 502", async () => {
  const handler = loadTmdbHandler(async () => { throw new Error("fixture network failure"); });
  const response = await handler({
    request: new Request("https://rapiflix.test/api/tmdb/trending/movie/week"),
    env: { TMDB_API_KEY: "contract-test-key" },
    params: { path: ["trending", "movie", "week"] }
  });
  assert.equal(response.status, 502);
  assert.equal(typeof (await response.json()).error, "string");
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("health endpoint returns only the public health contract", async () => {
  const handler = loadHealthHandler();
  const response = await handler();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /application\/json/);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { ok: true, service: "rapiflix-api" });
});

test("front-end title, playback, and poster contracts remain wired", async () => {
  const [app, routes, html, css] = await Promise.all([
    read("app.js"), read("routes.js"), read("index.html"), read("styles.css")
  ]);
  assert.match(html, /id="modalBackdrop"/);
  assert.match(html, /id="modalPlay"/);
  assert.match(html, /id="detailPage"/);
  assert.match(html, /id="detailWatchNow"/);
  assert.match(html, /id="detailCast"/);
  assert.match(app, /location\.assign\('\/details\//);
  assert.match(app, /\$\('#modalPlay'\)\.addEventListener\('click'/);
  assert.match(app, /\$\('#detailWatchNow'\)\.addEventListener\('click'/);
  assert.match(app, /document\.addEventListener\('rapiflix:detail-page'/);
  assert.match(routes, /path\.startsWith\('\/details\/'\)/);
  assert.match(routes, /new CustomEvent\('rapiflix:detail-page'/);
  assert.match(css, /\.modal-backdrop,\.player-backdrop\{/);
  assert.match(css, /\[hidden\]\{display:none!important\}/);
  assert.match(css, /\.cursor-dot,\.cursor-ring\{[^}]*pointer-events:none/s);
  assert.match(css, /\.mouse-glow\{[^}]*pointer-events:none/s);
  for (const selector of ["\.hero-poster img", "\.movie-card img", "\.modal-poster img", "\.detail-poster-wrap img", "\.detail-related-poster img", "\.search-suggestion-art img"]) {
    const position = css.indexOf(selector.replace(/\\/g, ""));
    assert.notEqual(position, -1, "missing poster object-fit rule for " + selector);
  }
  assert.match(css, /object-fit: contain !important/);
});
