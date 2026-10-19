const jsonHeaders = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff"
};

export async function onRequestGet() {
  return new Response(JSON.stringify({
    ok: true,
    service: "rapiflix-api"
  }), {
    status: 200,
    headers: jsonHeaders
  });
}
