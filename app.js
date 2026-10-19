/* Rapiflix: independent frontend inspired by the public-domain catalog approach in FreeReel and MovieTube. */
(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const byId = (id) => catalog.find(m => m.id === id);
  const archive = 'https://archive.org';
  const catalog = [];
  const featuredIds = [];
  const genres = ['All','Comedy','Thriller','Adventure','Noir','Sci-Fi','Horror','Animation','Drama','Family','Mystery','Action'];
  let activeGenre = 'all', activeEra = '2000-2026', query = '', sortNewest = false, showingSaved = false, extraPage = 1, selected = catalog[0], heroIndex = 0;
  let tmdbSearchResults = [], archiveSearchResults = [];
  let tmdbSearchSequence = 0, archiveSearchSequence = 0, catalogLoadSequence = 0;
  let tmdbSearchLoading = false, archiveSearchLoading = false, hideSuggestionsUntilNextInput = false;
  let currentTmdbEndpoint = 'trending/movie/week', currentTmdbLabel = 'Trending 2000–2026', currentTmdbPage = 1, currentTmdbTotalPages = 1, currentTmdbParams = { 'primary_release_date.gte': '2000-01-01', 'primary_release_date.lte': '2026-12-31', sort_by: 'popularity.desc' };
  let autoLoadingMore = false;
  let lastUserScrollAt = 0;
  let autoLoadArmed = true;
  window.addEventListener('wheel',()=>{lastUserScrollAt=Date.now();},{passive:true});
  window.addEventListener('touchmove',()=>{lastUserScrollAt=Date.now();},{passive:true});
  window.addEventListener('keydown',e=>{if(['ArrowDown','PageDown',' ','End'].includes(e.key))lastUserScrollAt=Date.now();});
  const tmdbKeyName = 'rapiflix-tmdb-key';
  let tmdbGenreMap = {}, tmdbTvGenreMap = {};
  let licensedStreams = {};
  let authorizedEmbedProviders = [];
  const shared = window.RapiflixShared || { slugify: value => String(value || 'title').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'title', slugForRecord: (record) => String(record?.title || record?.name || 'title').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'title' };
  let modalOpener = null;
  function tmdbKey(){try{return localStorage.getItem(tmdbKeyName)||'';}catch(_){return '';}}
  function isLocalPreview(){return ['localhost','127.0.0.1'].includes(location.hostname);}
  function validatedLicensedSources(value){
    const list=Array.isArray(value)?value:(value&&typeof value==='object'?[value]:[]);
    return list.filter(source=>source&&source.authorized===true&&typeof source.url==='string'&&/^https:\/\//i.test(source.url))
      .map(source=>({...source,label:String(source.label||source.provider||'Authorized stream').slice(0,100)}));
  }
  function getAuthorizedSources(m){
    if(!m)return [];
    const perTitle=validatedLicensedSources(m.kind==='tmdb'?(m.mediaType==='tv'?licensedStreams['tv:'+String(m.tmdbId)]:licensedStreams[String(m.tmdbId)]):m.authorizedSources);
    if(m.kind!=='tmdb'||!m.tmdbId)return perTitle;
    const templateSources=(m.mediaType==='tv'?[]:authorizedEmbedProviders).filter(provider=>provider&&provider.authorized===true&&typeof provider.urlTemplate==='string'&&provider.urlTemplate.includes('{tmdb_id}')&&/^https:\/\//i.test(provider.urlTemplate))
      .map(provider=>({authorized:true,mode:'iframe',provider:provider.provider||provider.label||'Authorized embed',label:provider.label||provider.provider||'Authorized embed',url:provider.urlTemplate.replaceAll('{tmdb_id}',encodeURIComponent(String(m.tmdbId)))}));
    return [...perTitle,...validatedLicensedSources(templateSources)];
  }
  async function loadLicensedStreamManifest(){
    try{
      const response=await fetch(new URL('/streams.json',location.origin),{cache:'no-store'});
      if(!response.ok)return;
      const data=await response.json();
      licensedStreams=data&&data.movies&&typeof data.movies==='object'?data.movies:{};
      authorizedEmbedProviders=Array.isArray(data&&data.embedProviders)?data.embedProviders.filter(provider=>provider&&provider.authorized===true&&typeof provider.urlTemplate==='string'&&provider.urlTemplate.includes('{tmdb_id}')&&/^https:\/\//i.test(provider.urlTemplate)):[];
    }catch(_){
      // The optional manifest must never block the catalogue or leak details to the console.
    }
  }
  async function tmdbRequest(path,params={}){
    // Always use the same server-side proxy in local Wrangler and deployed Pages.
    // Wrangler reads TMDB_API_KEY from rapiflix/.dev.vars; no key is exposed to the browser.
    const url=new URL('/api/tmdb/'+path.split('/').map(encodeURIComponent).join('/'),location.origin);
    Object.entries(params).forEach(([key,value])=>{if(value!==undefined&&value!==null&&value!=='')url.searchParams.set(key,String(value));});
    return fetch(url);
  }
  function setCatalogRetry(show){const button=$('#retryCatalog');if(button)button.hidden=!show;}
  function setTmdbStatus(message){const el=$('#tmdbStatus');if(el)el.textContent=message;}
  function connectTmdb(){const value=window.prompt('Paste your temporary TMDB v3 API key. It is saved in this browser only, not in GitHub.',tmdbKey());if(value===null)return false;const key=value.trim();try{if(key)localStorage.setItem(tmdbKeyName,key);else localStorage.removeItem(tmdbKeyName);}catch(_){setTmdbStatus('Browser storage is unavailable.');return false;}if(!key){setTmdbStatus('TMDB key cleared from this browser.');return false;}return true;}
  function mapTmdbMovie(m,label,mediaType='movie'){
    const isTv=mediaType==='tv'||m.media_type==='tv';
    const title=isTv?(m.name||m.original_name):(m.title||m.original_title);
    const releaseDate=isTv?(m.first_air_date||''):(m.release_date||'');
    const genresMap=isTv?tmdbTvGenreMap:tmdbGenreMap;
    return {id:'tmdb-'+(isTv?'tv-':'')+m.id,tmdbId:m.id,mediaType:isTv?'tv':'movie',title:title||'Untitled',year:Number(releaseDate.slice(0,4))||0,runtime:isTv?'TV series':'Runtime varies',genres:(m.genre_ids||[]).map(g=>genresMap[g]||tmdbGenreMap[g]||tmdbTvGenreMap[g]).filter(Boolean).slice(0,3),originalLanguage:m.original_language||'',desc:m.overview||'No synopsis is available yet.',posterPath:m.poster_path||'',backdropPath:m.backdrop_path||'',poster:m.poster_path?'https://image.tmdb.org/t/p/w500'+m.poster_path:'',backdrop:m.backdrop_path?'https://image.tmdb.org/t/p/w780'+m.backdrop_path:'',source:'https://www.themoviedb.org/'+(isTv?'tv/':'movie/')+m.id,sourceName:'TMDB',kind:'tmdb',tag:(label||'TMDB').toUpperCase()};
  }
  function showCatalogLoading(){
    const host=$('#movieGrid');if(!host)return;
    host.innerHTML=Array.from({length:12},()=>'<div class="loading-card" aria-hidden="true"><div class="loading-poster"></div><div class="loading-line"></div><div class="loading-line short"></div></div>').join('');
    $('#resultsCount').textContent='LOADING…';
  }
  async function loadTmdb(endpoint,label,requestId=++catalogLoadSequence){
    const queryAtStart=query.trim();
    const inputAtStart=$('#searchInput').value.trim();
    currentTmdbEndpoint=endpoint;currentTmdbLabel=label||'TMDB';currentTmdbPage=1;
    const isAnime=endpoint==='anime';
    currentTmdbParams=endpoint==='discover/movie'
      ? {'primary_release_date.gte':'2000-01-01','primary_release_date.lte':'2026-12-31',sort_by:sortNewest?'primary_release_date.desc':'popularity.desc','vote_count.gte':10}
      : endpoint==='discover/tv'
        ? {'first_air_date.gte':'2000-01-01','first_air_date.lte':'2026-12-31',sort_by:sortNewest?'first_air_date.desc':'popularity.desc','vote_count.gte':5}
        : {};
    setCatalogRetry(false);
    setTmdbStatus('Loading '+(isAnime?'anime films and series':currentTmdbLabel)+'…');
    if(!query.trim())showCatalogLoading();
    const moreButton=$('#loadMoreTmdb');if(moreButton){moreButton.disabled=true;moreButton.textContent='Loading catalogue…';}
    try{
      const [movieGenreResponse,tvGenreResponse]=await Promise.all([tmdbRequest('genre/movie/list',{language:'en-US'}),tmdbRequest('genre/tv/list',{language:'en-US'})]);
      if(movieGenreResponse.ok){const d=await movieGenreResponse.json();(d.genres||[]).forEach(g=>tmdbGenreMap[g.id]=g.name);}
      if(tvGenreResponse.ok){const d=await tvGenreResponse.json();(d.genres||[]).forEach(g=>tmdbTvGenreMap[g.id]=g.name);}
      if(requestId!==catalogLoadSequence)return;
      document.querySelectorAll('[data-tmdb]').forEach(btn=>btn.classList.toggle('active',btn.dataset.tmdb===endpoint));
      let fresh=[],totalPages=1;
      if(isAnime){
        const [mr,tr]=await Promise.all([
          tmdbRequest('discover/movie',{language:'en-US',page:'1',region:'PK',sort_by:'popularity.desc','primary_release_date.gte':'2000-01-01','primary_release_date.lte':'2026-12-31','with_genres':'16','with_original_language':'ja','vote_count.gte':2}),
          tmdbRequest('discover/tv',{language:'en-US',page:'1',sort_by:'popularity.desc','first_air_date.gte':'2000-01-01','first_air_date.lte':'2026-12-31','with_genres':'16','with_original_language':'ja','vote_count.gte':2})
        ]);
        const [md,td]=await Promise.all([mr.json(),tr.json()]);
        if(!mr.ok&&!tr.ok)throw new Error(md.status_message||td.status_message||'Anime catalogue request failed');
        fresh=(md.results||[]).filter(m=>m&&m.id).map(m=>mapTmdbMovie(m,currentTmdbLabel,'movie')).concat((td.results||[]).filter(m=>m&&m.id).map(m=>mapTmdbMovie(m,currentTmdbLabel,'tv')));
        totalPages=Math.max(Number(md.total_pages)||1,Number(td.total_pages)||1);
      }else{
        const response=await tmdbRequest(endpoint,{language:'en-US',page:'1',region:'PK',...currentTmdbParams});
        const data=await response.json();if(!response.ok)throw new Error(data.status_message||data.error||'Catalogue request failed');
        fresh=(data.results||[]).filter(m=>m&&m.id).map(m=>mapTmdbMovie(m,currentTmdbLabel,endpoint==='discover/tv'||endpoint.includes('/tv')?'tv':'movie'));
        totalPages=Number(data.total_pages)||1;
      }
      if(requestId!==catalogLoadSequence)return;
      fresh=fresh.filter(m=>m.year>=2000&&m.year<=2026);
      const searchChangedDuringLoad=query.trim()!==queryAtStart||$('#searchInput').value.trim()!==inputAtStart;
      for(let i=catalog.length-1;i>=0;i--)if(catalog[i].kind==='tmdb')catalog.splice(i,1);
      catalog.unshift(...fresh);currentTmdbTotalPages=Math.min(totalPages,500);
      if(fresh.length){featuredIds.splice(0,featuredIds.length,...fresh.slice(0,4).map(m=>m.id));heroIndex=0;if(!searchChangedDuringLoad)updateHero(0);}
      if(!searchChangedDuringLoad){
        activeGenre='all';activeEra='2000-2026';showingSaved=false;query='';$('#searchInput').value='';
        tmdbSearchResults=[];archiveSearchResults=[];
        $('#genreFilter').value='all';$('#eraFilter').value=activeEra;renderChips();
      }
      render();
      setCatalogRetry(false);
      if(!searchChangedDuringLoad)setTmdbStatus('Loaded '+fresh.length+' '+(isAnime?'anime films and series':endpoint==='discover/tv'?'TV series':'films')+'. '+(currentTmdbPage<currentTmdbTotalPages?'Load more to continue browsing.':'No further pages available.'));
    }catch(error){
      if(requestId!==catalogLoadSequence)return;
      if(query.trim()===queryAtStart&&$('#searchInput').value.trim()===inputAtStart){setTmdbStatus('Catalogue unavailable: '+error.message+'. Check the TMDB server secret and redeploy if this is the live site.');setCatalogRetry(true);render();}
    }
    finally{if(requestId===catalogLoadSequence&&moreButton){moreButton.disabled=false;moreButton.textContent=currentTmdbPage<currentTmdbTotalPages?'Load more · '+currentTmdbLabel:'Catalogue page limit reached';moreButton.disabled=currentTmdbPage>=currentTmdbTotalPages;}}
  }
  async function loadMoreTmdb(silent=false,requestId=catalogLoadSequence){
    if(requestId!==catalogLoadSequence||currentTmdbPage>=currentTmdbTotalPages)return;
    const btn=$('#loadMoreTmdb');btn.disabled=true;btn.textContent='Loading more…';
    try{
      const next=currentTmdbPage+1;let fresh=[],totalPages=currentTmdbTotalPages;
      if(currentTmdbEndpoint==='anime'){
        const [mr,tr]=await Promise.all([
          tmdbRequest('discover/movie',{language:'en-US',page:String(next),region:'PK',sort_by:'popularity.desc','primary_release_date.gte':'2000-01-01','primary_release_date.lte':'2026-12-31','with_genres':'16','with_original_language':'ja','vote_count.gte':2}),
          tmdbRequest('discover/tv',{language:'en-US',page:String(next),sort_by:'popularity.desc','first_air_date.gte':'2000-01-01','first_air_date.lte':'2026-12-31','with_genres':'16','with_original_language':'ja','vote_count.gte':2})
        ]);
        const [md,td]=await Promise.all([mr.json(),tr.json()]);
        if(!mr.ok&&!tr.ok)throw new Error(md.status_message||td.status_message||'Could not load more anime');
        fresh=(md.results||[]).map(m=>mapTmdbMovie(m,currentTmdbLabel,'movie')).concat((td.results||[]).map(m=>mapTmdbMovie(m,currentTmdbLabel,'tv')));
        totalPages=Math.max(Number(md.total_pages)||1,Number(td.total_pages)||1);
      }else{
        const response=await tmdbRequest(currentTmdbEndpoint,{language:'en-US',page:String(next),region:'PK',...currentTmdbParams});
        const data=await response.json();if(!response.ok)throw new Error(data.status_message||data.error||'Could not load the next page');
        fresh=(data.results||[]).map(m=>mapTmdbMovie(m,currentTmdbLabel,currentTmdbEndpoint==='discover/tv'||currentTmdbEndpoint.includes('/tv')?'tv':'movie'));totalPages=Number(data.total_pages)||totalPages;
      }
      if(requestId!==catalogLoadSequence)return;
      fresh=fresh.filter(m=>m.year>=2000&&m.year<=2026);
      const existing=new Set(catalog.filter(m=>m.kind==='tmdb').map(m=>m.id));fresh=fresh.filter(m=>!existing.has(m.id));
      catalog.push(...fresh);currentTmdbPage=next;currentTmdbTotalPages=Math.min(totalPages,500);render();
      setTmdbStatus('Showing '+catalog.filter(m=>m.kind==='tmdb').length+' results. Page '+currentTmdbPage+' of '+currentTmdbTotalPages+' · '+currentTmdbLabel+'.');
      if(fresh.length&&!silent)toast('Added '+fresh.length+' more titles');
    }catch(error){if(requestId!==catalogLoadSequence)return;setTmdbStatus('Could not load more titles: '+error.message);toast('Catalogue page failed to load');}
    finally{if(requestId===catalogLoadSequence){btn.disabled=currentTmdbPage>=currentTmdbTotalPages;btn.textContent=btn.disabled?'Catalogue page limit reached':'Load more · '+currentTmdbLabel;}}
  }
  function renderSearchSuggestions(){
    const host=$('#searchSuggestions');
    const input=$('#searchInput');
    if(!host||!input)return;
    const term=query.trim();
    if(hideSuggestionsUntilNextInput||term.length<2){host.hidden=true;host.replaceChildren();input.setAttribute('aria-expanded','false');return;}
    const items=[...new Map([...tmdbSearchResults,...archiveSearchResults].map(m=>[m.id,m])).values()].slice(0,6);
    if(!items.length){
      host.innerHTML=`<div class="search-suggestion-status" role="status">${tmdbSearchLoading||archiveSearchLoading?'Searching movies and series…':'No matches yet. Press Enter to view full results.'}</div>`;
    }else{
      host.innerHTML=items.map(m=>{
        const kind=m.mediaType==='tv'?'TV series':m.kind==='tmdb'?'Movie':'Free film';
        const poster=m.poster?`<img src="${escapeHtml(m.poster)}" alt="" loading="lazy">`:'<span aria-hidden="true">▶</span>';
        return `<button type="button" class="search-suggestion" role="option" aria-label="Open ${escapeHtml(m.title)}" data-search-suggestion="${escapeHtml(m.id)}"><span class="search-suggestion-art">${poster}</span><span class="search-suggestion-copy"><strong>${escapeHtml(m.title)}</strong><small>${m.year||'Year unknown'} · ${kind}</small></span><span class="search-suggestion-arrow" aria-hidden="true">↗</span></button>`;
      }).join('');
      if(tmdbSearchLoading||archiveSearchLoading)host.insertAdjacentHTML('beforeend','<div class="search-suggestion-status" role="status">Updating matches…</div>');
    }
    host.hidden=false;
    input.setAttribute('aria-expanded','true');
  }
  async function searchTmdb(text){
    const term=String(text||'').trim();
    if(term.length<2){tmdbSearchLoading=false;renderSearchSuggestions();return;}
    const requestId=++tmdbSearchSequence;
    tmdbSearchLoading=true;renderSearchSuggestions();
    try{
      const response=await tmdbRequest('search/multi',{query:term,language:'en-US',region:'PK',include_adult:'false'});
      const data=await response.json();if(!response.ok)throw new Error(data.status_message||data.error||'Search failed');
      if(requestId!==tmdbSearchSequence||query.trim()!==term)return;
      tmdbSearchResults=(data.results||[]).filter(m=>m&&m.id&&['movie','tv'].includes(m.media_type)).map(m=>mapTmdbMovie(m,'SEARCH RESULT',m.media_type)).filter(m=>m.year>=2000&&m.year<=2026);
      tmdbSearchLoading=false;render();renderSearchSuggestions();
      setTmdbStatus('Search results include films and TV series. Select a title for official watch options.');
    }catch(error){
      if(requestId!==tmdbSearchSequence||query.trim()!==term)return;
      tmdbSearchLoading=false;renderSearchSuggestions();setTmdbStatus('Search unavailable: '+error.message);setCatalogRetry(true);
    }
  }
  let saved = new Set();
  try { saved = new Set(JSON.parse(localStorage.getItem('rapiflix-saved') || '[]')); } catch (_) {}
  const heroArt = $('#heroArt');
  const fallbackGradients = ['linear-gradient(130deg,#6b3c39,#201823 58%,#0a0a0f)','linear-gradient(130deg,#3b4e4d,#1a2026 58%,#09090d)','linear-gradient(130deg,#826b47,#33242c 58%,#0b0b10)','linear-gradient(130deg,#39445c,#241c2b 58%,#09090d)'];
  function escapeHtml(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function imageUrl(m){return m.poster || (m.kind==='tmdb'?'':`${archive}/services/img/${m.id}`);}
  function posterSrcset(m){
    const path=m?.posterPath||'';
    if(!path)return '';
    return ['w342','w500','w780','original'].map(size=>'https://image.tmdb.org/t/p/'+size+path+' '+(size==='w342'?'342w':size==='w500'?'500w':size==='w780'?'780w':'1000w')).join(', ');
  }
  function setResponsivePoster(image,m){
    const srcset=posterSrcset(m);
    if(srcset){image.srcset=srcset;image.sizes='(max-width: 620px) 45vw, (max-width: 1000px) 20vw, 180px';}
  }
  function titleSlug(value='', record=null){return shared.slugForRecord(record||{title:value}, catalog);}
  function titleRouteType(m){
    if(!m||m.kind!=='tmdb')return 'archive';
    return m.mediaType==='tv'?'tv':'movie';
  }
  function titlePageUrl(m){
    const params=new URLSearchParams({id:String(m.id||''),type:titleRouteType(m)});
    return '/title/'+titleSlug(m.title,m)+'?'+params.toString();
  }
  function setText(selector,value){const element=$(selector);if(element)element.textContent=value;}
  function syncHeroPoster(movie){
    const fallback=$('#heroPosterFallback');
    const posterUrl=imageUrl(movie);
    let img=heroArt.querySelector('img.hero-poster-image');
    if(!posterUrl){
      if(img)img.remove();
      if(fallback){fallback.hidden=false;fallback.textContent=String(movie?.title||'R').slice(0,1).toUpperCase();}
      heroArt.style.removeProperty('--hero-poster-blur');
      return;
    }
    if(!img){
      img=document.createElement('img');
      img.className='hero-poster-image';
      img.loading='eager';
      img.decoding='async';
      heroArt.insertBefore(img,fallback);
    }
    img.alt='Poster for '+String(movie.title||'selected title');
    setResponsivePoster(img,movie);
    img.onerror=()=>{
      img.remove();
      if(fallback){fallback.hidden=false;fallback.textContent=String(movie?.title||'R').slice(0,1).toUpperCase();}
      heroArt.style.removeProperty('--hero-poster-blur');
    };
    img.onload=()=>{if(fallback)fallback.hidden=true;};
    heroArt.style.setProperty('--hero-poster-blur','url("'+posterUrl.replace(/["\\]/g,'')+'")');
    if(img.src!==posterUrl)img.src=posterUrl;
    else if(img.complete&&img.naturalWidth>0&&fallback)fallback.hidden=true;
  }
  function updateHero(index=heroIndex){
    if(!featuredIds.length||!catalog.length){
      selected=null;heroIndex=0;
      $('#heroTitle').textContent='Find your next favourite film.';
      $('#heroKicker').textContent='CURRENT MOVIES & SERIES';
      $('#heroCopy').textContent='Load trending releases or search for a title. Available watch options depend on your region.';
      $('#heroYear').textContent='NEW';$('#heroGenre').textContent='Trending · Popular · Upcoming';
      setText('.quality-pill','DISCOVERY');
      heroArt.style.backgroundImage='linear-gradient(130deg,#28203c,#09090d)';
      syncHeroPoster({title:'Rapiflix',poster:''});
      setText('.index-current','01');setText('.hero-index>span:last-child','01');
      $('#heroPlay').disabled=true;$('#heroPlay').innerHTML='<span>⌕</span> Find movies';
      return;
    }
    heroIndex=(index+featuredIds.length)%featuredIds.length;
    selected=byId(featuredIds[heroIndex])||catalog[0];
    heroIndex=featuredIds.indexOf(selected.id);
    $('#heroPlay').disabled=false;
    $('#heroPlay').innerHTML=selected.kind==='tmdb'?'<span>▶</span> Watch now':'<span>▶</span> Play free film';
    $('#heroTitle').innerHTML=escapeHtml(selected.title).replace(/ (.+)/,'<br><em>$1</em>');
    if(!$('#heroTitle').innerHTML.includes('<em>'))$('#heroTitle').innerHTML=escapeHtml(selected.title)+'<br><em>forever.</em>';
    $('#heroKicker').textContent=(selected.tag||'FEATURED FILM')+' · RAPIFLIX SELECTION';
    $('#heroCopy').textContent=selected.desc;
    $('#heroYear').textContent=selected.year||'—';
    $('#heroGenre').textContent=selected.genres.join(' · ');
    setText('.quality-pill',selected.kind==='tmdb'?'WATCH OPTIONS':'IN-PLAYER');
    heroArt.style.backgroundImage='linear-gradient(130deg,#28203c,#09090d)';
    heroArt.style.backgroundColor='#1b1721';
    syncHeroPoster(selected);
    setText('.index-current',String(heroIndex+1).padStart(2,'0'));
    setText('.hero-index>span:last-child',String(featuredIds.length).padStart(2,'0'));
  }
  function posterMarkup(m){
    const url=imageUrl(m);
    const blur=url?';--poster-blur:url(&quot;'+escapeHtml(url)+'&quot;)':'';
    const image=url?'<img loading="lazy" decoding="async" srcset="'+escapeHtml(posterSrcset(m))+'" sizes="(max-width: 620px) 45vw, (max-width: 1000px) 20vw, 180px" src="'+escapeHtml(url)+'" alt="Poster for '+escapeHtml(m.title)+'" onerror="this.style.display=\'none\'" onload="this.previousElementSibling.style.display=\'none\'">':'';
    return '<div class="poster-wrap" style="background:'+fallbackGradients[Math.abs(m.title.length)%fallbackGradients.length]+blur+'"><div class="poster-fallback"><div><span>'+(m.kind==='tmdb'?'MOVIE DISCOVERY':'FREE FILM LIBRARY')+'</span>'+escapeHtml(m.title)+'</div></div>'+image+'<div class="poster-overlay"></div><span class="poster-badge">'+escapeHtml(m.tag||'ARCHIVE PICK')+'</span><button class="save-card '+(saved.has(m.id)?'saved':'')+'" data-save="'+escapeHtml(m.id)+'" aria-label="'+(saved.has(m.id)?'Remove from':'Save to')+' my list">'+(saved.has(m.id)?'♥':'♡')+'</button><button class="card-play" data-details="'+escapeHtml(m.id)+'" aria-label="View '+escapeHtml(m.title)+'">▶</button></div>';
  }
  function render(){
    const needle=query.trim().toLowerCase();
    const searchPool=needle?[...catalog,...tmdbSearchResults,...archiveSearchResults]:catalog;
    const remoteSearchIds=new Set([...tmdbSearchResults,...archiveSearchResults].map(m=>m.id));
    const searchableCatalog=needle?[...new Map(searchPool.map(m=>[m.id,m])).values()]:catalog;
    const matches=searchableCatalog.filter(m=>(m.year>=2000&&m.year<=2026)&&(activeGenre==='all'||m.genres.some(g=>g.toLowerCase()===activeGenre.toLowerCase()))&&(activeEra==='all'||(activeEra==='2000-2026'?m.year>=2000&&m.year<=2026:activeEra==='2000s'?m.year>=2000&&m.year<=2009:activeEra==='2010s'?m.year>=2010&&m.year<=2019:activeEra==='2020s'?m.year>=2020&&m.year<=2026:activeEra==='latest'?m.year>=new Date().getFullYear()-1:m.year>0&&m.year<2000))&&(!needle||remoteSearchIds.has(m.id)||`${m.title} ${m.year} ${m.genres.join(' ')} ${m.desc}`.toLowerCase().includes(needle))&&(!showingSaved||saved.has(m.id)));
    let discovery=matches.filter(m=>m.kind==='tmdb');
    let freeFilms=matches.filter(m=>m.kind!=='tmdb');
    if(sortNewest){discovery=discovery.slice().sort((a,b)=>b.year-a.year);freeFilms=freeFilms.slice().sort((a,b)=>b.year-a.year);}
    const cardMarkup=(m,i)=>`<article class="movie-card" data-card="${escapeHtml(m.id)}" data-title-type="${titleRouteType(m)}" data-title-year="${m.year||''}" style="animation-delay:${Math.min(i%10,8)*35}ms">${posterMarkup(m)}<div class="card-info"><div class="card-title-row"><h3 class="card-title" title="${escapeHtml(m.title)}"><a class="card-title-link" data-title-link="${escapeHtml(m.id)}" href="${escapeHtml(titlePageUrl(m))}">${escapeHtml(m.title)}</a></h3><span class="card-year">${m.year||'—'}</span></div><div class="card-sub"><span>${escapeHtml(m.genres.slice(0,2).join(' · '))} · ${escapeHtml(m.runtime)}</span><span class="card-free">${m.kind==='tmdb'?(m.mediaType==='tv'?'SERIES':m.genres.includes('Animation')&&m.originalLanguage==='ja'?'ANIME':'FILM'):'FREE FILM'}</span></div></div></article>`;
    const empty=(message)=>`<div class="empty-state"><strong>${message}</strong><p>${needle?'Try another title or clear your search.':'Browse films and series released from 2000 through 2026.'}</p></div>`;
    $('#movieGrid').innerHTML=discovery.length?discovery.map(cardMarkup).join(''):empty(needle?'No titles found for this search.':'No titles match these filters yet.');
    $('#freeMovieGrid').innerHTML=freeFilms.length?freeFilms.map(cardMarkup).join(''):empty(showingSaved?'No saved free films yet.':'No rights-checked free films in this view yet.');
    $('#resultsCount').textContent=`${discovery.length} TITLE${discovery.length===1?'':'S'}`;
    $('#freeResultsCount').textContent=`${freeFilms.length} FILM${freeFilms.length===1?'':'S'}`;
    $('#resultsLabel').textContent=showingSaved?'YOUR SAVED LIST':needle?'COMMERCIAL SEARCH RESULTS':'CURRENT MOVIE DISCOVERY';
    $('#freeResultsLabel').textContent=showingSaved?'SAVED FREE FILMS':needle?'FREE-FILM SEARCH RESULTS':'RIGHTS-CHECKED FREE FILMS';
    $('#savedCount').textContent=saved.size;
    $('#loadMore').style.display=(!needle&&activeGenre==='all'&&!showingSaved)?'inline-flex':'none';
  }
  function renderChips(){const host=$('#genreChips');host.innerHTML=genres.map(g=>`<button class="chip ${(activeGenre===g.toLowerCase())?'selected':''}" data-genre="${g.toLowerCase()}">${g==='All'?'✳ All titles':g}</button>`).join('');$('#genreFilter').innerHTML='<option value="all">All genres</option>'+genres.slice(1).map(g=>`<option value="${g.toLowerCase()}">${g}</option>`).join('');}
  function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.classList.remove('show'),2100);}
  function toggleSave(id){if(saved.has(id)){saved.delete(id);toast('Removed from your list');}else{saved.add(id);toast('Saved to your list');}try{localStorage.setItem('rapiflix-saved',JSON.stringify([...saved]));}catch(_){}render();if(selected?.id===id)$('#modalSave').textContent=saved.has(id)?'♥ Saved to my list':'♡ Save to my list';}
  function languageName(code){try{return new Intl.DisplayNames(['en'],{type:'language'}).of(code)||String(code||'').toUpperCase();}catch(_){return String(code||'').toUpperCase();}}
  function addSubtitleSearch(host,m){const link=document.createElement('a');link.href='https://www.opensubtitles.com/en/search-all/q-'+encodeURIComponent(m.title);link.target='_blank';link.rel='noreferrer';link.className='provider-source-link';link.textContent='Search subtitle listings for this title ↗';host.append(link);const note=document.createElement('p');note.className='source-note';note.textContent='Subtitle availability and permitted use depend on each listing. Rapiflix does not claim a subtitle or dubbed audio exists until the source confirms it.';host.append(note);}
  async function openDetails(id){
    const m=byId(id)||catalog.find(x=>x.id===id)||tmdbSearchResults.find(x=>x.id===id)||archiveSearchResults.find(x=>x.id===id);
    if(!m)return;
    modalOpener=document.activeElement instanceof HTMLElement?document.activeElement:null;
    selected=m;
    const detailsOverlay=$('#modalBackdrop'),watch=$('#modalPlay'),poster=$('#modalPoster');
    detailsOverlay.dataset.titleId=String(m.id||'');detailsOverlay.dataset.titleType=titleRouteType(m);detailsOverlay.dataset.titleLoading='0';
    document.title=m.title+' · Rapiflix';
    $('#providerOptions').innerHTML='';
    if(m.kind==='tmdb'){loadWatchProviders(m);loadOfficialTrailer(m);loadLanguageInfo(m);}else{$('#languageOptions').hidden=true;$('#languageOptions').replaceChildren();$('#trailerPreview').hidden=true;$('#trailerPreview').replaceChildren();checkArchiveRights(m);}
    poster.replaceChildren();poster.style.backgroundImage='';poster.style.setProperty('--modal-poster-blur','none');
    const url=imageUrl(m);
    if(url){
      poster.style.setProperty('--modal-poster-blur','url("'+url.replace(/["\\]/g,'')+'")');
      const image=document.createElement('img');image.loading='eager';image.decoding='async';image.alt='Poster for '+m.title;setResponsivePoster(image,m);
      image.onerror=()=>{image.remove();};image.src=url;poster.append(image);
    }
    $('#modalTitle').textContent=m.title;$('#modalKicker').textContent=titleRouteType(m).toUpperCase().replace('ARCHIVE','FREE FILM');
    const lang=m.originalLanguage?languageName(m.originalLanguage):'';
    $('#modalMeta').innerHTML=`<span>${m.year||'Year unknown'}</span><span>•</span><span>${escapeHtml(m.runtime||'Runtime varies')}</span><span>•</span><span>${escapeHtml(m.genres.join(' · '))}</span>${lang?`<span>•</span><span>Original language: ${escapeHtml(lang)}</span>`:''}`;
    $('#modalDescription').textContent=m.desc||'Explore this film from its original collection.';
    $('#modalSave').textContent=saved.has(m.id)?'♥ Saved to my list':'♡ Save to my list';
    $('#sourceNote').textContent=m.kind==='tmdb'?(m.mediaType==='tv'?'TV series information from TMDB. Audio tracks and subtitles depend on the embedded player and source.':'Movie information from TMDB. Audio tracks and subtitles depend on the embedded player and source.'):`Source: ${m.sourceName||'Internet Archive'}. Verify rights and availability for your intended use.`;
    watch.textContent=m.kind==='tmdb'?(m.mediaType==='tv'?'▶ Watch now':'▶ Watch now'):'▶ Play free film';
    watch.href=titlePageUrl(m);watch.setAttribute('aria-disabled','false');watch.removeAttribute('tabindex');
    detailsOverlay.hidden=false;detailsOverlay.setAttribute('aria-hidden','false');document.body.classList.add('modal-open');
    window.requestAnimationFrame(()=>watch.focus());
  }
  async function loadLanguageInfo(m){
    const host=$('#languageOptions');if(!host)return;
    host.hidden=false;host.innerHTML='<div class="language-panel"><h3>LANGUAGE GUIDE</h3><p class="language-note">Checking language metadata…</p></div>';
    const media=m.mediaType==='tv'?'tv':'movie';let translations=[];
    try{const response=await tmdbRequest(media+'/'+encodeURIComponent(String(m.tmdbId))+'/translations',{});if(response.ok){const data=await response.json();translations=(data.translations||[]).map(t=>({code:t.iso_639_1,name:t.english_name||t.name||t.iso_639_1})).filter(t=>t.code);}}catch(_){}
    const unique=[...new Map(translations.map(t=>[t.code,t])).values()].sort((a,b)=>a.name.localeCompare(b.name));
    host.innerHTML='';const title=document.createElement('h3');title.textContent='LANGUAGE GUIDE';host.append(title);
    const note=document.createElement('p');note.className='language-note';note.textContent='These are languages with title or metadata translations in TMDB, not confirmation of dubbed audio or subtitles in the player.';host.append(note);
    if(unique.length){const chips=document.createElement('div');chips.className='language-chips';unique.slice(0,18).forEach(t=>{const chip=document.createElement('span');chip.className='language-chip';chip.textContent=t.name;chips.append(chip);});host.append(chips);}else{const p=document.createElement('p');p.className='language-note';p.textContent='TMDB did not return translation metadata for this title.';host.append(p);}
    const link=document.createElement('a');link.href='https://www.opensubtitles.com/en/search-all/q-'+encodeURIComponent(m.title);link.target='_blank';link.rel='noreferrer';link.textContent='Search subtitle listings ↗';link.style.display='inline-block';link.style.marginTop='12px';host.append(link);
  }
  async function loadOfficialTrailer(m){
    const box=$('#trailerPreview');
    box.hidden=true;
    box.replaceChildren();
    if(!m||m.kind!=='tmdb'||!m.tmdbId)return;
    try{
      const response=await tmdbRequest((m.mediaType==='tv'?'tv/':'movie/')+encodeURIComponent(m.tmdbId)+'/videos',{language:'en-US'});
      const data=await response.json();
      if(!response.ok)throw new Error('Trailer lookup failed');
      const videos=(data.results||[]).filter(v=>v&&v.site==='YouTube'&&v.key&&/^[A-Za-z0-9_-]{6,20}$/.test(v.key));
      const trailer=videos.find(v=>v.type==='Trailer'&&v.official===true)||videos.find(v=>v.type==='Trailer')||videos.find(v=>v.type==='Teaser'&&v.official===true);
      if(!trailer)return;
      const label=document.createElement('p');
      label.className='trailer-label';
      label.textContent='OFFICIAL TRAILER PREVIEW';
      const frame=document.createElement('iframe');
      frame.src='https://www.youtube-nocookie.com/embed/'+encodeURIComponent(trailer.key);
      frame.title='Official trailer for '+m.title;
      frame.loading='lazy';
      frame.referrerPolicy='strict-origin-when-cross-origin';
      frame.allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
      frame.allowFullscreen=true;
      box.append(label,frame);
      box.hidden=false;
    }catch(_){box.hidden=true;}
  }
  function addOfficialStoreSearches(host,m){
    const wrap=document.createElement('div');
    wrap.className='store-searches';
    const heading=document.createElement('strong');
    heading.textContent='Check licensed digital stores';
    wrap.append(heading);
    const links=document.createElement('div');
    links.className='store-search-links';
    const term=encodeURIComponent(m.title+(m.year?' '+m.year:''));
    const items=[
      {label:'Apple TV',url:'https://tv.apple.com/search?term='+term},
      {label:'Prime Video',url:'https://www.primevideo.com/search/ref=atv_nb_sr?phrase='+term},
      {label:'Netflix',url:'https://www.netflix.com/search?q='+term}
    ];
    const normalized=String(m.title||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
    if(normalized.includes('spider man brand new day')){
      items.unshift({label:'Sony Pictures official page',url:'https://www.sonypictures.com/movies/spidermanbrandnewday'});
    }
    items.forEach(item=>{
      const link=document.createElement('a');
      link.href=item.url;
      link.target='_blank';
      link.rel='noopener noreferrer';
      link.className='store-search-link';
      link.textContent=item.label+' ↗';
      links.append(link);
    });
    wrap.append(links);
    const note=document.createElement('p');
    note.className='source-note';
    note.textContent='These links open official services or the studio page. Availability varies by country; a service may require a subscription, rental, or purchase. Search links do not guarantee the title is offered in your region.';
    wrap.append(note);
    host.append(wrap);
  }
  const watchRegionKey='rapiflix-watch-region';
  function watchRegion(){return localStorage.getItem(watchRegionKey)||'PK';}
  async function loadWatchProviders(m){
    const host=$('#providerOptions');
    m.watchLink='';
    host.innerHTML='<p class="source-note">Checking licensed streaming, rental and purchase options for your region…</p>';
    const region=watchRegion();
    try{
      const r=await tmdbRequest((m.mediaType==='tv'?'tv/':'movie/')+encodeURIComponent(m.tmdbId)+'/watch/providers',{});
      const d=await r.json();
      if(!r.ok)throw new Error(d.status_message||'Provider lookup failed');
      const data=d.results?.[region];
      m.watchLink=data?.link||'';
      const providers=[...(data?.flatrate||[]).map(p=>({...p,kind:'Subscription'})),...(data?.free||[]).map(p=>({...p,kind:'Free'})),...(data?.ads||[]).map(p=>({...p,kind:'Ad-supported'})),...(data?.rent||[]).map(p=>({...p,kind:'Rent'})),...(data?.buy||[]).map(p=>({...p,kind:'Buy'}))];
      host.innerHTML='<div class="provider-head"><strong>Where to watch</strong><label>Region <select id="watchRegion"><option value="PK">Pakistan</option><option value="US">United States</option><option value="GB">United Kingdom</option><option value="IN">India</option><option value="CA">Canada</option><option value="AU">Australia</option></select></label></div>';
      $('#watchRegion').value=region;
      $('#watchRegion').addEventListener('change',e=>{localStorage.setItem(watchRegionKey,e.target.value);loadWatchProviders(m);});
      if(!providers.length){
        host.insertAdjacentHTML('beforeend','<p class="source-note">No provider listings were returned for '+region+'. Availability varies by country and can change.</p>');
      }else{
        const groups={};
        providers.forEach(p=>(groups[p.kind]??=[]).push(p));
        Object.entries(groups).forEach(([kind,items])=>{
          const row=document.createElement('div');row.className='provider-group';
          const title=document.createElement('span');title.className='provider-kind';title.textContent=kind;row.append(title);
          items.forEach(p=>{
            const item=document.createElement('span');item.className='provider-pill';
            if(p.logo_path){const img=document.createElement('img');img.src='https://image.tmdb.org/t/p/w92'+p.logo_path;img.alt='';item.append(img);}
            const name=document.createElement('span');name.textContent=p.provider_name;item.append(name);row.append(item);
          });
          host.append(row);
        });
      }
      if(data?.link){
        const link=document.createElement('a');link.href=data.link;link.target='_blank';link.rel='noreferrer';link.className='provider-source-link';link.textContent='Open official availability links ↗';host.append(link);
      }
      const credit=document.createElement('p');credit.className='source-note';credit.textContent='Availability data powered by JustWatch via TMDB. Original language does not guarantee a dubbed version. Check the service itself for audio and subtitle options.';host.append(credit);
    }catch(e){
      host.innerHTML='<p class="source-note">'+escapeHtml(e.message||'Provider data unavailable.')+'</p>';
    }
    addOfficialStoreSearches(host,m);
    addSubtitleSearch(host,m);
  }
  function hasExplicitStreamRights(metadata={}){
    const text=[metadata.licenseurl,metadata.license,metadata.rights].filter(Boolean).map(String).join(' ').toLowerCase();
    const statement=String(metadata.rights||'').toLowerCase();
    if(/all rights reserved|not for distribution|no permission to redistribute|copyrighted material/.test(text))return false;
    // Conflicting studio copyright claims take priority over a generic rights URL.
    if(/copyright\s*(?:©|&copy;)?\s*\d{4}\s+by\b/.test(statement))return false;
    return /public[\s-]?domain|creativecommons\.org\/(?:licenses|publicdomain)|creative commons|\bcc0\b/.test(text);
  }
  const archiveMetadataCache=new Map();
  async function fetchArchiveMetadata(id){
    if(archiveMetadataCache.has(id))return archiveMetadataCache.get(id);
    const request=fetch(archive+'/metadata/'+encodeURIComponent(id),{cache:'no-store'}).then(async response=>{
      if(!response.ok)throw new Error('Source metadata unavailable');
      return response.json();
    });
    archiveMetadataCache.set(id,request);
    try{return await request;}catch(error){archiveMetadataCache.delete(id);throw error;}
  }
  async function licensedPlayableArchiveDocs(docs,tag){
    const accepted=[];
    for(let start=0;start<docs.length;start+=6){
      const batch=await Promise.all(docs.slice(start,start+6).map(async d=>{
        try{
          const id=String(d.identifier||'');
          const title=Array.isArray(d.title)?d.title[0]:d.title;
          if(!id||!title||byId(id))return null;
          const metadata=await fetchArchiveMetadata(id);
          if(!hasExplicitStreamRights(metadata.metadata||{})||!archiveVideoFiles(metadata).length)return null;
          const yearValue=Array.isArray(d.year)?d.year[0]:d.year;
          const descValue=Array.isArray(d.description)?d.description[0]:d.description;
          return {id,title:String(title).slice(0,140),year:Number(yearValue)||0,runtime:'Runtime varies',genres:['Archive'],desc:String(descValue||'A film with a public-domain or Creative Commons rights statement.').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').slice(0,500),poster:archive+'/services/img/'+encodeURIComponent(id),video:'',source:archive+'/details/'+encodeURIComponent(id),sourceName:'Internet Archive',kind:'archive-search',tag};
        }catch(_){return null;}
      }));
      accepted.push(...batch.filter(Boolean));
    }
    return accepted;
  }
  async function checkArchiveRights(m){const host=$('#providerOptions');if(!host)return;host.innerHTML='<p class="source-note">Checking source metadata and playable files…</p>';try{const d=await fetchArchiveMetadata(m.id);const md=d.metadata||{};const files=(d.files||[]).filter(f=>/\.(mp4|m4v|webm|ogv)$/i.test(f.name||'')&&!/(thumb|sample|trailer|preview|poster|torrent|storyboard)/i.test(f.name||''));const rights=md.licenseurl||md.rights||md.license||'';const explicit=hasExplicitStreamRights(md);host.innerHTML='<strong>Free-film source check</strong><p class="source-note">'+(files.length?'Compatible video file(s) found: '+files.length+'.':'No compatible video file was found in metadata.')+'</p><p class="source-note">'+(explicit?'Public-domain/Creative Commons wording is present in source metadata. Review its exact terms.':'No clear, non-conflicting public-domain or Creative Commons statement was found. Rapiflix will not play this item in-site.')+'</p>'+(rights?'<p class="source-note">Declared rights: '+escapeHtml(String(rights).slice(0,320))+'</p>':'')+'<a class="provider-source-link" href="'+escapeHtml(m.source||'https://archive.org/details/'+encodeURIComponent(m.id))+'" target="_blank" rel="noreferrer">Review original item and rights ↗</a>';addSubtitleSearch(host,m);}catch(e){host.innerHTML='<strong>Source check unavailable</strong><p class="source-note">Could not verify playable files or rights metadata. Open the original item page before relying on this source.</p>';}}
  const progressKey='rapiflix-watch-progress';
  function readProgress(id){try{return Number((JSON.parse(localStorage.getItem(progressKey)||'{}'))[id]||0);}catch(_){return 0;}}
  function writeProgress(id,time,duration){try{const all=JSON.parse(localStorage.getItem(progressKey)||'{}');if(duration>0&&time/duration>.96)delete all[id];else if(time>5)all[id]=Math.floor(time);localStorage.setItem(progressKey,JSON.stringify(all));}catch(_){}}
  function archiveVideoFiles(data){return (data.files||[]).filter(f=>/\.(mp4|m4v|webm|ogv)$/i.test(f.name||'')&&!/(thumb|sample|trailer|preview|poster|torrent|storyboard|\.ia\.)/i.test(f.name||'')&&!/^(metadata|__ia_thumb)/i.test(f.name||'')).map(f=>{const name=String(f.name||'');const ext=(name.split('.').pop()||'').toLowerCase();const height=Number(f.height)||0;const size=Number(f.size)||0;let score=ext==='mp4'||ext==='m4v'?300:ext==='webm'?220:160;if(height>=360&&height<=1080)score+=25;if(height>1080)score-=20;if(size>1500*1024*1024)score-=25;if(size>0&&size<4*1024*1024)score-=60;if(/512kb|lowres|tiny/i.test(name))score-=40;return {name,ext,size,height,score,url:archive+'/download/'+encodeURIComponent(data.metadata?.identifier||'')+'/'+name.split('/').map(encodeURIComponent).join('/')}}).sort((a,b)=>b.score-a.score||(a.size||Number.MAX_SAFE_INTEGER)-(b.size||Number.MAX_SAFE_INTEGER));}
  async function fetchCineProSources(tmdbId,mediaType='movie',season,episode){
    if(!/^\d{1,20}$/.test(String(tmdbId)))throw new Error('Invalid TMDB title ID.');
    let path='v1/movies/'+encodeURIComponent(String(tmdbId));
    if(mediaType==='tv'){
      if(!Number.isInteger(Number(season))||Number(season)<0||Number(season)>99||!Number.isInteger(Number(episode))||Number(episode)<1||Number(episode)>9999)throw new Error('Invalid season or episode number.');
      path='v1/tv/'+encodeURIComponent(String(tmdbId))+'/seasons/'+Number(season)+'/episodes/'+Number(episode);
    }
    const response=await fetch('/api/cinepro/'+path,{headers:{Accept:'application/json'},cache:'no-store'});
    let data={};try{data=await response.json();}catch(_){}
    if(!response.ok)throw new Error(data.error?.message||data.error||'CinePro request failed ('+response.status+').');
    const subtitles=(Array.isArray(data.subtitles)?data.subtitles:[]).map(track=>({label:track.label||track.language||'Subtitle',language:track.language||'und',src:track.url})).filter(track=>typeof track.src==='string'&&/^https:\/\//i.test(track.src));
    return (Array.isArray(data.sources)?data.sources:[]).filter(source=>source&&typeof source.url==='string'&&/^https:\/\//i.test(source.url)).map((source,index)=>({
      authorized:true,
      provider:'CinePro · '+String(source.provider?.name||source.provider||'Source provider'),
      label:String(source.quality||source.label||('Source '+(index+1))),
      url:source.url,
      type:String(source.type||'mp4').toLowerCase(),
      height:Number(String(source.quality||'').match(/\d{3,4}/)?.[0])||0,
      subtitles,
      audioTracks:Array.isArray(source.audioTracks)?source.audioTracks:[]
    }));
  }
  async function withTimeout(promise, milliseconds, message){
    let timeoutId;
    try{
      return await Promise.race([
        promise,
        new Promise((_,reject)=>{timeoutId=setTimeout(()=>reject(new Error(message)),milliseconds);})
      ]);
    }finally{clearTimeout(timeoutId);}
  }
  async function playFilm(m){
    // Playback must never wait for an optional manifest request. The default movie and TV players do not need it.
    if(!m)return;
    // Keep VidCore as the default movie player and offer CinePro as an additional source.
    if(m.kind==='tmdb'&&m.mediaType!=='tv'&&!m.forceCineProPlayback){
      $('#modalBackdrop').hidden=true;$('#playerBackdrop').hidden=false;document.body.classList.add('modal-open');
      $('#playerTitle').textContent=m.title;
      const frame=$('#playerFrame'), controls=$('#playerControls');
      controls.innerHTML='<div class="provider-switch" hidden aria-hidden="true"><button type="button" id="playVidCore" class="secondary-button">VidCore</button><button type="button" id="playCinePro" class="secondary-button">CinePro sources</button></div><p class="source-note" id="cineProStatus" hidden aria-hidden="true">VidCore is active. CinePro can be tried without removing the existing provider.</p>';
      function showVidCore(){
        const iframe=document.createElement('iframe');
        iframe.src='https://vidcore.org/embed/movie/'+encodeURIComponent(String(m.tmdbId));
        iframe.title='Video player for '+m.title;
        iframe.width='100%';iframe.height='100%';iframe.frameBorder='0';
        iframe.allow='autoplay; encrypted-media; picture-in-picture; fullscreen';iframe.setAttribute('allow','autoplay; encrypted-media; picture-in-picture; fullscreen');iframe.setAttribute('allowfullscreen','');iframe.setAttribute('webkitallowfullscreen','');
        iframe.allowFullscreen=true;iframe.referrerPolicy='strict-origin-when-cross-origin';
        // Restrict provider popups and top-level redirects. Ads drawn inside the cross-origin player cannot be removed from this site.
        iframe.setAttribute('sandbox','allow-scripts allow-same-origin allow-forms allow-presentation');iframe.loading='eager';
        iframe.style.width='100%';iframe.style.height='100%';iframe.style.minHeight='min(62vw,620px)';iframe.style.border='0';iframe.style.background='#000';
        frame.replaceChildren(iframe);
        $('#cineProStatus').textContent='VidCore is active. Choose CinePro sources to check the second provider.';
      }
      controls.querySelector('#playVidCore').addEventListener('click',showVidCore);
      controls.querySelector('#playCinePro').addEventListener('click',async()=>{
        const status=$('#cineProStatus');status.textContent='Checking CinePro sources…';
        try{
          const sources=await fetchCineProSources(m.tmdbId,'movie');
          if(!sources.length)throw new Error('CinePro returned no playable sources for this title.');
          await playFilm({...m,forceCineProPlayback:true,authorizedSources:sources});
        }catch(error){status.textContent='CinePro unavailable: '+error.message+' VidCore remains available.';}
      });
      showVidCore();
      return;
    }
    // TV playback uses the requested VidCore episode route. The series TMDB ID alone
    // is not enough: the player URL also needs a season and episode number.
    if(m.kind==='tmdb'&&m.mediaType==='tv'&&!m.forceCineProPlayback){
      $('#modalBackdrop').hidden=true;$('#playerBackdrop').hidden=false;document.body.classList.add('modal-open');
      $('#playerTitle').textContent=m.title;
      const frame=$('#playerFrame'), controls=$('#playerControls');
      frame.innerHTML='<div class="player-placeholder"><div class="live-dot"></div><strong>Loading episodes…</strong><p>Getting season and episode information.</p></div>';
      controls.innerHTML='<label>Season <select id="tvSeason"><option value="1">Season 1</option></select></label><label>Episode <select id="tvEpisode"><option value="1">Episode 1</option></select></label><button type="button" id="playCineProEpisode" class="secondary-button" hidden aria-hidden="true">Try CinePro sources</button><p class="source-note" id="cineProEpisodeStatus" hidden aria-hidden="true">VidCore remains the default TV player.</p>';
      const seasonSelect=controls.querySelector('#tvSeason'), episodeSelect=controls.querySelector('#tvEpisode');
      let seasonData=[];
      function loadVidCoreEpisode(){
        const parsedSeason=Number(seasonSelect.value);
        const season=Number.isFinite(parsedSeason)?Math.max(0,parsedSeason):1;
        const episode=Math.max(1,Number(episodeSelect.value)||1);
        const iframe=document.createElement('iframe');
        iframe.src='https://vidcore.org/embed/tv/'+encodeURIComponent(String(m.tmdbId))+'/'+season+'/'+episode;
        iframe.title=m.title+' — Season '+season+', Episode '+episode;
        iframe.width='100%';iframe.height='100%';iframe.frameBorder='0';
        iframe.allow='autoplay; encrypted-media; picture-in-picture; fullscreen';iframe.setAttribute('allow','autoplay; encrypted-media; picture-in-picture; fullscreen');iframe.setAttribute('allowfullscreen','');iframe.setAttribute('webkitallowfullscreen','');
        iframe.allowFullscreen=true;
        iframe.referrerPolicy='strict-origin-when-cross-origin';
        // Restrict provider popups and top-level redirects. Ads drawn inside the cross-origin player cannot be removed from this site.
        iframe.setAttribute('sandbox','allow-scripts allow-same-origin allow-forms allow-presentation');
        iframe.loading='eager';
        iframe.style.width='100%';iframe.style.height='100%';iframe.style.minHeight='min(62vw,620px)';iframe.style.border='0';iframe.style.background='#000';
        frame.replaceChildren(iframe);
      }
      controls.querySelector('#playCineProEpisode').addEventListener('click',async()=>{
        const season=Math.max(0,Number(seasonSelect.value)||0),episode=Math.max(1,Number(episodeSelect.value)||1);
        const status=controls.querySelector('#cineProEpisodeStatus');status.textContent='Checking CinePro sources…';
        try{
          const sources=await fetchCineProSources(m.tmdbId,'tv',season,episode);
          if(!sources.length)throw new Error('CinePro returned no playable sources for this episode.');
          await playFilm({...m,forceCineProPlayback:true,authorizedSources:sources,episodeSeason:season,episodeNumber:episode});
        }catch(error){status.textContent='CinePro unavailable: '+error.message+' VidCore remains available.';}
      });
      seasonSelect.addEventListener('change',async()=>{
        const seasonNumber=Number(seasonSelect.value)||1;
        const season=seasonData.find(item=>Number(item.season_number)===seasonNumber);
        const count=Number(season&&season.episode_count)||1;
        episodeSelect.innerHTML='';
        for(let n=1;n<=count;n++){const option=document.createElement('option');option.value=String(n);option.textContent='Episode '+n;episodeSelect.append(option);}
        try{
          const response=await withTimeout(tmdbRequest('tv/'+encodeURIComponent(String(m.tmdbId))+'/season/'+seasonNumber,{language:'en-US'}),5000,'Season metadata request timed out.');
          if(response.ok){const data=await response.json();(data.episodes||[]).forEach((ep,index)=>{const option=episodeSelect.options[index];if(option&&ep.name)option.textContent='Episode '+ep.episode_number+' · '+ep.name;});}
        }catch(_){}
        loadVidCoreEpisode();
      });
      episodeSelect.addEventListener('change',loadVidCoreEpisode);
      try{
        const response=await withTimeout(tmdbRequest('tv/'+encodeURIComponent(String(m.tmdbId)),{language:'en-US'}),5000,'Series metadata request timed out.');
        if(response.ok){const data=await response.json();seasonData=(data.seasons||[]).filter(item=>Number(item.season_number)>=0);if(seasonData.length){seasonSelect.innerHTML=seasonData.map(item=>'<option value="'+Number(item.season_number)+'">'+escapeHtml(item.name||('Season '+item.season_number))+'</option>').join('');}}
        seasonSelect.value=seasonData.some(item=>Number(item.season_number)===1)?'1':String(Number(seasonData[0]?.season_number)||0);
        const seasonNumber=Number(seasonSelect.value)||0;
        const season=seasonData.find(item=>Number(item.season_number)===seasonNumber);
        const count=Math.max(1,Number(season&&season.episode_count)||1);
        episodeSelect.innerHTML='';
        for(let n=1;n<=count;n++){const option=document.createElement('option');option.value=String(n);option.textContent='Episode '+n;episodeSelect.append(option);}
        const seasonResponse=await withTimeout(tmdbRequest('tv/'+encodeURIComponent(String(m.tmdbId))+'/season/'+seasonNumber,{language:'en-US'}),5000,'Season metadata request timed out.');
        if(seasonResponse.ok){const data=await seasonResponse.json();(data.episodes||[]).forEach((ep,index)=>{const option=episodeSelect.options[index];if(option&&ep.name)option.textContent='Episode '+ep.episode_number+' · '+ep.name;});}
      }catch(_){/* Still allow manual episode selection if TMDB episode metadata is unavailable. */}
      loadVidCoreEpisode();
      return;
    }
    if(m.kind==='tmdb'&&!m.forceCineProPlayback&&!getAuthorizedSources(m).length){
      const watchUrl=m.watchLink||('https://www.themoviedb.org/'+(m.mediaType==='tv'?'tv/':'movie/')+encodeURIComponent(m.tmdbId)+'/watch');
      window.open(watchUrl,'_blank','noopener,noreferrer');
      closeModal('#modalBackdrop');
      toast('Opened official watch options for this title');
      return;
    }
    if(m.kind==='tmdb'&&!m.forceCineProPlayback)m.authorizedSources=getAuthorizedSources(m);
    $('#modalBackdrop').hidden=true;$('#playerBackdrop').hidden=false;document.body.classList.add('modal-open');
    $('#playerTitle').textContent=m.title;
    const frame=$('#playerFrame'), controls=$('#playerControls');
    frame.innerHTML='<div class="player-placeholder"><div class="live-dot"></div><strong>Preparing your film…</strong><p>Checking source rights, video files, and playback tracks.</p></div>';
    controls.innerHTML='<label>Source <select id="playerSource" disabled><option>Finding authorized sources…</option></select></label><label>Quality <select id="playerQuality" disabled><option>Auto</option></select></label><label>Subtitles <select id="playerSubtitles" disabled><option value="off">Off</option></select></label><label>Audio <select id="playerAudio" disabled><option value="default">Source default</option></select></label>';
    if(m.kind==='tmdb'&&m.forceCineProPlayback){
      const back=document.createElement('button');back.type='button';back.className='secondary-button';back.textContent='Back to VidCore';
      back.addEventListener('click',()=>playFilm({...m,forceCineProPlayback:false,authorizedSources:undefined}));
      controls.prepend(back);
    }
    const iframeSources=validatedLicensedSources(m.authorizedSources).filter(source=>source.mode==='iframe');
    if(m.kind==='tmdb'&&iframeSources.length){
      controls.innerHTML=iframeSources.length>1?'<label>Authorized embed source <select id="iframeSource"></select></label>':'<p class="source-note">Playing through an authorized external player. Audio and subtitle options are controlled by that provider.</p>';
      frame.replaceChildren();
      const iframe=document.createElement('iframe');
      iframe.title='Authorized player for '+m.title;
      iframe.allow='autoplay; encrypted-media; picture-in-picture; fullscreen';iframe.setAttribute('allow','autoplay; encrypted-media; picture-in-picture; fullscreen');iframe.setAttribute('allowfullscreen','');iframe.setAttribute('webkitallowfullscreen','');
      iframe.allowFullscreen=true;
      iframe.referrerPolicy='strict-origin-when-cross-origin';
        // Restrict provider popups and top-level redirects. Ads drawn inside the cross-origin player cannot be removed from this site.
        iframe.setAttribute('sandbox','allow-scripts allow-same-origin allow-forms allow-presentation');
      // Limit the third-party player iframe so it cannot open pop-up windows or navigate the top-level page.
      // This cannot remove ads rendered inside the provider's own player.
      iframe.setAttribute('sandbox','allow-scripts allow-same-origin allow-forms allow-presentation');
      iframe.loading='eager';
      iframe.style.width='100%';
      iframe.style.height='100%';
      iframe.style.minHeight='min(62vw,620px)';
      iframe.style.border='0';
      iframe.style.background='#000';
      function selectEmbed(source){
        if(!source||source.authorized!==true||typeof source.url!=='string'||!/^https:\/\//i.test(source.url))return;
        iframe.src=source.url;
        iframe.title=source.label||source.provider||('Player for '+m.title);
        frame.replaceChildren(iframe);
      }
      if(iframeSources.length>1){
        const select=controls.querySelector('#iframeSource');
        select.innerHTML=iframeSources.map((source,i)=>'<option value="'+i+'">'+escapeHtml(source.label||source.provider||('Source '+(i+1)))+'</option>').join('');
        select.addEventListener('change',()=>selectEmbed(iframeSources[Number(select.value)]));
      }
      selectEmbed(iframeSources[0]);
      return;
    }
    try{
      let metadata;
      if(m.kind!=='tmdb'){
        try{metadata=await fetchArchiveMetadata(m.id);}catch(e){if(!m.video&&!Array.isArray(m.authorizedSources))throw e;}
        if(metadata&&!hasExplicitStreamRights(metadata.metadata||{}))throw new Error('This item has no clear, non-conflicting public-domain or Creative Commons rights statement. Rapiflix will not play it in-site.');
      }
      let candidates=metadata?archiveVideoFiles(metadata).map(f=>({...f,provider:'Internet Archive',url:archive+'/download/'+encodeURIComponent(m.id)+'/'+f.name.split('/').map(encodeURIComponent).join('/')})):[];
      if(m.video&&!candidates.some(c=>c.url===m.video))candidates.push({name:'Authorized source stream',ext:'mp4',height:0,score:-10,provider:m.sourceName||'Authorized source',url:m.video});
      if(Array.isArray(m.authorizedSources)){
        for(const source of m.authorizedSources){
          if(source&&source.authorized===true&&source.mode!=='iframe'&&typeof source.url==='string'&&/^https:\/\//i.test(source.url)){
            candidates.push({name:source.label||source.provider||'Authorized provider',provider:source.provider||'Authorized provider',height:Number(source.height)||0,ext:source.type||'mp4',type:source.type||'',score:Number(source.score)||0,url:source.url,subtitles:Array.isArray(source.subtitles)?source.subtitles:[],audioTracks:Array.isArray(source.audioTracks)?source.audioTracks:[]});
          }
        }
      }
      const unique=new Map();candidates.forEach(c=>{if(c.url&&!unique.has(c.url))unique.set(c.url,c);});candidates=[...unique.values()];
      if(!candidates.length)throw new Error('No compatible video file was found for this rights-checked free-film item.');
      let sourceIndex=0,lastSaved=0,restored=false,trackList=[],externalAudio=null;
      const video=document.createElement('video');
      video.controls=true;video.autoplay=true;video.playsInline=true;video.preload='metadata';video.setAttribute('aria-label','Now playing: '+m.title);
      frame.replaceChildren(video);
      const sourceSelect=$('#playerSource'),qualitySelect=$('#playerQuality'),subtitleSelect=$('#playerSubtitles'),audioSelect=$('#playerAudio');
      const heightLabel=h=>h?({2160:'2160p / 4K',1440:'1440p',1080:'1080p',720:'720p',576:'576p',480:'480p',360:'360p'}[h]||h+'p'):'Auto / source default';
      function setSourceOptions(){sourceSelect.innerHTML=candidates.map((c,i)=>'<option value="'+i+'">'+escapeHtml((c.provider||'Authorized source')+' · '+(c.name||'Video file'))+'</option>').join('');sourceSelect.disabled=candidates.length<2;}
      let hlsEngine=null;
      function attachSubtitles(candidate){
        video.querySelectorAll('track').forEach(t=>t.remove());
        const subtitles=[...(candidate.subtitles||[])];
        if(metadata)(metadata.files||[]).filter(f=>/\.vtt$/i.test(f.name||'')&&!/(sample|preview|thumb)/i.test(f.name||'')).forEach(f=>subtitles.push({label:String(f.name).split('/').pop().replace(/\.vtt$/i,'').replace(/[_-]+/g,' '),language:'und',src:archive+'/download/'+encodeURIComponent(m.id)+'/'+String(f.name).split('/').map(encodeURIComponent).join('/')}));
        subtitles.forEach((track,i)=>{if(!track||typeof track.src!=='string'||!/^https:\/\//i.test(track.src))return;const el=document.createElement('track');el.kind='subtitles';el.label=track.label||track.language||('Subtitle '+(i+1));el.srclang=track.language||'und';el.src=track.src;video.append(el);});
        trackList=[...video.querySelectorAll('track')];
        updateSubtitleOptions();
      }
      function updateSubtitleOptions(){
        const items=[{value:'off',label:'Off'}];
        trackList.forEach((track,i)=>items.push({value:'file-'+i,label:track.label||('Subtitle '+(i+1))}));
        if(hlsEngine)(hlsEngine.subtitleTracks||[]).forEach((track,i)=>items.push({value:'hls-sub-'+i,label:track.name||track.lang||track.language||('Stream subtitle '+(i+1))}));
        const previous=subtitleSelect.value;
        subtitleSelect.innerHTML=items.map(item=>'<option value="'+escapeHtml(item.value)+'">'+escapeHtml(item.label)+'</option>').join('');
        subtitleSelect.value=items.some(item=>item.value===previous)?previous:'off';
        subtitleSelect.disabled=items.length<=1;
        trackList.forEach((track,i)=>{track.track.mode=subtitleSelect.value==='file-'+i?'showing':'disabled';});
        if(hlsEngine&&subtitleSelect.value.startsWith('hls-sub-'))hlsEngine.subtitleTrack=Number(subtitleSelect.value.slice(8));
        else if(hlsEngine)hlsEngine.subtitleTrack=-1;
      }
      function updateAudioOptions(){
        const items=[];
        if(hlsEngine){
          (hlsEngine.audioTracks||[]).forEach((track,i)=>items.push({value:'hls-audio-'+i,label:track.name||track.lang||track.language||('Stream audio '+(i+1))}));
        }else{
          const tracks=video.audioTracks;
          if(tracks&&tracks.length){for(let i=0;i<tracks.length;i++)items.push({value:String(i),label:tracks[i].label||tracks[i].language||('Audio '+(i+1))});}
        }
        (candidates[sourceIndex].audioTracks||[]).forEach((track,i)=>{if(track&&typeof track.src==='string'&&/^https:\/\//i.test(track.src))items.push({value:'external-'+i,label:track.label||track.language||('Audio '+(i+1))});});
        const previous=audioSelect.value;
        audioSelect.innerHTML='<option value="default">Source default</option>'+items.map(item=>'<option value="'+escapeHtml(item.value)+'">'+escapeHtml(item.label)+'</option>').join('');
        if(items.some(item=>item.value===previous))audioSelect.value=previous;
        audioSelect.disabled=items.length===0;
      }
      function setQualityOptions(){
        const manifestHeights=hlsEngine?(hlsEngine.levels||[]).map(level=>Number(level.height)||0):[];
        const heights=[...new Set([...candidates.map(c=>Number(c.height)||0),...manifestHeights].filter(Boolean))].sort((a,b)=>b-a);
        const previous=qualitySelect.value;
        qualitySelect.innerHTML='<option value="auto">Auto (best available)</option>'+heights.map(height=>'<option value="'+height+'">'+heightLabel(height)+'</option>').join('');
        if(previous!=='auto'&&heights.includes(Number(previous)))qualitySelect.value=previous;
        else qualitySelect.value='auto';
        qualitySelect.disabled=heights.length===0;
      }
      function stopExternalAudio(){if(externalAudio){externalAudio.pause();externalAudio.removeAttribute('src');externalAudio.load();externalAudio=null;}video.muted=false;}
      function loadCandidate(index,manual=false){
        stopExternalAudio();
        if(hlsEngine){try{hlsEngine.destroy();}catch(_){}hlsEngine=null;}
        sourceIndex=Math.max(0,Math.min(index,candidates.length-1));
        const candidate=candidates[sourceIndex];
        sourceSelect.value=String(sourceIndex);
        video.pause();
        video.removeAttribute('src');
        video.querySelectorAll('track').forEach(track=>track.remove());
        video.load();
        trackList=[];
        const isHls=/\.m3u8(?:[?#]|$)/i.test(candidate.url)||String(candidate.type||'').toLowerCase()==='hls';
        if(isHls&&window.Hls&&window.Hls.isSupported()){
          hlsEngine=new window.Hls({enableWorker:true,capLevelToPlayerSize:true});
          hlsEngine.on(window.Hls.Events.MANIFEST_PARSED,()=>{
            setQualityOptions();
            updateAudioOptions();
            updateSubtitleOptions();
            if(manual)video.play().catch(()=>{});
          });
          hlsEngine.on(window.Hls.Events.LEVELS_UPDATED,setQualityOptions);
          hlsEngine.on(window.Hls.Events.AUDIO_TRACKS_UPDATED,updateAudioOptions);
          hlsEngine.on(window.Hls.Events.SUBTITLE_TRACKS_UPDATED,updateSubtitleOptions);
          hlsEngine.on(window.Hls.Events.ERROR,(_,data)=>{
            if(data&&data.fatal){
              const next=candidates.findIndex((source,i)=>i>sourceIndex);
              if(next>=0)loadCandidate(next,true);
              else showFailure();
            }
          });
          hlsEngine.loadSource(candidate.url);
          hlsEngine.attachMedia(video);
          attachSubtitles(candidate);
          setQualityOptions();
          updateAudioOptions();
        }else if(isHls&&video.canPlayType('application/vnd.apple.mpegurl')){
          video.src=candidate.url;
          video.load();
          attachSubtitles(candidate);
          setQualityOptions();
          updateAudioOptions();
          if(manual)video.play().catch(()=>{});
        }else if(isHls){
          showFailure();
        }else{
          video.src=candidate.url;
          video.load();
          attachSubtitles(candidate);
          setQualityOptions();
          updateAudioOptions();
          if(manual)video.play().catch(()=>{});
        }
      }
      const showFailure=()=>{frame.innerHTML='<div class="player-placeholder"><strong>None of the available video sources played.</strong><p>Try another source or open the original film page.</p><a href="'+escapeHtml(m.source||archive+'/details/'+encodeURIComponent(m.id))+'" target="_blank" rel="noreferrer">Open original film page ↗</a></div>';};
      video.addEventListener('loadedmetadata',()=>{if(!restored){restored=true;const savedAt=readProgress(m.id);if(savedAt>10&&savedAt<video.duration-10){video.currentTime=savedAt;toast('Resumed where you left off');}}updateAudioOptions();});
      video.addEventListener('timeupdate',()=>{if(video.currentTime-lastSaved>=8){lastSaved=video.currentTime;writeProgress(m.id,video.currentTime,video.duration);}if(externalAudio&&!externalAudio.paused&&Math.abs(externalAudio.currentTime-video.currentTime)>.35)externalAudio.currentTime=video.currentTime;});
      video.addEventListener('play',()=>{if(externalAudio)externalAudio.play().catch(()=>{});});
      video.addEventListener('pause',()=>{if(externalAudio)externalAudio.pause();if(video.duration>0)writeProgress(m.id,video.currentTime,video.duration);});
      video.addEventListener('ended',()=>{if(externalAudio)externalAudio.pause();writeProgress(m.id,video.duration||video.currentTime,video.duration);});
      video.addEventListener('error',()=>{const next=candidates.findIndex((c,i)=>i>sourceIndex);if(next>=0){sourceIndex=next;sourceSelect.value=String(next);loadCandidate(next,true);}else showFailure();});
      setSourceOptions();setQualityOptions();
      sourceSelect.addEventListener('change',()=>loadCandidate(Number(sourceSelect.value),true));
      qualitySelect.addEventListener('change',()=>{
        const wanted=qualitySelect.value;
        if(hlsEngine&&(hlsEngine.levels||[]).length){
          if(wanted==='auto'){hlsEngine.currentLevel=-1;return;}
          const match=hlsEngine.levels.findIndex(level=>String(Number(level.height)||0)===wanted);
          if(match>=0){hlsEngine.currentLevel=match;return;}
        }
        if(wanted==='auto'){loadCandidate(0,true);return;}
        const match=candidates.findIndex(candidate=>String(Number(candidate.height)||0)===wanted);
        if(match>=0)loadCandidate(match,true);
      });
      subtitleSelect.addEventListener('change',()=>{
        trackList.forEach((track,i)=>{track.track.mode=subtitleSelect.value==='file-'+i?'showing':'disabled';});
        if(hlsEngine){
          if(subtitleSelect.value.startsWith('hls-sub-'))hlsEngine.subtitleTrack=Number(subtitleSelect.value.slice(8));
          else hlsEngine.subtitleTrack=-1;
        }
      });
      audioSelect.addEventListener('change',()=>{
        const tracks=video.audioTracks;
        if(audioSelect.value.startsWith('hls-audio-')&&hlsEngine){stopExternalAudio();hlsEngine.audioTrack=Number(audioSelect.value.slice(10));}
        else if(tracks&&tracks.length&&audioSelect.value!=='default'&&!audioSelect.value.startsWith('external-')){for(let i=0;i<tracks.length;i++)tracks[i].enabled=audioSelect.value===String(i);stopExternalAudio();}
        else if(audioSelect.value.startsWith('external-')){
          const t=candidates[sourceIndex].audioTracks[Number(audioSelect.value.slice(9))];if(!t||!t.src)return;
          stopExternalAudio();externalAudio=new Audio(t.src);externalAudio.preload='auto';externalAudio.volume=video.volume;video.muted=true;
          externalAudio.addEventListener('loadedmetadata',()=>{externalAudio.currentTime=Math.min(video.currentTime,Math.max(0,externalAudio.duration-.1));if(!video.paused)externalAudio.play().catch(()=>{});});
          externalAudio.playbackRate=video.playbackRate;
        }else{stopExternalAudio();if(tracks)for(let i=0;i<tracks.length;i++)tracks[i].enabled=true;}
      });
      video.addEventListener('volumechange',()=>{if(externalAudio)externalAudio.volume=video.volume;});
      loadCandidate(0);
    }catch(e){frame.innerHTML='<div class="player-placeholder"><strong>Film unavailable in the embedded player.</strong><p>'+escapeHtml(e.message||'The original source did not respond.')+'</p><a href="'+escapeHtml(m.source||archive+'/details/'+encodeURIComponent(m.id))+'" target="_blank" rel="noreferrer">Open original film page ↗</a></div>';}
  }
  function closeModal(el){
    const node=$(el);
    if(!node)return;
    node.hidden=true;
    node.setAttribute('aria-hidden','true');
    if(el==='#modalBackdrop'&&modalOpener&&modalOpener.isConnected){
      const opener=modalOpener;modalOpener=null;
      window.requestAnimationFrame(()=>opener.focus());
    }
    if($('#modalBackdrop').hidden&&$('#playerBackdrop').hidden)document.body.classList.remove('modal-open');
  }
  const archiveSearchCache=new Map();
  async function searchArchive(text){
    const term=String(text||'').trim();
    if(term.length<2)return;
    const cacheKey=term.toLowerCase();
    const requestId=++archiveSearchSequence;
    const isCurrentSearch=()=>requestId===archiveSearchSequence&&query.trim().toLowerCase()===cacheKey;
    if(archiveSearchCache.has(cacheKey)){
      if(!isCurrentSearch())return;
      archiveSearchResults=archiveSearchCache.get(cacheKey);
      archiveSearchLoading=false;render();renderSearchSuggestions();return;
    }
    archiveSearchLoading=true;renderSearchSuggestions();
    setTmdbStatus('Searching for full films with declared rights and playable files…');
    try{
      const safeTerm=term.replace(/["\\]/g,' ').replace(/\s+/g,' ').trim();
      const url=new URL(archive+'/advancedsearch.php');
      url.searchParams.set('q','title:("'+safeTerm+'") AND mediatype:movies');
      ['identifier','title','year','description'].forEach(field=>url.searchParams.append('fl[]',field));
      url.searchParams.set('rows','12');url.searchParams.set('page','1');
      url.searchParams.append('sort[]','downloads desc');url.searchParams.set('output','json');
      const response=await fetch(url);
      if(!response.ok)throw new Error('Internet Archive search did not respond');
      const data=await response.json();
      if(!isCurrentSearch())return;
      const found=await licensedPlayableArchiveDocs(data.response?.docs||[],'ARCHIVE SEARCH');
      if(!isCurrentSearch())return;
      archiveSearchCache.set(cacheKey,found);
      archiveSearchResults=found;archiveSearchLoading=false;
      render();renderSearchSuggestions();
      setTmdbStatus(found.length?'Found '+found.length+' Archive title(s) with a compatible file and declared rights.':'No matching Archive titles passed the rights and playback check. Try a shorter title or another film.');
    }catch(error){
      if(!isCurrentSearch())return;
      archiveSearchLoading=false;renderSearchSuggestions();
      setTmdbStatus('Archive search error: '+(error.message||'Could not search the source collection.'));
    }
  }
  async function verifyCuratedCatalog(){
    const originals=catalog.filter(m=>m.kind==='curated');
    const checked=await Promise.all(originals.map(async m=>{
      try{
        const data=await fetchArchiveMetadata(m.id);
        const rightsOk=hasExplicitStreamRights(data.metadata||{});
        const filesOk=archiveVideoFiles(data).length>0;
        return {id:m.id,ok:rightsOk&&filesOk};
      }catch(_){return {id:m.id,ok:false};}
    }));
    const rejected=new Set(checked.filter(x=>!x.ok).map(x=>x.id));
    if(rejected.size){
      for(let i=catalog.length-1;i>=0;i--)if(rejected.has(catalog[i].id))catalog.splice(i,1);
      const retained=featuredIds.filter(id=>byId(id));
      if(retained.length){featuredIds.splice(0,featuredIds.length,...retained);heroIndex=0;updateHero(0);}
      renderChips();render();
    }
    const retainedCount=originals.length-rejected.size;
    const liveTitles=catalog.filter(m=>m.kind==='tmdb').length;
    setTmdbStatus((liveTitles?'Current movie discovery is available. ':'')+'Search trending, popular, upcoming and now-playing releases. Movie cards are discovery unless a verified playable source is available.');
  }
  async function loadMore(){
    const btn=$('#loadMore');btn.disabled=true;btn.textContent='Checking more films…';
    try{
      const q='collection:feature_films AND mediatype:movies';
      const url=archive+'/advancedsearch.php?q='+encodeURIComponent(q)+'&fl[]=identifier&fl[]=title&fl[]=year&fl[]=description&rows=24&page='+extraPage+'&sort[]=downloads desc&output=json';
      const response=await fetch(url);
      if(!response.ok)throw new Error('Archive search did not respond');
      const data=await response.json();
      const found=await licensedPlayableArchiveDocs(data.response?.docs||[],'ARCHIVE DISCOVERY');
      let added=0;
      for(const m of found){if(byId(m.id))continue;catalog.push(m);added++;}
      extraPage++;activeGenre='all';$('#genreFilter').value='all';renderChips();render();
      toast(added?'Added '+added+' playable, rights-labelled films':'No new films on this page passed the rights and playback check');
    }catch(_){toast('Archive discovery is temporarily unavailable');}
    finally{btn.disabled=false;btn.innerHTML='Explore more classics <span>↗</span>';}
  }
  async function loadAndFill(endpoint,label){
    const requestId=++catalogLoadSequence;
    autoLoadingMore=true;
    try{
      await loadTmdb(endpoint,label,requestId);
      if(requestId!==catalogLoadSequence)return;
      for(let i=0;i<4&&currentTmdbPage<currentTmdbTotalPages&&!query.trim()&&requestId===catalogLoadSequence;i++)await loadMoreTmdb(true,requestId);
    }finally{if(requestId===catalogLoadSequence)autoLoadingMore=false;}
  }
  window.addEventListener('scroll',()=>{
    const remaining=document.documentElement.scrollHeight-(window.innerHeight+window.scrollY);
    if(remaining>1700)autoLoadArmed=true;
    if(query.trim()||autoLoadingMore||!autoLoadArmed||currentTmdbPage>=currentTmdbTotalPages)return;
    // Only paginate in response to a real user scroll, not layout changes caused by filtering/rendering.
    if(Date.now()-lastUserScrollAt>1200)return;
    if(remaining<=850){
      autoLoadArmed=false;
      autoLoadingMore=true;
      loadMoreTmdb(true).finally(()=>{autoLoadingMore=false;});
    }
  },{passive:true});
  renderChips();updateHero(0);render();
  loadLicensedStreamManifest();
  tmdbRequest('genre/movie/list',{language:'en-US'}).catch(()=>null).then(r=>r&&r.ok?r.json():null).then(d=>{(d&&d.genres||[]).forEach(g=>tmdbGenreMap[g.id]=g.name);}).catch(()=>{});
  if(!isLocalPreview())$('#tmdbConnect').textContent='Refresh catalogue';
  $('#tmdbConnect').addEventListener('click',()=>loadAndFill(currentTmdbEndpoint,currentTmdbLabel));
  $('#retryCatalog').addEventListener('click',()=>{setCatalogRetry(false);loadAndFill(currentTmdbEndpoint,currentTmdbLabel);});
  loadAndFill('trending/movie/week','Trending 2000–2026');
  $('#loadMoreTmdb').addEventListener('click',()=>loadMoreTmdb(false,catalogLoadSequence));
  document.querySelector('.tmdb-actions').addEventListener('click',e=>{const b=e.target.closest('[data-tmdb]');if(b)loadAndFill(b.dataset.tmdb,b.textContent.trim());});
  let tmdbSearchTimer,archiveSearchTimer;
  function scheduleSearch(term){
    clearTimeout(tmdbSearchTimer);clearTimeout(archiveSearchTimer);
    const normalized=String(term||'').trim();
    if(normalized.length<2){tmdbSearchLoading=false;archiveSearchLoading=false;renderSearchSuggestions();return;}
    tmdbSearchLoading=true;archiveSearchLoading=true;renderSearchSuggestions();
    tmdbSearchTimer=setTimeout(()=>searchTmdb(normalized),120);
    archiveSearchTimer=setTimeout(()=>searchArchive(normalized),180);
  }
  $('#searchInput').addEventListener('input',e=>{
    const previous=query;
    query=e.target.value;
    hideSuggestionsUntilNextInput=false;
    if(!previous.trim()&&query.trim()){
      activeGenre='all';activeEra='2000-2026';showingSaved=false;
      $('#genreFilter').value='all';$('#eraFilter').value=activeEra;renderChips();
    }
    tmdbSearchSequence++;archiveSearchSequence++;
    tmdbSearchResults=[];archiveSearchResults=[];
    tmdbSearchLoading=false;archiveSearchLoading=false;
    render();scheduleSearch(query);
  });
  document.addEventListener('rapiflix:search-submit',e=>{
    const term=String(e.detail?.query||$('#searchInput').value||'').trim();
    if(!term)return;
    query=term;$('#searchInput').value=term;hideSuggestionsUntilNextInput=true;
    clearTimeout(tmdbSearchTimer);clearTimeout(archiveSearchTimer);
    tmdbSearchSequence++;archiveSearchSequence++;
    tmdbSearchLoading=archiveSearchLoading=term.length>=2;
    render();renderSearchSuggestions();
    setTmdbStatus('Searching for “'+term+'”…');
    if(term.length>=2){searchTmdb(term);searchArchive(term);}
  });
  document.addEventListener('rapiflix:clear-search',()=>{
    clearTimeout(tmdbSearchTimer);clearTimeout(archiveSearchTimer);
    query='';hideSuggestionsUntilNextInput=false;tmdbSearchSequence++;archiveSearchSequence++;
    tmdbSearchResults=[];archiveSearchResults=[];tmdbSearchLoading=false;archiveSearchLoading=false;
    renderSearchSuggestions();render();
  });
  $('#searchSuggestions')?.addEventListener('click',e=>{
    const button=e.target.closest('[data-search-suggestion]');
    if(!button)return;
    const id=button.dataset.searchSuggestion;
    const title=[...tmdbSearchResults,...archiveSearchResults].find(m=>m.id===id);
    if(!title)return;
    hideSuggestionsUntilNextInput=true;$('#searchSuggestions').hidden=true;$('#searchInput').setAttribute('aria-expanded','false');
    $('#searchInput').blur();openDetails(id);
  });
  $('#searchSuggestions')?.addEventListener('keydown',e=>{
    if(e.key==='Escape'){$('#searchSuggestions').hidden=true;$('#searchInput').setAttribute('aria-expanded','false');$('#searchInput').focus();}
  });
  $('#searchInput').addEventListener('keydown',e=>{
    if(e.key==='ArrowDown'){
      const first=$('#searchSuggestions [data-search-suggestion]');
      if(first&&!$('#searchSuggestions').hidden){e.preventDefault();first.focus();}
    }
  });

  let activeDetailRequest='', detailMovie=null, detailTvSeasons=[], detailSelectedSeason=1, detailSelectedEpisode=1, detailEpisodeRequest=0;
  const detailImage=(path,size='w500')=>path?'https://image.tmdb.org/t/p/'+size+path:'';
  function detailMoney(value){return shared.formatMoney?shared.formatMoney(value):'Not reported';}
  const detailDate=value=>{if(!value)return 'Not announced';const d=new Date(value+'T00:00:00');return Number.isNaN(d.getTime())?String(value):d.toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'});};
  function resetDetailPlayer(){
    const mount=$('#detailPlayerMount'),placeholder=$('#detailPlayerPlaceholder'),note=$('#detailPlayerNote');
    if(mount)mount.replaceChildren();
    if(placeholder)placeholder.hidden=false;
    if(note)note.textContent='Playback availability depends on the selected title and third-party source.';
    const provider=$('#detailPlayerProvider');if(provider)provider.textContent='VidCore player';
  }
  function renderDetailFacts(detail,isTv,release){
    const genres=(detail.genres||[]).map(g=>g.name).filter(Boolean).join(' · ')||'Not reported';
    const runtime=isTv?(detail.episode_run_time||[]).filter(Boolean).length?detail.episode_run_time.filter(Boolean).join(', ')+' min per episode':'Not reported':Number(detail.runtime)>0?detail.runtime+' minutes':'Not reported';
    const rows=[
      ['Type',isTv?'TV series':'Movie'],
      ['Genre',genres],
      ['Released',detailDate(release)],
      [isTv?'Seasons':'Runtime',isTv?(Number(detail.number_of_seasons)>0?String(detail.number_of_seasons):'Not reported'):runtime],
      ...(isTv?[['Episodes',Number(detail.number_of_episodes)>0?Number(detail.number_of_episodes).toLocaleString('en-US'):'Not reported']]:[]),
      ['Original language',detail.original_language?languageName(detail.original_language):'Not reported'],
      ['Status',detail.status||'Not reported'],
      ['Original title',detail.original_title||detail.original_name||detail.title||detail.name||'Not reported']
    ];
    $('#detailFacts').innerHTML=rows.map(([label,value])=>'<div class="detail-fact"><span>'+escapeHtml(label)+'</span><strong>'+escapeHtml(String(value))+'</strong></div>').join('');
  }
  function renderDetailMoney(detail){
    const host=$('#detailMoneyChart'),section=$('#detailBudgetSection');
    if(!host||!section)return;
    const budget=Number(detail.budget)>0?Number(detail.budget):0;
    const revenue=Number(detail.revenue)>0?Number(detail.revenue):0;
    // The brief requires the entire block to disappear unless both reported
    // numbers are real positive values. Never manufacture an estimate.
    if(!(budget>0&&revenue>0)){
      section.hidden=true;
      host.replaceChildren();
      return;
    }
    section.hidden=false;
    const max=Math.max(budget,revenue);
    const rows=[['Budget',budget],['Box office',revenue]];
    host.innerHTML=rows.map(([label,value])=>{
      const width=Math.max(2,value/max*100);
      return '<div class="detail-money-row"><span class="detail-money-label">'+label+'</span><div class="detail-money-track" role="img" aria-label="'+label+' reported amount"><i style="--money-width:'+width.toFixed(2)+'%"></i></div><strong class="detail-money-value" data-money-value="'+value+'">'+escapeHtml(detailMoney(value))+'</strong></div>';
    }).join('');
    const ratio=revenue/budget;
    host.insertAdjacentHTML('beforeend','<p class="detail-money-multiplier">It earned about <strong>'+ratio.toFixed(1)+'×</strong> its budget.</p>');
    requestAnimationFrame(()=>host.querySelectorAll('.detail-money-track i').forEach(bar=>bar.classList.add('is-ready')));
  }
  function mountDetailPlayer(season=detailSelectedSeason,episode=detailSelectedEpisode,scrollToPlayer=true){
    const params=new URLSearchParams(location.search);
    const rawId=Number(detailMovie?.tmdbId||params.get('id'));
    if(!Number.isSafeInteger(rawId)||rawId<=0){
      const note=$('#detailPlayerNote');if(note)note.textContent='This title link has no valid catalogue ID. Return to Rapiflix and open it again.';
      return;
    }
    const media=detailMovie?.mediaType==='tv'||params.get('type')==='tv'?'tv':'movie';
    const title=detailMovie?.title||(location.pathname.split('/').filter(Boolean).pop()||'Selected title').replace(/-/g,' ');
    const safeSeason=Number.isInteger(Number(season))&&Number(season)>=0?Number(season):1;
    const safeEpisode=Number.isInteger(Number(episode))&&Number(episode)>0?Number(episode):1;
    const frame=document.createElement('iframe');
    frame.src=media==='tv'
      ?'https://vidcore.org/embed/tv/'+encodeURIComponent(String(rawId))+'/'+safeSeason+'/'+safeEpisode
      :'https://vidcore.org/embed/movie/'+encodeURIComponent(String(rawId));
    frame.title=media==='tv'?title+' — Season '+safeSeason+', Episode '+safeEpisode:'Video player for '+title;
    frame.allow='autoplay; encrypted-media; picture-in-picture; fullscreen';
    frame.setAttribute('allow',frame.allow);
    frame.setAttribute('allowfullscreen','');
    frame.setAttribute('webkitallowfullscreen','');
    frame.allowFullscreen=true;
    frame.referrerPolicy='strict-origin-when-cross-origin';
    // Keep the same iframe restrictions as the existing popup player.
    frame.setAttribute('sandbox','allow-scripts allow-same-origin allow-forms allow-presentation');
    frame.loading='eager';
    $('#detailPlayerMount').replaceChildren(frame);
    $('#detailPlayerPlaceholder').hidden=true;
    $('#detailPlayerProvider').textContent='VidCore player';
    const note=$('#detailPlayerNote');
    if(note)note.textContent=media==='tv'?'Requested episode: Season '+safeSeason+', Episode '+safeEpisode+'. Availability depends on the third-party source.':'Playback is provided by VidCore. Availability depends on the third-party source.';
    if(scrollToPlayer)$('#detailPlayerSection').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
  }
  async function loadDetailEpisodes(seasonNumber,requestKey){
    const host=$('#detailEpisodes');
    if(!host)return;
    const requestId=++detailEpisodeRequest;
    host.innerHTML='<p class="detail-loading">Loading episode information…</p>';
    const season=Number(seasonNumber);
    try{
      const response=await withTimeout(tmdbRequest('tv/'+encodeURIComponent(String(detailMovie.tmdbId))+'/season/'+season,{language:'en-US'}),5000,'Episode metadata timed out.');
      const data=await response.json();
      if(!response.ok)throw new Error('Episode metadata request failed.');
      if(activeDetailRequest!==requestKey||requestId!==detailEpisodeRequest)return;
      const episodes=Array.isArray(data.episodes)?data.episodes:[];
      $('#detailEpisodeCount').textContent=episodes.length?episodes.length+' episodes':'Episode list';
      if(!episodes.length){
        host.innerHTML='<p class="detail-episodes-empty">TMDB has not listed episodes for this season. Watch now can still open the selected season and episode.</p>';
        return;
      }
      host.innerHTML=episodes.slice(0,100).map(ep=>{
        const number=Number(ep.episode_number)||0;
        const name=ep.name||('Episode '+number);
        const date=String(ep.air_date||'').slice(0,4);
        const runtime=Number(ep.runtime)>0?ep.runtime+' min':date||'Runtime not reported';
        return '<button class="detail-episode" type="button" data-detail-episode="'+number+'" aria-current="'+(number===detailSelectedEpisode?'true':'false')+'"><span class="detail-episode-number">'+number+'</span><span class="detail-episode-copy"><strong>'+escapeHtml(name)+'</strong><small>'+escapeHtml(ep.overview||'No episode synopsis has been provided.')+'</small></span><span class="detail-episode-runtime">'+escapeHtml(runtime)+'</span></button>';
      }).join('');
      if(episodes.length>100){
        const note=document.createElement('p');note.className='detail-episodes-empty';note.textContent='Showing the first 100 of '+episodes.length+' listed episodes.';host.append(note);
      }
    }catch(error){
      if(activeDetailRequest!==requestKey||requestId!==detailEpisodeRequest)return;
      $('#detailEpisodeCount').textContent='Episode list unavailable';
      host.innerHTML='<p class="detail-episodes-empty">Episode names could not be loaded right now. The VidCore player is still available for manual season and episode selection.</p>';
      // The visible message and Retry/details controls are the failure path.
    }
  }
  function initializeDetailEpisodes(detail,requestKey){
    const section=$('#detailEpisodesSection'),chips=$('#detailSeasonChips'),host=$('#detailEpisodes');
    detailTvSeasons=Array.isArray(detail.seasons)?detail.seasons.filter(s=>Number.isFinite(Number(s.season_number))&&Number(s.season_number)>=0&&Number(s.episode_count)>0):[];
    if(!detailMovie||detailMovie.mediaType!=='tv'||!detailTvSeasons.length){
      section.hidden=true;chips.replaceChildren();host.replaceChildren();$('#detailEpisodeCount').textContent='';
      return;
    }
    section.hidden=false;
    detailSelectedSeason=Number(detailTvSeasons.find(s=>Number(s.season_number)===1)?.season_number??detailTvSeasons[0].season_number);
    detailSelectedEpisode=1;
    chips.innerHTML=detailTvSeasons.map(season=>{
      const number=Number(season.season_number);
      const label=season.name||('Season '+number);
      return '<button class="detail-season-chip" type="button" data-detail-season="'+number+'" aria-pressed="'+(number===detailSelectedSeason?'true':'false')+'">'+escapeHtml(label)+'</button>';
    }).join('');
    loadDetailEpisodes(detailSelectedSeason,requestKey);
  }
  function setDetailNotFound(isNotFound, message=''){
    const notice=$('#detailNotFound'),hero=$('#detailHero'),content=$('.detail-content');
    if(notice)notice.hidden=!isNotFound;
    if(hero)hero.hidden=isNotFound;
    if(content)content.hidden=isNotFound;
    if(isNotFound){
      const copy=$('#detailNotFound p:not(.detail-label)');
      if(copy&&message)copy.textContent=message;
      document.title='We couldn’t find that title · Rapiflix';
    }
  }
  async function loadTitleExperience(route){
    const isArchive=route.type==='archive';
    const rawId=String(route.id||'').trim();
    const id=isArchive?rawId.replace(/[^a-zA-Z0-9._-]/g,''):rawId.replace(/[^0-9]/g,'');
    const media=route.type==='tv'?'tv':'movie';
    const requestKey=(isArchive?'archive':media)+':'+id;
    if(!id||(!isArchive&&!Number.isSafeInteger(Number(id)))||(isArchive&&!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,199}$/.test(id))){
      setDetailNotFound(true,'This link does not contain a valid catalogue id. Return home and choose a title from the catalogue.');
      $('#detailWatchNow').disabled=true;
      return;
    }
    setDetailNotFound(false);
    if(activeDetailRequest===requestKey&&detailMovie)return;
    activeDetailRequest=requestKey;detailMovie=null;detailTvSeasons=[];detailSelectedSeason=1;detailSelectedEpisode=1;detailEpisodeRequest++;
    resetDetailPlayer();
    $('#detailEpisodesSection').hidden=true;$('#detailEpisodes').replaceChildren();$('#detailSeasonChips').replaceChildren();
    $('#detailFacts').innerHTML='<p class="detail-loading">Loading title facts…</p>';
    $('#detailMoneyChart').innerHTML='<p class="detail-loading">Checking reported financial figures…</p>';
    const titleFallback=(route.slug||'').replace(/-/g,' ')||'Loading title…';
    $('#detailTitle').textContent=titleFallback;$('#detailOverview').textContent='Gathering the story, cast, production details and viewing information.';
    $('#detailCast').innerHTML='<p class="detail-loading">Finding the cast…</p>';$('#detailCrew').innerHTML='<p class="detail-loading">Finding key crew…</p>';$('#detailProduction').innerHTML='<p class="detail-loading">Loading production details…</p>';$('#detailRecommendations').innerHTML='<p class="detail-loading">Finding related titles…</p>';
    $('#detailWatchNow').disabled=false;$('#detailWatchNow').innerHTML='▶ <span>Watch now</span>';$('#detailTrailer').hidden=true;$('#detailRetry').hidden=true;$('#detailFacts').replaceChildren();
    if(isArchive){
      try{
        const source=await withTimeout(fetchArchiveMetadata(id),10000,'The free-film source took too long to respond.');
        if(activeDetailRequest!==requestKey)return;
        const metadata=source.metadata||{};
        const files=archiveVideoFiles(source);
        const title=String(metadata.title||titleFallback).slice(0,140);
        const year=Number(String(metadata.year||'').slice(0,4))||0;
        const verified=hasExplicitStreamRights(metadata)&&files.length>0;
        const archiveDetail={
          id:0,title,name:title,original_title:title,overview:String(metadata.description||metadata.title||'No synopsis is available for this free-film item.').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').slice(0,900),
          genres:[{name:'Archive'}],release_date:year?String(year)+'-01-01':'',runtime:0,original_language:'',status:verified?'Rights metadata found':'Rights metadata needs review'
        };
        detailMovie={id:'archive-'+id,title,year,runtime:'Runtime varies',genres:['Archive'],desc:archiveDetail.overview,poster:archive+'/services/img/'+encodeURIComponent(id),source:archive+'/details/'+encodeURIComponent(id),sourceName:'Internet Archive',kind:'archive',mediaType:'archive',archiveId:id};
        selected=detailMovie;
        $('#detailTitle').textContent=title;
        $('#detailEyebrow').textContent=verified?'FREE FILM SOURCE · RIGHTS CHECKED':'FREE FILM SOURCE · REVIEW REQUIRED';
        $('#detailOverview').textContent=verified?archiveDetail.overview:'The source has been found, but Rapiflix could not verify both a compatible video file and a clear rights statement. Review the original item before relying on it.';
        $('#detailMeta').innerHTML='<span>'+escapeHtml(year?String(year):'Year unknown')+'</span><span>Archive item</span><span>'+escapeHtml(verified?'Compatible file found':'Playback not verified')+'</span>';
        const poster=$('#detailPoster');poster.src=detailMovie.poster;poster.alt=title+' poster';poster.hidden=false;poster.removeAttribute('srcset');poster.removeAttribute('sizes');
        const posterWrap=$('.detail-poster-wrap');if(posterWrap)posterWrap.style.setProperty('--detail-poster-blur','url(\"'+detailMovie.poster.replace(/[\"\\]/g,'')+'\")');
        const backdrop=$('#detailBackdrop');if(backdrop)backdrop.style.backgroundImage='none';
        renderDetailFacts(archiveDetail,false,archiveDetail.release_date);
        renderDetailMoney({budget:0,revenue:0});
        $('#detailEpisodesSection').hidden=true;
        $('#detailCast').innerHTML='<p class="detail-loading">Cast information is not supplied by this Archive item.</p>';
        $('#detailCrew').innerHTML='<p class="detail-loading">Crew information is not supplied by this Archive item.</p>';
        $('#detailProduction').innerHTML='<div class="detail-production-item"><span>Source</span><strong>Internet Archive</strong></div><div class="detail-production-item"><span>Rights note</span><strong>'+escapeHtml(String(metadata.rights||metadata.license||metadata.licenseurl||'Review original item metadata'))+'</strong></div>';
        $('#detailRecommendations').innerHTML='<p class="detail-loading">Related title metadata is not supplied for this Archive item.</p>';
        $('#detailWatchNow').disabled=!verified;
        $('#detailWatchNow').innerHTML=verified?'▶ <span>Play rights-checked film</span>':'▶ <span>Playback unavailable</span>';
        $('#detailPlayerNote').textContent=verified?'Playback will re-check the source rights and compatible files before starting.':'Playback is disabled until a clear rights statement and compatible file are present.';
        return;
      }catch(error){
        if(activeDetailRequest!==requestKey)return;
        setDetailNotFound(true,'This free-film source could not be loaded or verified. Return to the catalogue and try another item.');
        return;
      }
    }
    const base=media+'/'+encodeURIComponent(id);
    try{
      // Fetch the title itself first so Watch now becomes usable without waiting
      // for optional cast, recommendations, trailer and provider metadata.
      const baseResponse=await withTimeout(
        tmdbRequest(base,{language:'en-US'}).then(async response=>({ok:response.ok,status:response.status,data:await response.json()})),
        10000,
        'The title service took too long to respond.'
      ).catch(()=>({ok:false,data:{status_message:'The title service took too long to respond.'}}));
      if(activeDetailRequest!==requestKey)return;
      const detail=baseResponse.data;
      if(!baseResponse.ok||!detail||!detail.id){
        if(baseResponse.status===404||baseResponse.data?.status_code===6||baseResponse.data?.status_code===34||baseResponse.data?.status===404){
          setDetailNotFound(true,'Rapiflix could not find this title in the catalogue. Return home and choose another title.');
          return;
        }
        throw new Error('Rapiflix could not load this title from TMDB.');
      }
      const isTv=media==='tv', title=isTv?(detail.name||detail.original_name):(detail.title||detail.original_title), release=isTv?detail.first_air_date:detail.release_date;
      detailMovie=mapTmdbMovie({...detail,genre_ids:(detail.genres||[]).map(g=>g.id)},'DETAIL',media);
      detailMovie.title=title||titleFallback;detailMovie.year=Number(String(release||'').slice(0,4))||0;detailMovie.desc=detail.overview||'No synopsis has been provided for this title.';detailMovie.runtime=isTv?((detail.episode_run_time||[])[0]?detail.episode_run_time[0]+' min per episode':'TV series'):(detail.runtime?detail.runtime+' min':'Runtime unavailable');detailMovie.genres=(detail.genres||[]).map(g=>g.name);detailMovie.originalLanguage=detail.original_language||'';detailMovie.poster=detailImage(detail.poster_path,'w500');detailMovie.backdrop=detailImage(detail.backdrop_path,'original');detailMovie.kind='tmdb';detailMovie.mediaType=media;detailMovie.tmdbId=Number(detail.id);detailMovie.id='tmdb-'+(isTv?'tv-':'')+detail.id;
      selected=detailMovie;
      $('#detailWatchNow').disabled=false;
      $('#detailWatchNow').innerHTML='▶ <span>Watch now</span>';
      const extraEndpoints=[base+'/credits',base+'/recommendations',base+'/similar',base+'/videos',base+'/watch/providers'];
      // Start optional profile requests in parallel, but never hold the visible title page hostage to them.
      const extrasPromise=Promise.all(extraEndpoints.map(path=>withTimeout(
        tmdbRequest(path,{language:'en-US'}).then(async response=>({ok:response.ok,data:await response.json()})),
        7000,
        'Optional title metadata request timed out.'
      ).catch(()=>({ok:false,data:{}}))));
      if(activeDetailRequest!==requestKey)return;
      document.title=title+' · Rapiflix';
      const meta=document.querySelector('meta[name="description"]');if(meta)meta.content='Explore '+title+' on Rapiflix: synopsis, cast, production, ratings, budget, related titles and viewing options.';
      $('#detailTitle').textContent=title||titleFallback;
      $('#detailEyebrow').textContent=[isTv?'SERIES PROFILE':'FEATURE FILM PROFILE',detail.status].filter(Boolean).join(' · ').toUpperCase();
      $('#detailOverview').textContent=detail.overview||'No synopsis is available yet. Explore the cast, creative team and production information below.';
      const poster=$('#detailPoster');poster.src=detailMovie.poster||'';poster.alt=(title||'Title')+' poster';poster.hidden=!detailMovie.poster;setResponsivePoster(poster,{posterPath:detail.poster_path,title});
      const posterWrap=$('.detail-poster-wrap');
      if(posterWrap&&detailMovie.poster)posterWrap.style.setProperty('--detail-poster-blur','url("'+detailMovie.poster.replace(/["\\]/g,'')+'")');
      else if(posterWrap)posterWrap.style.removeProperty('--detail-poster-blur');
      const backdrop=$('#detailBackdrop');if(detailMovie.backdrop)backdrop.style.backgroundImage='url("'+detailMovie.backdrop.replace(/["\\]/g,'')+'")';else backdrop.style.backgroundImage='none';
      const score=Number(detail.vote_average)>0?Number(detail.vote_average).toFixed(1)+'/10':'Not rated';
      const runtime=isTv?(detail.number_of_seasons?detail.number_of_seasons+' season'+(detail.number_of_seasons===1?'':'s'):'Series'):(detail.runtime?detail.runtime+' min':'Runtime unavailable');
      $('#detailMeta').innerHTML='<span class="detail-rating">★ '+escapeHtml(score)+'</span><span>'+escapeHtml(String(release||'Release date unknown').slice(0,4))+'</span><span>'+escapeHtml(runtime)+'</span><span>'+escapeHtml((detail.genres||[]).slice(0,3).map(g=>g.name).join(' · ')||'Genre unlisted')+'</span>';
      renderDetailFacts(detail,isTv,release);
      renderDetailMoney(detail);
      initializeDetailEpisodes(detail,requestKey);
      $('#detailWatchNow').disabled=false;$('#detailWatchNow').innerHTML='▶ <span>Watch now</span>';
      $('#detailSave').textContent=saved.has(detailMovie.id)?'♥ Saved to my list':'♡ Save to my list';
      const extras=await extrasPromise;
      if(activeDetailRequest!==requestKey)return;
      const responses=[baseResponse,...extras];
      const videos=(responses[4].data.results||[]).filter(v=>v&&v.site==='YouTube'&&v.key&&/^[A-Za-z0-9_-]{6,20}$/.test(v.key));
      const trailer=videos.find(v=>v.type==='Trailer'&&v.official===true)||videos.find(v=>v.type==='Trailer')||videos.find(v=>v.type==='Teaser');
      const trailerLink=$('#detailTrailer');if(trailer){trailerLink.href='https://www.youtube.com/watch?v='+encodeURIComponent(trailer.key);trailerLink.hidden=false;}
      const credits=responses[1].data||{}, cast=(credits.cast||[]).slice(0,12);
      $('#detailCastCount').textContent=(credits.cast||[]).length?String((credits.cast||[]).length)+' credited performers':'CAST';
      $('#detailCast').innerHTML=cast.length?cast.map(person=>'<article class="detail-person"><div class="detail-person-image">'+(person.profile_path?'<img loading="lazy" src="'+escapeHtml(detailImage(person.profile_path,'w185'))+'" alt="">':'<span>'+escapeHtml((person.name||'?').slice(0,1))+'</span>')+'</div><strong>'+escapeHtml(person.name||'Unknown performer')+'</strong><span>'+escapeHtml(person.character||person.roles?.[0]?.character||'Cast')+'</span></article>').join(''):'<p class="detail-loading">Cast information has not been listed for this title.</p>';
      const crew=credits.crew||[];
      const priorities=isTv?['Creator','Executive Producer','Director','Writer','Producer']:['Director','Screenplay','Writer','Producer','Director of Photography','Original Music Composer'];
      const keyCrew=priorities.map(job=>crew.find(p=>p.job===job||p.jobs?.some(j=>j.job===job))).filter(Boolean).filter((p,i,a)=>a.findIndex(q=>q.id===p.id)===i).slice(0,5);
      $('#detailCrew').innerHTML=keyCrew.length?keyCrew.map(person=>'<div class="detail-crew-item"><span>'+escapeHtml(person.job||person.jobs?.[0]?.job||'Crew')+'</span><strong>'+escapeHtml(person.name||'Unknown')+'</strong></div>').join(''):'<p class="detail-loading">Key crew information is not available.</p>';
      const companies=detail.production_companies||detail.networks||[];
      const country=(detail.production_countries||[]).map(p=>p.name).filter(Boolean).join(', ');
      const production=[['Production',companies.map(p=>p.name).filter(Boolean).join(' · ')||'Not reported'],['Country',country||((detail.origin_country||[]).join(', '))||'Not reported'],['Original title',detail.original_title||detail.original_name||title],['Tagline',detail.tagline||'No tagline listed'],['Website',detail.homepage?'Official website available':'Not listed']];
      $('#detailProduction').innerHTML=production.map(([label,value])=>'<div class="detail-production-item"><span>'+escapeHtml(label)+'</span><strong>'+escapeHtml(String(value))+'</strong></div>').join('');
      const related=(responses[2].data.results||[]).filter(p=>p&&p.id).slice(0,6);
      const similar=(responses[3].data.results||[]).filter(p=>p&&p.id);
      const pool=[...related,...similar].filter((p,i,a)=>a.findIndex(q=>q.id===p.id)===i).slice(0,8);
      $('#detailRecommendations').innerHTML=pool.length?pool.map(item=>{
        const itemTitle=isTv?(item.name||item.original_name):(item.title||item.original_title);
        const itemType=item.media_type==='tv'||isTv?'tv':'movie';
        const itemDate=itemType==='tv'?item.first_air_date:item.release_date;
        const itemPoster=detailImage(item.poster_path,'w342');
        const path='/title/'+shared.slugForRecord({title:itemTitle,year:Number(String(itemDate||'').slice(0,4)),id:item.id}, [])+'?id='+encodeURIComponent(item.id)+'&type='+itemType;
        return '<a class="detail-related-card" href="'+escapeHtml(path)+'"><div class="detail-related-poster'+(itemPoster?' style="--detail-poster-blur:url(&quot;'+escapeHtml(itemPoster)+'&quot;)"':'')+'>'+(itemPoster?'<img loading="lazy" srcset="'+escapeHtml(item.poster_path?['w342','w500','w780'].map(size=>'https://image.tmdb.org/t/p/'+size+item.poster_path+' '+size.replace('w','')+'w').join(', '):'')+'" sizes="(max-width: 620px) 30vw, 140px" src="'+escapeHtml(itemPoster)+'" alt="">':'<span>R</span>')+'</div><strong>'+escapeHtml(itemTitle||'Untitled')+'</strong><span>'+escapeHtml(String(itemDate||'').slice(0,4)||'Year unknown')+' · '+escapeHtml(Number(item.vote_average)>0?'★ '+Number(item.vote_average).toFixed(1):'Not rated')+'</span></a>';
      }).join(''):'<p class="detail-loading">No related titles were returned for this entry.</p>';
      // Detail-page buttons are bound once below. Binding them here as well caused
      // playback to initialize twice and saved-list clicks to toggle twice.
    }catch(error){
      if(activeDetailRequest!==requestKey)return;
      $('#detailTitle').textContent=titleFallback;$('#detailOverview').textContent='Title information could not be loaded. The player can still be tried; cast and production data may be unavailable until the connection recovers.';$('#detailWatchNow').disabled=false;$('#detailWatchNow').innerHTML='▶ <span>Watch now</span>';
      $('#detailCast').innerHTML='<p class="detail-loading">Cast information is unavailable right now.</p>';$('#detailCrew').innerHTML='<p class="detail-loading">Crew information is unavailable right now.</p>';$('#detailProduction').innerHTML='<p class="detail-loading">Production information is unavailable right now.</p>';$('#detailRecommendations').innerHTML='<p class="detail-loading">Related titles are unavailable right now.</p>';$('#detailRetry').hidden=false;
      // The visible message and Retry button are the failure path.
    }
  }
  document.addEventListener('rapiflix:detail-page',event=>loadTitleExperience(event.detail||{}));
  $('#detailBack').addEventListener('click',event=>{
    try{
      const referrer=document.referrer?new URL(document.referrer):null;
      if(referrer&&referrer.origin===location.origin&&history.length>1){event.preventDefault();history.back();}
    }catch(_){/* The normal / home href remains the safe fallback. */}
  });
  $('#detailRetry').addEventListener('click',()=>{
    const current=route();
    loadTitleExperience({id:current.id,type:current.type,slug:current.slug});
  });
  $('#detailWatchNow').addEventListener('click',()=>{
    if(detailMovie?.kind==='archive')playFilm(detailMovie);
    else mountDetailPlayer(detailSelectedSeason,detailSelectedEpisode,true);
  });
  $('#detailSeasonChips').addEventListener('click',event=>{
    const button=event.target.closest('[data-detail-season]');
    if(!button||!detailMovie||detailMovie.mediaType!=='tv')return;
    detailSelectedSeason=Number(button.dataset.detailSeason);
    detailSelectedEpisode=1;
    $('#detailSeasonChips').querySelectorAll('[data-detail-season]').forEach(chip=>chip.setAttribute('aria-pressed',String(Number(chip.dataset.detailSeason)===detailSelectedSeason)));
    loadDetailEpisodes(detailSelectedSeason,activeDetailRequest);
  });
  $('#detailEpisodes').addEventListener('click',event=>{
    const button=event.target.closest('[data-detail-episode]');
    if(!button)return;
    detailSelectedEpisode=Number(button.dataset.detailEpisode);
    $('#detailEpisodes').querySelectorAll('[data-detail-episode]').forEach(episode=>episode.setAttribute('aria-current',String(Number(episode.dataset.detailEpisode)===detailSelectedEpisode)));
    mountDetailPlayer(detailSelectedSeason,detailSelectedEpisode,true);
  });
  $('#detailSave').addEventListener('click',()=>{
    const params=new URLSearchParams(location.search);
    const rawId=detailMovie?.tmdbId||Number(params.get('id'));
    if(detailMovie?.kind==='archive'){
      toggleSave(detailMovie.id);
      $('#detailSave').textContent=saved.has(detailMovie.id)?'♥ Saved to my list':'♡ Save to my list';
      return;
    }
    if(!Number.isFinite(Number(rawId))||Number(rawId)<=0)return;
    const id=detailMovie?.id||('tmdb-'+(params.get('type')==='tv'?'tv-':'')+String(rawId));
    toggleSave(id);
    $('#detailSave').textContent=saved.has(id)?'♥ Saved to my list':'♡ Save to my list';
  });
$('#genreFilter').addEventListener('change',e=>{activeGenre=e.target.value;renderChips();render();});$('#eraFilter').addEventListener('change',e=>{activeEra=e.target.value;render();});$('#genreChips').addEventListener('click',e=>{const b=e.target.closest('[data-genre]');if(!b)return;activeGenre=b.dataset.genre;$('#genreFilter').value=activeGenre;renderChips();render();});$('#sortButton').addEventListener('click',()=>{sortNewest=!sortNewest;$('#sortButton').innerHTML=`↕ <span>${sortNewest?'Newest first':'Featured'}</span>`;render();});const handleMovieGridClick=e=>{
    const saveBtn=e.target.closest('[data-save]');
    if(saveBtn){e.stopPropagation();toggleSave(saveBtn.dataset.save);return;}
    const titleLink=e.target.closest('a[data-title-link]');
    // Title links are intentionally ordinary anchors. The poster/play affordance
    // remains the quick-view target, while the title text works without JS.
    if(titleLink)return;
    const details=e.target.closest('[data-details]');
    if(details){openDetails(details.dataset.details);return;}
    const card=e.target.closest('[data-card]');
    if(card)openDetails(card.dataset.card);
  };
  ['#movieGrid','#freeMovieGrid'].forEach(selector=>$(selector)?.addEventListener('click',handleMovieGridClick));
  $('#savedToggle').addEventListener('click',()=>{showingSaved=!showingSaved;$('#savedToggle').style.borderColor=showingSaved?'var(--accent)':'';$('#savedToggle').innerHTML=`${showingSaved?'♥':'♡'} <span class="saved-count" id="savedCount">${saved.size}</span>`;document.querySelector('#library').scrollIntoView({behavior:'smooth'});render();});$('#loadMore').addEventListener('click',loadMore);$('#modalClose').addEventListener('click',()=>closeModal('#modalBackdrop'));$('#modalBackdrop').addEventListener('click',e=>{if(e.target===$('#modalBackdrop'))closeModal('#modalBackdrop');});$('#modalPlay').addEventListener('click',event=>{
    // TMDB titles use the anchor's normal navigation. That preserves keyboard,
    // touch, middle-click and open-in-new-tab behavior. Archive playback keeps
    // the existing in-page player until the source can be represented by a title record.
    if(selected?.kind!=='tmdb'){
      event.preventDefault();
      closeModal('#modalBackdrop');
      playFilm(selected);
    }
  });$('#modalSave').addEventListener('click',()=>toggleSave(selected.id));$('#playerFullscreen').addEventListener('click',async()=>{
    const dialog=$('.player-dialog'),frame=$('#playerFrame'),video=frame.querySelector('video'),button=$('#playerFullscreen'),note=$('#playerFootNote');
    try{
      if(document.fullscreenElement){await document.exitFullscreen();return;}
      if(dialog&&dialog.requestFullscreen){
        await dialog.requestFullscreen({navigationUI:'hide'});
        if(note)note.textContent='';
      }else if(video&&video.webkitEnterFullscreen){
        video.webkitEnterFullscreen();
      }else if(note){
        note.textContent='Full screen is not supported by this browser for this source.';
      }
    }catch(error){
      if(video&&video.webkitEnterFullscreen){try{video.webkitEnterFullscreen();return;}catch(_){}}
      if(note)note.textContent='This source or browser blocked full screen. Try the player’s own full-screen control.';
    }
  });
  document.addEventListener('fullscreenchange',()=>{
    const button=$('#playerFullscreen'),dialog=$('.player-dialog');if(!button)return;
    const active=Boolean(document.fullscreenElement&&(document.fullscreenElement===dialog||dialog?.contains(document.fullscreenElement)));
    button.setAttribute('aria-label',active?'Exit full screen':'Enter full screen');
    button.setAttribute('title',active?'Exit full screen':'Enter full screen');
    button.innerHTML=active?'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8V4h4m8 0h4v4M8 20H4v-4m16 0v4h-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>':'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H4a1 1 0 0 0-1 1v4m13-5h4a1 1 0 0 1 1 1v4M3 16v4a1 1 0 0 0 1 1h4m13-5v4a1 1 0 0 1-1 1h-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  });
  $('#playerClose').addEventListener('click',()=>{const v=$('#playerFrame video');if(v)v.pause();if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});$('#playerFrame').replaceChildren();closeModal('#playerBackdrop');});$('#playerBackdrop').addEventListener('click',e=>{if(e.target===$('#playerBackdrop')){$('#playerClose').click();}});$('#menuButton').addEventListener('click',()=>$('.nav-links').classList.toggle('open'));$('.nav-links').addEventListener('click',e=>{if(e.target.closest('a'))$('.nav-links').classList.remove('open');});document.addEventListener('keydown',e=>{
    const modal=$('#modalBackdrop');
    if(e.key==='Escape'){
      if(!$('#playerBackdrop').hidden){$('#playerClose').click();return;}
      if(modal&&!modal.hidden){closeModal('#modalBackdrop');return;}
    }
    if(modal&&!modal.hidden&&e.key==='Tab'){
      const focusable=[...modal.querySelectorAll('a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])')].filter(item=>!item.hidden&&item.getClientRects().length);
      if(!focusable.length){e.preventDefault();return;}
      const first=focusable[0],last=focusable[focusable.length-1];
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
    }
    if(e.key==='/'&&!/input|textarea/i.test(document.activeElement?.tagName||'')){e.preventDefault();$('#searchInput').focus();}
  });
  // Subtle pointer-responsive poster tilt, with no distracting glow effects.
  ['#movieGrid','#freeMovieGrid'].forEach(selector=>{
    const grid=$(selector);
    grid.addEventListener('pointermove',event=>{
      const card=event.target.closest('.movie-card');
      if(!card||event.pointerType==='touch')return;
      const poster=card.querySelector('.poster-wrap');if(!poster)return;
      const rect=poster.getBoundingClientRect();
      const x=(event.clientX-rect.left)/rect.width-.5;
      const y=(event.clientY-rect.top)/rect.height-.5;
      poster.style.setProperty('--tilt-x',(-y*4).toFixed(2)+'deg');
      poster.style.setProperty('--tilt-y',(x*4).toFixed(2)+'deg');
    });
    grid.addEventListener('pointerleave',()=>{
      grid.querySelectorAll('.poster-wrap').forEach(p=>{p.style.setProperty('--tilt-x','0deg');p.style.setProperty('--tilt-y','0deg');});
    });
  });
  verifyCuratedCatalog().catch(()=>{});
  // Gentle hero rotation, paused when the visitor is interacting with the hero or has reduced motion enabled.
  if(!window.matchMedia('(prefers-reduced-motion: reduce)').matches){setInterval(()=>{if(featuredIds.length&&!document.hidden&&!document.body.classList.contains('modal-open')&&!$('#searchInput').value)updateHero((heroIndex+1)%featuredIds.length);},12000);}
})();


/* Rapiflix custom cursor: viewport coordinates, one positioning system. */
(() => {
  const dot = document.querySelector('.cursor-dot');
  const ring = document.querySelector('.cursor-ring');
  if (!dot || !ring) return;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  if (!finePointer.matches) return;

  const label = ring.querySelector('span');
  const root = document.documentElement;
  root.classList.add('cc');

  function move(event) {
    if (event.pointerType === 'touch') return;
    const x = event.clientX;
    const y = event.clientY;
    dot.style.left = x + 'px';
    dot.style.top = y + 'px';
    ring.style.left = x + 'px';
    ring.style.top = y + 'px';
    dot.style.opacity = '1';
    ring.style.opacity = '1';
  }

  function hide() {
    dot.style.opacity = '0';
    ring.style.opacity = '0';
  }

  function setMode(target) {
    ring.classList.remove('view', 'cursor-violet', 'cursor-cyan', 'cursor-pink', 'cursor-lime', 'link', 'text');
    if (!(target instanceof Element)) return;
    if (target.closest('.save-card')) {
      ring.classList.add('cursor-pink');
      if (label) label.textContent = 'SAVE';
    } else if (target.closest('.card-play')) {
      ring.classList.add('cursor-lime');
      if (label) label.textContent = 'PLAY';
    } else if (target.closest('.movie-card, .poster-wrap')) {
      ring.classList.add('view');
      if (label) label.textContent = 'VIEW';
    } else if (target.closest('.tmdb-tab, .nav-links a')) {
      ring.classList.add('cursor-cyan');
      if (label) label.textContent = 'EXPLORE';
    } else if (target.closest('button, .tmdb-connect, [role="button"]')) {
      ring.classList.add('cursor-violet');
      if (label) label.textContent = 'SELECT';
    } else if (target.closest('input, textarea, select, [contenteditable="true"]')) {
      ring.classList.add('text');
    } else if (target.closest('a')) {
      ring.classList.add('link');
      if (label) label.textContent = 'OPEN';
    }
  }

  document.addEventListener('pointermove', move, { passive: true });
  document.addEventListener('pointerover', event => setMode(event.target));
  document.addEventListener('pointerout', event => {
    if (!event.relatedTarget) hide();
  });
  window.addEventListener('blur', hide);
  window.addEventListener('focus', () => { /* cursor becomes visible on the next pointer move */ });
  finePointer.addEventListener?.('change', event => {
    if (!event.matches) {
      root.classList.remove('cc');
      hide();
    }
  });
})();
