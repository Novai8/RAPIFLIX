const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  }
});

export async function onRequest({ request, env }) {
  // Safe health check confirms the function and binding without exposing secrets.
  if (request.method === "GET") {
    return json({ status: "ok", endpoint: "assistant-chat", aiBindingAvailable: Boolean(env.AI && typeof env.AI.run === "function") });
  }
  if (request.method !== "POST") {
    return json({ error: "Only GET and POST requests are supported." }, 405);
  }

  const origin = request.headers.get("Origin");
  const requestUrl = new URL(request.url);
  if (origin) {
    try {
      if (new URL(origin).host !== requestUrl.host) {
        return json({ error: "Cross-origin requests are not allowed." }, 403);
      }
    } catch {
      return json({ error: "Invalid request origin." }, 403);
    }
  }

  if (!env.AI || typeof env.AI.run !== "function") {
    return json({
      error: "Conversational AI is not enabled for this deployment yet. In Cloudflare Pages, add a Workers AI binding named AI and redeploy."
    }, 503);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Please send a valid chat message." }, 400);
  }

  if (!Array.isArray(body.messages) || body.messages.length < 1 || body.messages.length > 12) {
    return json({ error: "The conversation must contain between 1 and 12 messages." }, 400);
  }

  const messages = [];
  for (const item of body.messages) {
    if (!item || !["user", "assistant"].includes(item.role) || typeof item.content !== "string") {
      return json({ error: "Invalid conversation message." }, 400);
    }
    const content = item.content.trim();
    if (!content || content.length > 1000) {
      return json({ error: "Each message must be between 1 and 1000 characters." }, 400);
    }
    messages.push({ role: item.role, content });
  }
  if (messages[messages.length - 1].role !== "user") {
    return json({ error: "The latest message must be from the user." }, 400);
  }

  const prompt = [
    {
      role: "system",
      content: "You are Rapiflix's conversational movie and TV discovery guide. Talk naturally and helpfully. Answer questions about films, TV series, anime, genres, themes, viewing moods, and comparisons. Ask a concise clarifying question when the request is vague. When appropriate, suggest a few titles and explain why they fit, but never invent precise catalogue facts, ratings, release dates, or streaming availability. The website has a separate live catalogue recommender that can show title cards. Keep replies readable, concise, and safe for a general audience. Do not claim to play or stream content yourself."
    },
    ...messages
  ];

  try {
    const result = await env.AI.run("@cf/meta/llama-3.1-8b-instruct-fp8", {
      messages: prompt,
      max_tokens: 450,
      temperature: 0.65
    });
    const reply = typeof result?.response === "string" ? result.response.trim() : "";
    if (!reply) return json({ error: "The AI guide could not generate a reply. Please try again." }, 502);
    return json({ reply });
  } catch (error) {
    console.error("Rapiflix assistant inference failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
      errorMessage: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
      model: "@cf/meta/llama-3.1-8b-instruct-fp8"
    });
    return json({ error: "The AI service is temporarily unavailable. Please try again shortly." }, 502);
  }
}
