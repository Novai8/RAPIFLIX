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
    return json({ status: "ok", endpoint: "assistant-chat", geminiConfigured: Boolean(env.GEMINI_API_KEY), aiBindingAvailable: Boolean(env.AI && typeof env.AI.run === "function") });
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

  if (!env.GEMINI_API_KEY && (!env.AI || typeof env.AI.run !== "function")) {
    return json({ error: "Conversational AI is not configured. Add a Gemini API key secret named GEMINI_API_KEY or enable the Workers AI binding named AI." }, 503);
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
    // User input is intentionally capped at 1000 characters. Assistant replies
    // can be longer, so allow a larger limit for prior model-generated history.
    const maxLength = item.role === "user" ? 1000 : 4000;
    if (!content || content.length > maxLength) {
      return json({
        error: item.role === "user"
          ? "Each user message must be between 1 and 1000 characters."
          : "Previous assistant replies must be between 1 and 4000 characters."
      }, 400);
    }
    messages.push({ role: item.role, content });
  }
  if (messages[messages.length - 1].role !== "user") {
    return json({ error: "The latest message must be from the user." }, 400);
  }

  const catalogue = Array.isArray(body.catalogue) ? body.catalogue.slice(0, 24).filter((item) =>
    item && typeof item.title === "string" && item.title.length <= 160 &&
    (item.type === "movie" || item.type === "tv")
  ).map((item) => ({
    title: item.title,
    type: item.type,
    year: typeof item.year === "string" ? item.year.slice(0, 4) : "",
    rating: Number.isFinite(Number(item.rating)) ? Number(item.rating) : null,
    overview: typeof item.overview === "string" ? item.overview.slice(0, 220) : ""
  })) : [];

  const systemText = [
    "You are Rapiflix's accurate conversational film and TV guide. Answer the user's actual latest question, not an earlier topic. Do not reuse a previous recommendation list when the subject changes. Never invent movie titles, release dates, ratings, franchise membership, or streaming availability.",
    catalogue.length
      ? "The supplied titles are a relevant live-discovery slice from Rapiflix's TMDB-powered movie and TV catalogue, not the entire catalogue in one prompt. For recommendations, use ONLY titles in this verified current slice and never invent extra titles. Explain briefly why they fit and acknowledge when the matches are imperfect. Catalogue slice (" + catalogue.length + " titles): " + JSON.stringify(catalogue)
      : "No verified catalogue shortlist was supplied for this message. You may answer general factual questions, but if the user asks for recommendations or a list of titles, do not name movies from memory; explain that you could not verify a current shortlist. Never present guesses as verified catalogue results or claim a title is available to stream on Rapiflix.",
    "Keep replies concise, natural, and useful. Distinguish Marvel Studios / MCU releases from other films based on actual metadata. Do not claim to play or stream content yourself."
  ].join("\n");

  try {
    let reply = "";
    let usedModel = "";
    if (env.GEMINI_API_KEY) {
      usedModel = "gemini-3.8-flash";
      const history = messages.map((item) => ({
        role: item.role === "assistant" ? "model" : "user",
        parts: [{ text: item.content }]
      }));
      const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=" + encodeURIComponent(env.GEMINI_API_KEY), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemText }] },
          contents: history,
          generationConfig: { maxOutputTokens: 500, temperature: 0.35 }
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error("Gemini API HTTP " + response.status + ": " + String(payload?.error?.message || "request failed").slice(0, 350));
      reply = payload?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim() || "";
      if (!reply) throw new Error("Gemini returned an empty response");
    } else {
      usedModel = "@cf/meta/llama-3.1-8b-instruct-fp8";
      const prompt = [{ role: "system", content: systemText }, ...messages];
      const result = await env.AI.run(usedModel, {
        messages: prompt,
        max_tokens: 500,
        temperature: 0.35
      });
      reply = typeof result?.response === "string" ? result.response.trim() : "";
      if (!reply) throw new Error("Workers AI returned an empty response");
    }
    return json({ reply, model: usedModel });
  } catch (error) {
    console.error("Rapiflix assistant inference failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
      errorMessage: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
      model: env.GEMINI_API_KEY ? "gemini-3.8-flash" : "@cf/meta/llama-3.1-8b-instruct-fp8"
    });
    return json({ error: "The AI service is temporarily unavailable. Please check the Function logs and try again." }, 502);
  }
}
