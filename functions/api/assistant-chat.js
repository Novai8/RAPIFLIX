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

  // Server-side TMDB discovery means recommendations are not limited to pages preloaded in the browser.
  const discovered = [];
  const query = body.catalogueQuery && typeof body.catalogueQuery === "object" ? body.catalogueQuery : {};
  const requestedCount = Math.max(1, Math.min(20, Number(body.requestedCount) || 5));
  const genreIds = { movie: { action:28, adventure:12, animation:16, comedy:35, crime:80, documentary:99, drama:18, family:10751, fantasy:14, history:36, horror:27, music:10402, mystery:9648, romance:10749, science:878, "sci-fi":878, thriller:53, war:10752, western:37 }, tv: { action:10759, adventure:10759, animation:16, comedy:35, crime:80, documentary:99, drama:18, family:10751, fantasy:10765, history:36, horror:9648, mystery:9648, romance:10749, science:10765, "sci-fi":10765, thriller:9648, war:10768, western:37 } };
  const safeQuery = (value, max=80) => typeof value === "string" ? value.trim().slice(0,max) : "";
  async function tmdb(path, params={}) { if (!env.TMDB_API_KEY) return null; const url = new URL("https://api.themoviedb.org/3/" + path); for (const [key,value] of Object.entries(params)) if (value !== undefined && value !== null && value !== "") url.searchParams.set(key,String(value)); url.searchParams.set("api_key",env.TMDB_API_KEY); const response = await fetch(url.toString(),{headers:{Accept:"application/json"},cf:{cacheTtl:240,cacheEverything:true}}); if(!response.ok)return null; return response.json().catch(()=>null); }
  const types = query.type === "tv" ? ["tv"] : query.type === "movie" ? ["movie"] : ["movie","tv"];
  const genres = Array.isArray(query.genres) ? query.genres.map(g=>safeQuery(g,30).toLowerCase()).filter(Boolean).slice(0,3) : [];
  const language = /^(en|hi|ko|ja|fr|es|de|it|zh|ar)$/i.test(safeQuery(query.language,5)) ? query.language : "";
  const year = /^(19\d{2}|20\d{2})$/.test(safeQuery(query.year,4)) ? query.year : "";
  const maxRuntime = Number(query.maxRuntime)>=45 && Number(query.maxRuntime)<=240 ? Number(query.maxRuntime) : 0;
  const pageStart = Math.max(1,Math.min(496,Number(query.pageStart)||1));
  try {
    if (query.franchise === "marvel") {
      const pages = await Promise.all(Array.from({length:2},(_,i)=>tmdb("discover/movie",{page:pageStart+i,include_adult:"false",with_companies:420,sort_by:"vote_count.desc","vote_count.gte":10,"primary_release_date.lte":new Date().toISOString().slice(0,10)})));
      for (const data of pages) for (const item of data?.results||[]) discovered.push({title:item.title||item.name,type:"movie",year:String(item.release_date||"").slice(0,4),rating:Number(item.vote_average||0),voteCount:Number(item.vote_count||0),overview:String(item.overview||"").slice(0,140)});
    } else if (safeQuery(query.topic)) {
      const topic = safeQuery(query.topic).toLowerCase();
      const terms = topic === "cars" ? ["car","racing"] : [topic,topic+" film"];
      const keywordSearches = await Promise.all(terms.map(term=>tmdb("search/keyword",{query:term,page:1})));
      const keywordIds = [...new Set(keywordSearches.flatMap(data=>(data?.results||[]).slice(0,2).map(item=>Number(item.id)).filter(Number.isFinite)))].slice(0,2);
      const batches = await Promise.all(keywordIds.map(async id=>{const pages=await Promise.all(Array.from({length:2},(_,i)=>tmdb("discover/movie",{page:pageStart+i,include_adult:"false",with_keywords:id,sort_by:"vote_count.desc","vote_count.gte":10})));return pages.flatMap(data=>(data?.results||[]).map(item=>({title:item.title||item.name,type:"movie",year:String(item.release_date||"").slice(0,4),rating:Number(item.vote_average||0),overview:String(item.overview||"").slice(0,140)})));}));
      discovered.push(...batches.flat());
    } else if (safeQuery(query.title)) {
      const search = await tmdb("search/multi",{query:safeQuery(query.title),include_adult:"false",page:1}); const match=(search?.results||[]).find(item=>item.media_type==="movie"||item.media_type==="tv");
      if(match){const type=match.media_type==="tv"?"tv":"movie";const pages=await Promise.all(Array.from({length:2},(_,i)=>tmdb(type+"/"+match.id+"/recommendations",{page:pageStart+i})));for(const data of pages)for(const item of data?.results||[])discovered.push({title:item.title||item.name,type,year:String(item.release_date||item.first_air_date||"").slice(0,4),rating:Number(item.vote_average||0),overview:String(item.overview||"").slice(0,140)});}
    } else {
      const batches = await Promise.all(types.map(async type=>{const map=genreIds[type];const ids=[...new Set(genres.map(g=>map[g]).filter(Boolean))];const params={include_adult:"false",sort_by:"vote_count.desc","vote_count.gte":query.rating?10:40};if(ids.length)params.with_genres=ids.join(",");if(language)params.with_original_language=language;if(year)params[type==="tv"?"first_air_date_year":"primary_release_year"]=year;if(maxRuntime&&type==="movie")params["with_runtime.lte"]=maxRuntime;if(query.franchise==="marvel"&&type==="movie")params.with_companies=420;const pages=await Promise.all(Array.from({length:2},(_,i)=>tmdb("discover/"+type,{...params,page:pageStart+i})));return pages.flatMap(data=>(data?.results||[]).map(item=>({title:item.title||item.name,type,year:String(item.release_date||item.first_air_date||"").slice(0,4),rating:Number(item.vote_average||0),overview:String(item.overview||"").slice(0,140)})));}));discovered.push(...batches.flat());
    }
  } catch(error) { console.error("Rapiflix catalogue discovery failed",{errorName:error instanceof Error?error.name:"UnknownError"}); }
  const catalogue = Array.isArray(body.catalogue) ? body.catalogue.slice(0, 100).filter((item) =>
    item && typeof item.title === "string" && item.title.length <= 160 &&
    (item.type === "movie" || item.type === "tv")
  ).map((item) => ({
    title: item.title,
    type: item.type,
    year: typeof item.year === "string" ? item.year.slice(0, 4) : "",
    rating: Number.isFinite(Number(item.rating)) ? Number(item.rating) : null,
    voteCount: Number.isFinite(Number(item.voteCount)) ? Number(item.voteCount) : 0,
    overview: typeof item.overview === "string" ? item.overview.slice(0, 140) : ""
  })) : [];

  const mergedCatalogue = [...discovered, ...catalogue].filter((item,index,all)=>item.title && all.findIndex(other=>other.type===item.type && other.title.toLowerCase()===item.title.toLowerCase())===index).sort((a,b)=>(b.voteCount||0)-(a.voteCount||0)||(b.rating||0)-(a.rating||0)).slice(0,100);
  const lastUserText = messages[messages.length - 1].content;
  const asksForTitles = /\b(recommend|suggest|find|list|top|best|movies?|films?|series|shows?|anime|watch|similar|like|from\s+(?:19|20)\d{2}|\d{4})\b/i.test(lastUserText);

  const systemText = [
    "You are Rapiflix's accurate conversational film and TV guide. Answer the user's actual latest question, not an earlier topic. Do not reuse a previous recommendation list when the subject changes. Never invent movie titles, release dates, ratings, franchise membership, or streaming availability.",
    mergedCatalogue.length
      ? "You have access to a dynamically searched slice of Rapiflix's TMDB-powered movie and TV catalogue. It is not the whole global catalogue in one prompt, but it was searched server-side for this request. Recommend ONLY titles in this verified set and never invent extra titles. Catalogue results (" + mergedCatalogue.length + " titles): " + JSON.stringify(mergedCatalogue)
      : "No verified catalogue shortlist was supplied for this message. You may answer general factual questions, but if the user asks for recommendations or a list of titles, do not name movies from memory; explain that you could not verify a current shortlist. Never present guesses as verified catalogue results or claim a title is available to stream on Rapiflix.",
    "Keep replies concise, natural, and useful. Recommendation results are ranked by TMDB vote count (number of votes), with average rating used only to break ties. Never imply that vote average and vote count are the same metric. The browser displays the exact verified shortlist separately. " + (asksForTitles ? "For this request, do NOT name, list, or recommend any individual title in your reply. Give only one brief conversational introduction; the interface will append the verified ranked shortlist from the same catalogue search, so naming titles here would create contradictory recommendations." : "Answer the user’s question directly and conversationally. If discussing a title, only mention titles present in the verified catalogue context when available.") + " Distinguish Marvel Studios / MCU releases from other films based on actual metadata. Do not claim to play or stream content yourself."
  ].join("\n");

  try {
    let reply = "";
    let usedModel = "";
    if (env.GEMINI_API_KEY) {
      try {
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
      } catch (geminiError) {
        console.error("Rapiflix Gemini inference failed; attempting Workers AI fallback", {
          errorName: geminiError instanceof Error ? geminiError.name : "UnknownError",
          errorMessage: geminiError instanceof Error ? geminiError.message.slice(0, 300) : String(geminiError).slice(0, 300)
        });
        if (!env.AI || typeof env.AI.run !== "function") throw geminiError;
      }
    }
    if (!reply && env.AI && typeof env.AI.run === "function") {
      usedModel = "@cf/meta/llama-3.1-8b-instruct-fp8";
      const prompt = [{ role: "system", content: systemText }, ...messages];
      const result = await env.AI.run(usedModel, { messages: prompt, max_tokens: 500, temperature: 0.35 });
      reply = typeof result?.response === "string" ? result.response.trim() : "";
      if (!reply) throw new Error("Workers AI returned an empty response");
    }
    if (!reply) throw new Error("No conversational AI provider returned a response");
    return json({ reply, model: usedModel });
  } catch (error) {
    console.error("Rapiflix assistant inference failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
      errorMessage: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
      model: env.GEMINI_API_KEY ? "gemini-3.8-flash (Workers AI fallback attempted)" : "@cf/meta/llama-3.1-8b-instruct-fp8"
    });
    return json({ error: "The AI service is temporarily unavailable. Please check the Function logs and try again." }, 502);
  }
}
