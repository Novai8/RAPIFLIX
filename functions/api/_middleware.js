/*
 * Guards every /api/* request.
 *
 * Cloudflare Pages serves the SPA HTML for unmatched static paths. Without this
 * middleware an unknown API route (or a renamed function) answers 200 with the
 * Rapiflix homepage, which clients then try to parse as JSON. API paths must
 * always answer with a JSON error instead.
 */
const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff"
};

export async function onRequest(context) {
  const { request, next } = context;
  const response = await next();
  const contentType = response.headers.get("Content-Type") || "";

  if (response.status === 404 && !contentType.toLowerCase().includes("application/json")) {
    return new Response(JSON.stringify({
      error: "This Rapiflix API route does not exist.",
      path: new URL(request.url).pathname.slice(0, 160)
    }), { status: 404, headers: JSON_HEADERS });
  }

  // API responses are never cached as HTML documents and never share a CDN
  // cache entry with the SPA shell.
  if (contentType.toLowerCase().includes("text/html")) {
    return new Response(JSON.stringify({
      error: "This Rapiflix API route returned an unexpected document."
    }), { status: 502, headers: JSON_HEADERS });
  }

  return response;
}
