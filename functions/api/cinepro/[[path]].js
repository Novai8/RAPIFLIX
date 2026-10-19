const ALLOWED_PATHS = [
  /^v1\/movies\/[1-9][0-9]{0,19}$/,
  /^v1\/tv\/[1-9][0-9]{0,19}\/seasons\/(?:0|[1-9][0-9]?)\/episodes\/[1-9][0-9]{0,3}$/
];

const jsonResponse = (body, status, cacheControl = "no-store") => new Response(JSON.stringify(body), {
  status,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": cacheControl,
    "X-Content-Type-Options": "nosniff"
  }
});

function configuredBase(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value);
    const localHost = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
    if (url.username || url.password) return null;
    if (url.protocol !== "https:" && !(localHost && url.protocol === "http:")) return null;
    if (url.pathname !== "/" || url.search || url.hash) return null;
    return url;
  } catch (_) {
    return null;
  }
}

function absolutizeSourceUrl(value, base) {
  if (typeof value !== "string" || !value.trim()) return value;
  try {
    const url = new URL(value, base);
    if (url.protocol !== "https:" && !(["localhost", "127.0.0.1", "::1"].includes(url.hostname) && url.protocol === "http:")) {
      return null;
    }
    return url.toString();
  } catch (_) {
    return null;
  }
}

export async function onRequest(context) {
  const { request, env, params } = context;

  if (request.method !== "GET") {
    return jsonResponse({ error: "Only GET requests are supported." }, 405);
  }

  const pathParts = Array.isArray(params.path) ? params.path : [params.path || ""];
  const path = pathParts.join("/");
  if (!ALLOWED_PATHS.some((pattern) => pattern.test(path))) {
    return jsonResponse({ error: "This CinePro endpoint is not available through Rapiflix." }, 404);
  }

  const base = configuredBase(env.CINEPRO_BASE_URL);
  if (!base) {
    return jsonResponse({
      error: "CinePro is not configured. Set CINEPRO_BASE_URL to the HTTPS base URL of your own CinePro Core instance."
    }, 503);
  }

  try {
    const upstream = new URL(path, base);
    const upstreamResponse = await fetch(upstream.toString(), {
      headers: { "Accept": "application/json" },
      redirect: "error"
    });
    const text = await upstreamResponse.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch (_) {
      return jsonResponse({ error: "CinePro returned an invalid JSON response." }, 502);
    }

    if (!upstreamResponse.ok) {
      const error = body && body.error;
      return jsonResponse({
        error: typeof error === "string" ? error : (error && typeof error.message === "string" ? error.message : "CinePro source lookup failed.")
      }, upstreamResponse.status);
    }

    if (!body || typeof body !== "object" || !Array.isArray(body.sources) || !Array.isArray(body.subtitles)) {
      return jsonResponse({ error: "CinePro returned an unexpected source response." }, 502);
    }

    body.sources = body.sources.map((source) => {
      if (!source || typeof source !== "object") return null;
      const url = absolutizeSourceUrl(source.url, base);
      return url ? { ...source, url } : null;
    }).filter(Boolean);

    body.subtitles = body.subtitles.map((subtitle) => {
      if (!subtitle || typeof subtitle !== "object") return null;
      const url = absolutizeSourceUrl(subtitle.url, base);
      return url ? { ...subtitle, url } : null;
    }).filter(Boolean);

    return jsonResponse(body, 200);
  } catch (_) {
    return jsonResponse({ error: "The configured CinePro service could not be reached." }, 502);
  }
}
