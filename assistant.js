(() => {
"use strict";
if (window.__rapiflixTasteGuideLoaded) return;
window.__rapiflixTasteGuideLoaded = true;
const $ = (s, r=document) => r.querySelector(s);
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const poster = p => p ? (p.startsWith("http") ? p : "https://image.tmdb.org/t/p/w342" + p) : "";
const mg = {action:28,adventure:12,animation:16,animated:16,comedy:35,crime:80,documentary:99,drama:18,family:10751,fantasy:14,history:36,horror:27,music:10402,mystery:9648,romance:10749,romantic:10749,"sci-fi":878,scifi:878,science:878,space:878,thriller:53,suspense:53,war:10752,western:37};
const tg = {action:10759,adventure:10759,animation:16,animated:16,comedy:35,crime:80,documentary:99,drama:18,family:10751,kids:10762,mystery:9648,reality:10764,"sci-fi":10765,scifi:10765,science:10765,space:10765,romance:18,thriller:9648,war:10768,western:37};
const labels = {action:"action",adventure:"adventure",animation:"animation",animated:"animation",comedy:"comedy",crime:"crime",documentary:"documentary",drama:"drama",family:"family-friendly",fantasy:"fantasy",history:"historical stories",horror:"horror",music:"music",mystery:"mystery",romance:"romance",romantic:"romance","sci-fi":"science fiction",scifi:"science fiction",science:"science fiction",space:"science fiction",thriller:"thrillers",suspense:"suspense",war:"war stories",western:"westerns",kids:"kids' shows"};
const state = {open:false,busy:false,prefs:[],chat:[],activePrefs:null,nextPage:1,allItems:[]};
const countWords = {one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,eighteen:18,nineteen:19,twenty:20};
function requestedCount(text){const token="(\\d{1,2}|"+Object.keys(countWords).join("|")+")";const patterns=[new RegExp("\\b(?:top|give me|recommend(?: me)?|suggest(?: me)?|show me|list|find me|pick|choose|only|just|exactly)\\s+(?:the\\s+)?"+token+"\\b","i"),new RegExp("\\b"+token+"\\s+(?:movies?|films?|titles?|series|shows?|recommendations?)\\b","i")];for(const pattern of patterns){const match=String(text||"").match(pattern);if(match){const raw=match[1].toLowerCase();const n=Number(raw)||countWords[raw];if(n)return Math.max(1,Math.min(20,n));}}return 5;}
const link = document.createElement("link"); link.rel="stylesheet"; link.href="/assistant.css?v=20261022-ai-guide-v2"; document.head.appendChild(link);
document.body.insertAdjacentHTML("beforeend",
'<div class="rf-guide" id="rfGuide"><button class="rf-guide-launcher" id="rfGuideLauncher" type="button" aria-label="Open Rapiflix AI movie guide" aria-expanded="false"><span class="rf-guide-launcher-orbit"></span><span class="rf-guide-launcher-icon">✦</span><span class="rf-guide-launcher-copy"><strong>Talk to your AI guide</strong><small>RAPIFLIX TASTE GUIDE</small></span><span class="rf-guide-launcher-arrow">↗</span></button>'+
'<section class="rf-guide-panel" id="rfGuidePanel" aria-label="Rapiflix Taste Guide" aria-hidden="true"><header class="rf-guide-head"><div class="rf-guide-avatar">✦</div><div class="rf-guide-heading"><span>YOUR RAPIFLIX AI COMPANION</span><strong>Talk movies with Rapiflix</strong><small><i></i> Ask about films, series, anime, or what to watch next</small></div><button class="rf-guide-icon-btn" id="rfGuideClear" type="button" aria-label="Clear conversation">↺</button><button class="rf-guide-icon-btn" id="rfGuideClose" type="button" aria-label="Close assistant">×</button></header>'+
'<div class="rf-guide-messages" id="rfGuideMessages" aria-live="polite"><div class="rf-guide-welcome"><span class="rf-guide-eyebrow">A BETTER WAY TO PICK</span><h3>Tell me the <em>feeling</em>, not just the genre.</h3><p>Ask questions naturally, discuss films and series, compare titles, or tell me your mood and I’ll find something to watch.</p><div class="rf-guide-prompts"><button type="button" data-prompt="Recommend a mind-bending sci-fi thriller with a great twist">Mind-bending sci-fi</button><button type="button" data-prompt="I want a funny, light movie for tonight">Something funny</button><button type="button" data-prompt="Suggest a highly rated anime series">Anime series</button><button type="button" data-prompt="Find a mystery like Knives Out">Like Knives Out</button></div></div></div>'+
'<form class="rf-guide-form" id="rfGuideForm"><label class="rf-guide-sr-only" for="rfGuideInput">Describe what you want to watch</label><textarea id="rfGuideInput" rows="1" maxlength="500" placeholder="Ask me anything about movies or series..." autocomplete="off"></textarea><button type="submit" id="rfGuideSend" aria-label="Get recommendations">↗</button></form><div class="rf-guide-foot"><span>✦ BUILT AROUND YOUR TASTE</span><span>Clear anytime · No account required</span></div></section></div>');
const root=$("#rfGuide"), panel=$("#rfGuidePanel"), messages=$("#rfGuideMessages"), input=$("#rfGuideInput"), send=$("#rfGuideSend"), launcher=$("#rfGuideLauncher");
function open(){state.open=true;root.classList.add("is-open");launcher.setAttribute("aria-expanded","true");panel.setAttribute("aria-hidden","false");setTimeout(()=>input.focus(),150)}
function close(){state.open=false;root.classList.remove("is-open");launcher.setAttribute("aria-expanded","false");panel.setAttribute("aria-hidden","true")}
launcher.addEventListener("click",()=>state.open?close():open());$("#rfGuideClose").addEventListener("click",close);
function welcome(){messages.innerHTML='<div class="rf-guide-welcome"><span class="rf-guide-eyebrow">FRESH START</span><h3>Let’s find your <em>next favourite.</em></h3><p>Tell me what you’re in the mood for, or start with one of these.</p><div class="rf-guide-prompts"><button type="button" data-prompt="Recommend a mind-bending sci-fi thriller with a great twist">Mind-bending sci-fi</button><button type="button" data-prompt="I want a funny, light movie for tonight">Something funny</button><button type="button" data-prompt="Suggest a highly rated anime series">Anime series</button><button type="button" data-prompt="Find a mystery like Knives Out">Like Knives Out</button></div></div>'}
$("#rfGuideClear").addEventListener("click",()=>{state.prefs=[];state.chat=[];welcome()});
function message(role,text){const el=document.createElement("div");el.className="rf-guide-message "+(role==="user"?"from-user":"from-guide");el.innerHTML='<span class="rf-guide-message-label">'+(role==="user"?"YOU":"RAPIFLIX GUIDE")+'</span><p>'+esc(text)+'</p>';messages.appendChild(el);messages.scrollTop=messages.scrollHeight;return el}
function typing(){const el=document.createElement("div");el.className="rf-guide-message from-guide rf-guide-typing";el.innerHTML='<span class="rf-guide-message-label">RAPIFLIX GUIDE</span><p><i></i><i></i><i></i><span>Scanning the catalogue</span></p>';messages.appendChild(el);messages.scrollTop=messages.scrollHeight;return el}
async function api(path){const r=await fetch("/api/tmdb/"+path);if(!r.ok)throw Error("The catalogue is temporarily unavailable.");return r.json()}
async function askAI(text,items=[],catalogueQuery=null){
  const next=[...state.chat,{role:"user",content:text}].slice(-12);
  if(next[0]?.role==="assistant")next.shift();
  const catalogue=(items||[]).slice(0,100).map(x=>({title:x.title,type:x.type,year:x.year,rating:x.rating,overview:String(x.overview||"").slice(0,220)}));
  const response=await fetch("/api/assistant-chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({messages:next,catalogue,catalogueQuery,requestedCount:catalogueQuery?.count||5})});
  const contentType=response.headers.get("content-type")||"";
  const data=contentType.includes("application/json")?await response.json().catch(()=>({})): {};
  if(!response.ok){
    if(data.error)throw Error(data.error);
    if(response.status===404)throw Error("The assistant API route is missing from this deployment (HTTP 404). Cloudflare needs to deploy the latest Pages Functions from main.");
    if(response.status===503)throw Error("The assistant API is deployed, but its Workers AI binding is unavailable in this environment. Check the AI binding on the Production Pages project and redeploy.");
    throw Error("The assistant API returned HTTP "+response.status+" without a JSON error. Check the Cloudflare Pages deployment and Function logs.");
  }
  if(!data.reply)throw Error("The AI guide returned an empty reply. Try again.");
  state.chat=[...next,{role:"assistant",content:data.reply}].slice(-12);
  return data.reply;
}
function parse(text){
const l=text.toLowerCase(),p={type:"both",genres:[],language:"",rating:0,maxRuntime:0,year:"",mood:"",title:"",sort:"popularity.desc",franchise:"",topic:"",latest:false,count:requestedCount(text)};
if(/\b(marvel|mcu|marvel studios)\b/i.test(l)){p.franchise="marvel";p.type="movie"}
if(/\b(cars?|automobiles?|motorsport|racing|race cars?|formula 1|f1)\b/i.test(l)){p.topic="cars";p.type="movie"}
const about=text.match(/\b(?:movies?|films?)\s+(?:about|on|featuring|involving|related to)\s+([^,.!?]+)/i);
if(about&&!p.franchise){const subject=about[1].split(/\b(?:except|excluding|without|but not)\b/i)[0].trim().replace(/^(the|a|an)\s+/i,"");if(subject){p.topic=subject.toLowerCase();p.type="movie"}}
if(/\b(latest|newest|most recent|recent|upcoming)\b/i.test(l)){p.latest=true;p.sort="primary_release_date.desc"}
if(/\b(anime|animated)\b/.test(l))p.genres.push("animation");
Object.keys(labels).forEach(g=>{if(new RegExp("\\b"+g.replace(/[.*+?^$()|[\]\\]/g,"\\$&")+"\\b","i").test(l)&&!p.genres.includes(g))p.genres.push(g)});
if(/\b(series|tv show|tv series|show|episodes|season)\b/.test(l))p.type="tv";
if(/\b(movie|film|cinema)\b/.test(l))p.type=p.type==="tv"?"both":"movie";
if(/\b(hindi|bollywood|indian)\b/.test(l))p.language="hi";else if(/\b(korean|k-drama|kdrama)\b/.test(l))p.language="ko";else if(/\b(japanese|japan)\b/.test(l))p.language="ja";else if(/\b(english|hollywood)\b/.test(l))p.language="en";
if(/\b(highly rated|best rated|top rated|masterpiece|critically acclaimed)\b/.test(l)){p.rating=7.3;p.sort="vote_average.desc"}
const rt=l.match(/\b(?:under|less than|within)\s*(\d{1,3})\s*(?:min|minutes)\b/);if(rt)p.maxRuntime=Math.min(240,Math.max(45,Number(rt[1])));else if(/\b(short|quick|not too long)\b/.test(l))p.maxRuntime=100;
const yr=l.match(/\b(19\d{2}|20\d{2})\b/);if(yr)p.year=yr[1];
if(/\b(tonight|comfort|comforting|cozy|feel.good|lighthearted|uplifting)\b/.test(l))p.mood="comforting";
if(/\b(scary|terrifying|creepy|spooky)\b/.test(l)){p.mood="scary";p.genres.push("horror")}
if(/\b(mind.bending|twist|plot twist|brain.bending|psychological)\b/.test(l)){p.mood="mind-bending";p.genres.push("thriller","mystery","science")}
if(/\b(sad|emotional|tearjerker|make me cry)\b/.test(l))p.mood="emotional";
const like=text.match(/\b(?:like|similar to|same vibe as)\s+["“]?([^,.!?]+)["”]?/i);if(like)p.title=like[1].replace(/\b(but|with|and|under|that|which)\b.*$/i,"").trim();
p.genres=[...new Set(p.genres)].slice(0,3);return p
}
function merge(p,text){const followup=/\b(more|another|more like that|similar ones|those|that list|same vibe|keep going)\b/i.test(text);if(!followup||!state.prefs.length){state.prefs=[p];return p}const previous=state.prefs[state.prefs.length-1];const out={...previous,...p,genres:p.genres.length?p.genres:previous.genres,type:p.type==="both"?previous.type:p.type,franchise:p.franchise||previous.franchise,topic:p.topic||previous.topic,latest:p.latest||false};state.prefs=[out];return out}
function query(type,p,page=1){const q=new URLSearchParams({page:String(page),include_adult:"false",sort_by:p.sort||"popularity.desc","vote_count.gte":p.rating?"100":"40"});if(p.franchise==="marvel")q.set("with_companies","420");if(p.latest){q.set("sort_by","primary_release_date.desc");q.set("primary_release_date.lte",new Date().toISOString().slice(0,10));}if(p.rating)q.set("vote_average.gte",String(p.rating));const map=type==="tv"?tg:mg;const ids=[...new Set(p.genres.map(g=>map[g]).filter(Boolean))];if(ids.length)q.set("with_genres",ids.join(","));if(p.language)q.set("with_original_language",p.language);if(p.year)q.set(type==="tv"?"first_air_date_year":"primary_release_year",p.year);if(p.maxRuntime&&type==="movie")q.set("with_runtime.lte",String(p.maxRuntime));return "discover/"+type+"?"+q.toString()}
function norm(x,type){return {id:Number(x.id),type,title:x.title||x.name||"Untitled",year:String(x.release_date||x.first_air_date||"").slice(0,4),rating:Number(x.vote_average||0),poster:x.poster_path||"",overview:String(x.overview||"").slice(0,400)}}
async function recommend(p,startPage=1,pageCount=3){
if(p.franchise==="marvel"){
  try{const params={include_adult:"false",with_companies:"420",sort_by:p.latest?"primary_release_date.desc":"popularity.desc","vote_count.gte":"10","primary_release_date.lte":new Date().toISOString().slice(0,10)};const pages=await Promise.all(Array.from({length:pageCount},(_,i)=>startPage+i).filter(page=>page<=500).map(async page=>{const d=await api("discover/movie?"+new URLSearchParams({...params,page:String(page)}));return (d.results||[]).map(x=>norm(x,"movie")).filter(x=>x.poster)}));return pages.flat().filter((x,i,all)=>all.findIndex(y=>y.id===x.id)===i)}catch(_){return []}
}
if(p.topic){
  const terms=p.topic==="cars"?["car","racing","automobile","street racing","race car"]:[p.topic,p.topic+" film",p.topic+" movie"];
  const found=await Promise.all(terms.map(async term=>{try{const r=await api("search/keyword?query="+encodeURIComponent(term)+"&page=1");return (r.results||[]).slice(0,2).map(x=>x.id).filter(Boolean)}catch(_){return []}}));
  const ids=[...new Set(found.flat())].slice(0,7);
  const batches=await Promise.all(ids.map(async id=>{try{return (await Promise.all(Array.from({length:pageCount},(_,i)=>startPage+i).filter(page=>page<=500).map(async page=>{const d=await api("discover/movie?"+new URLSearchParams({page:String(page),include_adult:"false",with_keywords:String(id),sort_by:"popularity.desc","vote_count.gte":"10"}));return (d.results||[]).map(x=>norm(x,"movie")).filter(x=>x.poster&&(p.topic!=="cars"||!/\bfast\b.*\b(furious|five|x|6|7|8|9)\b|\bfurious\b|hobbs.*shaw|tokyo drift|f9|fast x/i.test(x.title)))}))).flat()}catch(_){return []}}));
  const all=batches.flat().sort((a,b)=>b.rating-a.rating);
  return all.filter((x,i)=>all.findIndex(y=>y.id===x.id)===i)
}
if(p.title){try{const s=await api("search/multi?query="+encodeURIComponent(p.title)+"&include_adult=false&page=1");const m=(s.results||[]).find(x=>x.media_type==="movie"||x.media_type==="tv");if(m){const t=m.media_type==="tv"?"tv":"movie";const pages=await Promise.all(Array.from({length:pageCount},(_,i)=>startPage+i).filter(page=>page<=500).map(page=>api(t+"/"+m.id+"/recommendations?page="+page).catch(()=>({results:[]}))));const found=pages.flatMap(r=>(r.results||[]).map(x=>norm(x,t)).filter(x=>x.poster));if(found.length)return found.filter((x,i,all)=>all.findIndex(y=>y.id===x.id)===i)}}catch(_){}}
const types=p.type==="both"?["movie","tv"]:[p.type];const batches=await Promise.all(types.map(async t=>{try{return (await Promise.all(Array.from({length:pageCount},(_,i)=>startPage+i).filter(page=>page<=500).map(async page=>{const d=await api(query(t,p,page));return (d.results||[]).map(x=>norm(x,t)).filter(x=>x.poster)}))).flat()}catch(_){return []}}));const all=batches.flat().sort((a,b)=>(b.rating*(p.rating?1.5:.35)+Math.log1p(b.id%1000))-(a.rating*(p.rating?1.5:.35)+Math.log1p(a.id%1000)));return all.filter((x,i)=>all.findIndex(y=>y.id===x.id&&y.type===x.type)===i)}
function results(items,p){messages.querySelectorAll(".rf-guide-results").forEach(el=>el.remove());const section=document.createElement("div");section.className="rf-guide-results";section.innerHTML='<div class="rf-guide-results-head"><span>YOUR SHORTLIST</span><small class="rf-guide-result-count"></small></div><div class="rf-guide-result-list"></div>';messages.appendChild(section);const list=section.querySelector(".rf-guide-result-list");const seen=new Set();items.slice(0,p.count||5).forEach((x)=>{if(seen.has(x.type+":"+x.id))return;seen.add(x.type+":"+x.id);const c=document.createElement("article");c.className="rf-guide-result";c.dataset.key=x.type+":"+x.id;const image=poster(x.poster);let why=p.franchise==="marvel"?"Marvel Studios":p.topic==="cars"?"car and racing films":p.genres.length?p.genres.slice(0,2).map(g=>labels[g]||g).join(" + "):p.mood||"popular pick";if(p.language)why+=" · "+({hi:"Hindi",ko:"Korean",ja:"Japanese",en:"English"}[p.language]||"language")+" language";if(p.maxRuntime&&x.type==="movie")why+=" · under "+p.maxRuntime+" min";if(p.rating&&x.rating>=p.rating)why+=" · strong rating";c.innerHTML='<a class="rf-guide-result-poster" href="/title/'+encodeURIComponent(x.id)+'?type='+x.type+'" aria-label="Open '+esc(x.title)+'">'+(image?'<img src="'+esc(image)+'" alt="" loading="lazy">':'✦')+'</a><div class="rf-guide-result-copy"><span class="rf-guide-result-kicker">'+(x.type==="tv"?"SERIES":"MOVIE")+' · '+esc(x.year||"YEAR N/A")+'</span><a class="rf-guide-result-title" href="/title/'+encodeURIComponent(x.id)+'?type='+x.type+'">'+esc(x.title)+'</a><span class="rf-guide-rating">★ '+x.rating.toFixed(1)+' <i>/ 10</i></span><p>Matched for '+esc(why)+'.</p></div><span class="rf-guide-result-number">'+String(list.children.length+1).padStart(2,"0")+'</span>';list.appendChild(c)});section.querySelector(".rf-guide-result-count").textContent=list.children.length+" of "+(p.count||5)+" requested";messages.scrollTop=messages.scrollHeight}
async function loadMore(){if(state.busy||!state.activePrefs||state.nextPage>500)return;const btn=messages.querySelector(".rf-guide-load-more");state.busy=true;if(btn){btn.disabled=true;btn.textContent="Searching more catalogue pages…"}try{const start=state.nextPage;const items=await recommend(state.activePrefs,start,3);state.nextPage=Math.min(501,start+3);const unique=items.filter(x=>!state.allItems.some(y=>y.id===x.id&&y.type===x.type));state.allItems.push(...unique);if(unique.length)results(unique,state.activePrefs,true);else if(btn){btn.textContent="No more matching titles found";btn.disabled=true}}catch(e){message("guide","Couldn't load more catalogue titles: "+(e.message||"temporary error"))}finally{state.busy=false;const current=messages.querySelector(".rf-guide-load-more");if(current&&!current.disabled){current.disabled=false;current.textContent=state.nextPage>500?"Catalogue page limit reached":"Load more catalogue titles ↗"}}}
async function submit(text){
 const q=String(text||"").trim();if(!q||state.busy)return;
 const w=messages.querySelector(".rf-guide-welcome");if(w)w.remove();
 message("user",q);input.value="";input.style.height="auto";state.busy=true;send.disabled=true;root.classList.add("is-thinking");
 const wait=typing();
 try{
   const p=merge(parse(q),q);
   const likelyDiscovery=Boolean(p.franchise||p.topic||p.genres.length||p.title||p.mood||p.language||p.rating||p.maxRuntime||p.year||/\b(recommend|suggest|find|watch|similar|like|movie|film|series|anime|show|latest|newest)\b/i.test(q));
   let items=[];
   if(likelyDiscovery){state.activePrefs=p;state.nextPage=4;state.allItems=[];items=await recommend(p,1,3);state.allItems=items.slice()}
   let reply="";
   try{reply=await askAI(q,items,p)}catch(chatError){reply="I can still search the Rapiflix catalogue, but conversational AI is temporarily unavailable. "+chatError.message}
   wait.remove();message("guide",reply);
   if(likelyDiscovery){if(items.length)results(items,p);else if(!reply.includes("temporarily unavailable"))message("guide","I couldn't verify matching titles in the Rapiflix catalogue for that request. Try a more specific title, studio, or genre.")}
 }catch(e){wait.remove();message("guide",e.message||"Something went wrong. Try again.")}
 finally{state.busy=false;send.disabled=false;root.classList.remove("is-thinking");input.focus()}
}
$("#rfGuideForm").addEventListener("submit",e=>{e.preventDefault();submit(input.value)});
input.addEventListener("input",()=>{input.style.height="auto";input.style.height=Math.min(input.scrollHeight,112)+"px"});
messages.addEventListener("click",e=>{const b=e.target.closest("[data-prompt]");if(b)submit(b.dataset.prompt)});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&state.open)close()});
})();