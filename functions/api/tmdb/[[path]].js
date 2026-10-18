const ALLOWED = [
  /^genre\/(movie|tv)\/list$/,
  /^trending\/(movie|tv|all)\/(day|week)$/,
  /^discover\/(movie|tv)$/,
  /^movie\/(now_playing|upcoming|popular|top_rated)$/,
  /^tv\/(airing_today|on_the_air|popular|top_rated)$/,
  /^search\/(movie|tv|multi)$/,
  /^movie\/[1-9][0-9]*\/watch\/providers$/,
  /^tv\/[1-9][0-9]*\/watch\/providers$/,
  /^movie\/[1-9][0-9]*\/videos$/,
  /^tv\/[1-9][0-9]*\/videos$/,
  /^movie\/[1-9][0-9]*$/,
  /^tv\/[1-9][0-9]*$/,
  /^tv\/[1-9][0-9]*\/season\/[0-9]+$/
];

const ACCEPTED_PARAMS = new Set([
  "language", "region", "page", "query", "sort_by",
  "primary_release_date.gte", "primary_release_date.lte",
  "first_air_date.gte", "first_air_date.lte",
  "with_genres", "with_original_language", "include_adult",
  "vote_count.gte", "vote_average.gte", "vote_average.lte",
  "with_runtime.gte", "with_runtime.lte", "with_watch_providers",
  "watch_region", "include_video", "year", "primary_release_year",
  "first_air_date_year", "append_to_response"
]);

const errorResponse = (message, status) => new Response(JSON.stringify({ error: message }), {
  status,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  }
});

export async function onRequest(context) {
  const { request, env, params } = context;

  if (request.method !== "GET") {
    return errorResponse("Only GET requests are supported.", 405);
  }

  if (!env.TMDB_API_KEY) {
    return errorResponse("TMDB is not configured. Set TMDB_API_KEY as a Cloudflare Pages secret, or in rapiflix/.dev.vars for local development.", 503);
  }

  const pathParts = Array.isArray(params.path) ? params.path : [params.path || ""];
  const path = pathParts.join("/");
  if (!ALLOWED.some((pattern) => pattern.test(path))) {
    return errorResponse("This TMDB endpoint is not available through Rapiflix.", 404);
  }

  const incoming = new URL(request.url);
  const upstream = new URL("https://api.themoviedb.org/3/" + path);

  for (const [key, value] of incoming.searchParams.entries()) {
    if (ACCEPTED_PARAMS.has(key)) {
      upstream.searchParams.set(key, value.slice(0, 160));
    }
  }
  upstream.searchParams.set("api_key", env.TMDB_API_KEY);

  try {
    const upstreamResponse = await fetch(upstream.toString(), {
      headers: { "Accept": "application/json" },
      cf: { cacheTtl: 240, cacheEverything: true }
    });
    const body = await upstreamResponse.text();

    return new Response(body, {
      status: upstreamResponse.status,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": upstreamResponse.ok ? "public, max-age=60, s-maxage=240" : "no-store",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (_) {
    return errorResponse("The TMDB service could not be reached.", 502);
  }
}
