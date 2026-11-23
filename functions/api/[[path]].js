/*
 * Catch-all for /api/* paths that have no dedicated function.
 *
 * _routes.json opts every API path into Pages Functions, so unmatched routes
 * reach here instead of the static-asset router and its SPA HTML fallback.
 */
const jsonHeaders = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff"
};

export async function onRequest({ request }) {
  const pathname = new URL(request.url).pathname.slice(0, 160);
  return new Response(JSON.stringify({
    error: "This Rapiflix API route does not exist.",
    path: pathname
  }), {
    status: 404,
    headers: jsonHeaders
  });
}
