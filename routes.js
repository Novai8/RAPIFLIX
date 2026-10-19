(() => {
  'use strict';
  const $ = (s, root=document) => root.querySelector(s);
  const $$ = (s, root=document) => [...root.querySelectorAll(s)];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const state = { page: 'trending', previous: 'trending', hue: 22, hero: null, pointerX: innerWidth/2, pointerY: innerHeight/2, ringX: innerWidth/2, ringY: innerHeight/2 };
  const shared = window.RapiflixShared || { slugify: value => String(value || 'title').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'title' };
  const routeMap = {'/':'trending','/movies':'movies','/series':'series','/anime':'anime'};
  const hueSeeds = {'Inception':215,'Parasite':150,'Interstellar':200,'Whiplash':35,'Mad Max: Fury Road':20,'The Dark Knight':230,'Dune':30,'La La Land':330,'Breaking Bad':120,'Succession':45,'Severance':175,'Stranger Things':355,'The Bear':10,'Chernobyl':95,'Dark':260,'Fargo':195,'Spirited Away':170,'Attack on Titan':5,'Death Note':280,'Cowboy Bebop':50,'Fullmetal Alchemist: Brotherhood':40,'Your Name':310,'Demon Slayer':350,'Jujutsu Kaisen':255};
  function hashHue(s=''){let h=2166136261;for(let i=0;i<s.length;i++)h=Math.imul(h^s.charCodeAt(i),16777619);return (h>>>0)%360;}
  function titleHue(title){return hueSeeds[title] ?? hashHue(title);}
  function hsl(h,s,l){return shared.hslToRgb?shared.hslToRgb(h,s,l):[0,0,0];}
  function hex(rgb){return shared.rgbToHex?shared.rgbToHex(rgb):'#000000';}
  function buttonText(rgb){return shared.buttonTextColor?shared.buttonTextColor(rgb):'#0B0C12';}
  function setHue(h){state.hue=((Number(h)||0)%360+360)%360;const light=document.documentElement.dataset.theme==='light';const bg=hsl(state.hue,light?75:42,light?93:9),fg=hsl(state.hue,light?60:20,light?11:95),btn=shared.accessibleButtonRgb?shared.accessibleButtonRgb(state.hue,light?'light':'dark'):hsl(state.hue,light?88:92,light?46:62),bf=buttonText(btn);const root=document.documentElement;root.style.setProperty('--bg',hex(bg));root.style.setProperty('--fg',hex(fg));root.style.setProperty('--btn',hex(btn));root.style.setProperty('--bf',bf);[['bg',bg],['fg',fg],['btn',btn]].forEach(([key,rgb])=>{const value=hex(rgb);const sw=$('#'+key+'Swatch'),txt=$('#'+key+'Hex');if(sw){sw.style.setProperty('--swatch',value);sw.style.background=value;}if(txt)txt.textContent=value;});root.style.setProperty('--poster-hue',state.hue); }
  function readTheme(){let t='';try{t=localStorage.getItem('rf-theme')||'';}catch(_){}if(!t)t=matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';applyTheme(t);}
  function applyTheme(t){const theme=t==='light'?'light':'dark';document.documentElement.dataset.theme=theme;document.documentElement.style.colorScheme=theme;try{localStorage.setItem('rf-theme',theme);}catch(_){}setHue(state.hue);}
  function route(){const path=location.pathname;const qs=new URLSearchParams(location.search);if(path==='/search')return {page:'search',query:qs.get('q')||''};if(path.startsWith('/details/')||path.startsWith('/title/')){const prefix=path.startsWith('/details/')?'/details/':'/title/';return {page:'detail',slug:path.slice(prefix.length).split('/')[0],id:qs.get('id')||'',type:qs.get('type')||'movie'};}return {page:routeMap[path]||'trending'};}
  function go(path,replace=false){if(replace)history.replaceState({rapiflix:true},'',path);else history.pushState({rapiflix:true},'',path);renderRoute();}
  function setMetaDescription(value){
    const node=$('meta[name="description"]');
    if(node&&value)node.setAttribute('content',value);
  }
  function setCanonical(path, query=''){
    const sourcePath=path||'/';
    const canonicalPath=sourcePath.startsWith('/details/')?'/title/'+sourcePath.slice('/details/'.length):sourcePath;
    const suffix=canonicalPath==='/search'&&query?'?q='+encodeURIComponent(String(query).slice(0,90)):canonicalPath.startsWith('/title/')&&location.search?location.search:'';
    const href='https://rapiflix.online'+canonicalPath+suffix;
    let node=$('link[rel="canonical"]');
    if(!node){node=document.createElement('link');node.rel='canonical';document.head.append(node);}
    node.href=href;
    const og=$('meta[property="og:url"]');if(og)og.setAttribute('content',href);
  }
  function setNav(page,query=''){
    document.documentElement.dataset.page=page;
    const navPage=page==='search'||page==='detail'?'none':page;
    $('.tabs a').forEach(a=>{if(a.dataset.route===navPage){a.setAttribute('aria-current','page');}else a.removeAttribute('aria-current');});
    positionIndicator();
    const q=String(query||'').trim();
    const cleanQ=q.slice(0,90);
    const titles={
      trending:'Trending Movies, TV Series & Anime',
      movies:'Discover Movies Online',
      series:'TV Series & Shows',
      anime:'Anime Movies & Series',
      search:cleanQ?'Search results for '+cleanQ:'Search Movies, TV Series & Anime',
      detail:'Full Movie & Series Details',
    };
    const descriptions={
      trending:'Discover trending movies, popular TV series and anime on Rapiflix. Explore titles, browse genres and find available viewing options.',
      movies:'Explore movies on Rapiflix. Discover trending films, search by genre or release year, and find available viewing options.',
      series:'Discover TV series and shows on Rapiflix. Explore popular series, search titles and find available viewing options.',
      anime:'Explore anime movies and series on Rapiflix. Discover anime titles, search the catalogue and find available viewing options.',
      search:cleanQ?'Search Rapiflix for '+cleanQ+'. Explore matching movies, TV series and anime, with title details and available viewing options.':'Search Rapiflix for movies, TV series and anime by title.',
      detail:'Explore the full cast, story, production details, ratings and related titles on Rapiflix.',
    };
    document.title=(titles[page]||titles.trending)+' · Rapiflix';
    setMetaDescription(descriptions[page]||descriptions.trending);
    setCanonical(location.pathname, q);
  }
  function positionIndicator(){const active=$('.tabs a[aria-current=page]'),indicator=$('#tabIndicator'),tabs=$('.tabs');if(!active||!indicator||!tabs){indicator?.classList.add('hidden');return;}const a=active.getBoundingClientRect(),b=tabs.getBoundingClientRect();indicator.style.width=a.width+'px';indicator.style.transform='translateX('+(a.left-b.left-4)+'px)';indicator.classList.remove('hidden');}
  function setPageCopy(page,query=''){const title=$('#pageTitle'),sub=$('#pageSubtitle'),hero=$('#heroSection'),catalog=$('#catalogSection'),detail=$('#detailPage'),main=$('#appMain'),footer=$('footer'),palette=$('.color-panel');if(detail)detail.hidden=page!=='detail';if(main)main.hidden=page==='detail';if(footer)footer.hidden=page==='detail';if(palette)palette.hidden=false;const data={trending:['Trending now','Hover a title and the whole page changes color.'],movies:['Movies','Features you can start in a second.'],series:['Series','Binge-ready shows with every episode in reach.'],anime:['Anime','Films and series, subbed and dubbed.'],search:[query?'Search results':'Search titles',query?'Movies, TV series and anime matching your search.':'Search for a title, genre or year.'],detail:['Full title profile','Cast, story, production details and related titles.']}[page]||['Trending now','Discover your next favourite.'];if(title)title.textContent=data[0];if(sub)sub.textContent=data[1];if(hero)hero.hidden=page==='search'||page==='detail';if(catalog)catalog.hidden=page==='detail';const labels={trending:'trending/movie/week',movies:'discover/movie',series:'discover/tv',anime:'anime'};const target=labels[page];if(target){const btn=$('.tmdb-tab[data-tmdb="'+target+'"]');if(btn&&!btn.classList.contains('active'))btn.click();}if(page==='search'){const input=$('#searchInput');if(input&&input.value!==query)input.value=query;}if(page!=='search'){const input=$('#searchInput');if(input&&input.value){input.value='';document.dispatchEvent(new CustomEvent('rapiflix:clear-search'));}}}
  function renderRoute(){
    const r=route();
    if(state.page!==r.page)state.hero=null;
    state.page=r.page;
    setNav(r.page,r.query||'');
    setPageCopy(r.page,r.query||'');
    if(r.page==='detail'){
      const modal=$('#modalBackdrop');
      if(modal)modal.hidden=true;
      document.body.classList.remove('modal-open');
      document.dispatchEvent(new CustomEvent('rapiflix:detail-page',{detail:{id:r.id,type:r.type,slug:r.slug}}));
    }else{
      const back=$('#modalBackdrop');
      if(back&&!back.hidden)back.hidden=true;
      document.body.classList.remove('modal-open');
    }
    window.scrollTo(0,{behavior:reduced?'auto':'smooth'});
    const main=$('#appMain');
    if(main){main.style.animation='none';void main.offsetWidth;main.style.animation='';}
  }
  function setHeroFromCard(card){if(!card)return;const title=$('.card-title',card)?.textContent?.trim();if(!title)return;const year=$('.card-year',card)?.textContent?.trim()||'';const genre=$('.card-sub span',card)?.textContent?.split(' · ').slice(0,2).join(' · ')||'Discovery';const poster=$('img',card);const h=titleHue(title);state.hero={title,year,genre,poster:poster?.src||'',card};setHue(h);const heroTitle=$('#heroTitle'),kicker=$('#heroKicker'),copy=$('#heroCopy'),art=$('#heroArt'),fallback=$('#heroPosterFallback');if(heroTitle)heroTitle.textContent=title;if(kicker)kicker.textContent=[genre,year].filter(Boolean).join(' · ');if(copy){const description=card.dataset.description||'';copy.textContent=description||'Explore the details, synopsis and available viewing options for '+title+'.';}if(art){art.style.setProperty('--poster-hue',h);art.innerHTML='';if(poster){const img=document.createElement('img');img.src=poster.src;img.alt='';img.loading='lazy';art.append(img);}else if(fallback){fallback.textContent=title.charAt(0).toUpperCase();art.append(fallback);}}}
  function observeCards(){
    const cards=$$('.movie-card');
    cards.forEach((card,i)=>{
      card.setAttribute('tabindex','0');
      card.setAttribute('role','button');
      const title=$('.card-title',card)?.textContent?.trim()||'Title';
      const genre=$('.card-sub span',card)?.textContent?.split(' · ')[0]||'Title';
      const year=$('.card-year',card)?.textContent?.trim()||'';
      card.setAttribute('aria-label',[title,genre,year].filter(Boolean).join(', '));
      card.dataset.hue=titleHue(title);
      card.style.setProperty('--poster-hue',card.dataset.hue);
      card.style.animationDelay=Math.min(i,12)*60+'ms';
      if(!card.dataset.routesBound){
        card.dataset.routesBound='1';
        card.addEventListener('pointerenter',()=>{if($('#searchInput')?.value.trim())return;setHue(card.dataset.hue);if(state.page==='trending')setHeroFromCard(card);});
        card.addEventListener('focusin',()=>{if($('#searchInput')?.value.trim())return;setHue(card.dataset.hue);if(state.page==='trending')setHeroFromCard(card);});
        card.addEventListener('keydown',e=>{
          if(e.target.closest('a,button'))return;
          if(e.key==='Enter'||e.key===' '){e.preventDefault();card.click();}
        });
      }
    });
    const searchIsActive=Boolean($('#searchInput')?.value.trim());
    if(cards.length&&state.page!=='detail'&&!searchIsActive){
      if(state.page==='trending'){if(!state.hero)setHeroFromCard(cards[0]);}
      else if(state.page!=='search')setHue(cards[0].dataset.hue);
    }
    if(state.page==='search'){
      const q=new URLSearchParams(location.search).get('q')||'';
      const heading=$('#pageTitle');
      if(heading)heading.textContent=cards.length?(cards.length+' '+(cards.length===1?'result':'results')+' for “'+q+'”'):'No results for “'+q+'”';
      const subtitle=$('#pageSubtitle');
      if(subtitle)subtitle.textContent=cards.length?'Hover a title to recolor the page.':'Try a title, genre, content type or year.';
    }
  }
  function monitorModal(){
    const modal=$('#modalBackdrop');if(!modal)return;
    const obs=new MutationObserver(()=>{
      if(!modal.hidden){
        document.body.classList.add('modal-open');
        const title=$('#modalTitle')?.textContent?.trim()||'title';
        document.title=title+' · Rapiflix';
        setHue(titleHue(title));
      }
    });
    obs.observe(modal,{attributes:true,attributeFilter:['hidden']});
  }
  function searchBehavior(){
    const input=$('#searchInput');
    if(!input)return;
    const suggestions=$('#searchSuggestions');
    const hideSuggestions=()=>{
      if(suggestions)suggestions.hidden=true;
      input.setAttribute('aria-expanded','false');
    };
    const searchPath=q=>'/search?q='+encodeURIComponent(q);
    const activateResults=(term)=>{
      if(state.page!=='search')state.previous=state.page;
      const path=searchPath(term);
      if(location.pathname+location.search!==path){
        if(state.page==='search')history.replaceState({rapiflix:true},'',path);
        else history.pushState({rapiflix:true},'',path);
      }
      state.page='search';
      setNav('search');
      setPageCopy('search',term);
      const heading=$('#pageTitle');
      if(heading)heading.textContent='Search results for "'+term+'"';
      const subtitle=$('#pageSubtitle');
      if(subtitle)subtitle.textContent='Searching movies, TV series and anime…';
      hideSuggestions();
      document.dispatchEvent(new CustomEvent('rapiflix:search-submit',{detail:{query:term,committed:true}}));
      const catalog=$('#catalogSection');
      catalog?.scrollIntoView({behavior:reduced?'auto':'smooth',block:'start'});
      input.blur();
    };
    const restorePreviousPage=()=>{
      const page=['movies','series','anime'].includes(state.previous)?state.previous:'trending';
      const path=page==='trending'?'/':'/'+page;
      history.replaceState({rapiflix:true},'',path);
      state.page=page;
      setNav(page);
      setPageCopy(page,'');
      const cards=$$('.movie-card');
      if(page==='trending'&&state.hero)setHue(titleHue(state.hero.title));
      else if(cards[0])setHue(titleHue($('.card-title',cards[0])?.textContent||''));
    };

    // Typing only updates the query. It must not re-render the whole route or replay the page animation.
    input.addEventListener('input',()=>{
      const q=input.value.trim();
      if(state.page==='search'){
        if(q){
          const path=searchPath(q);
          if(location.pathname+location.search!==path)history.replaceState({rapiflix:true},'',path);
          const heading=$('#pageTitle');
          if(heading)heading.textContent='Search results for "'+q+'"';
          const subtitle=$('#pageSubtitle');
          if(subtitle)subtitle.textContent='Updating movie and series matches…';
        }else{
          restorePreviousPage();
        }
      }
    });

    input.addEventListener('keydown',e=>{
      if(e.key==='Enter'){
        const term=input.value.trim();
        if(!term)return;
        e.preventDefault();
        activateResults(term);
      }else if(e.key==='Escape'){
        const hadText=!!input.value;
        input.value='';
        hideSuggestions();
        if(hadText)document.dispatchEvent(new CustomEvent('rapiflix:clear-search'));
        if(state.page==='search')restorePreviousPage();
        input.blur();
      }
    });
  }
  function initCursor(){if(!matchMedia('(hover:hover) and (pointer:fine)').matches)return;document.documentElement.classList.add('cc');const dot=$('.cursor-dot'),ring=$('.cursor-ring');if(!dot||!ring)return;let visible=false;const move=e=>{state.pointerX=e.clientX;state.pointerY=e.clientY;if(!visible){visible=true;dot.style.opacity=ring.style.opacity='1';}dot.style.transform='translate('+e.clientX+'px,'+e.clientY+'px)';};window.addEventListener('pointermove',e=>{move(e);const glow=$('.mouse-glow');if(glow){glow.style.setProperty('--mx',e.clientX+'px');glow.style.setProperty('--my',e.clientY+'px');}},{passive:true});document.addEventListener('pointerover',e=>{const target=e.target.closest('[data-cur],button,a,input,.movie-card');ring.classList.remove('view','link','text');if(!target)return;if(target.matches('.movie-card')||target.dataset.cur==='view')ring.classList.add('view');else if(target.matches('input'))ring.classList.add('text');else ring.classList.add('link');});window.addEventListener('pointerout',e=>{if(!e.relatedTarget){dot.style.opacity=ring.style.opacity='0';visible=false;}});if(!reduced){const tick=()=>{state.ringX+=(state.pointerX-state.ringX)*.18;state.ringY+=(state.pointerY-state.ringY)*.18;ring.style.transform='translate('+state.ringX+'px,'+state.ringY+'px)';requestAnimationFrame(tick);};requestAnimationFrame(tick);document.addEventListener('pointerdown',()=>ring.style.scale='.8');document.addEventListener('pointerup',()=>ring.style.scale='1');}else{const tick=()=>{ring.style.transform='translate('+state.pointerX+'px,'+state.pointerY+'px)';requestAnimationFrame(tick);};requestAnimationFrame(tick);}}
  function loadingCurtain(){const curtain=$('#loadingCurtain'),fill=$('#progressFill'),number=$('#progressNumber');if(!curtain||curtain.classList.contains('loader-random-scene'))return;let show=true;try{if(sessionStorage.getItem('rf-loaded'))show=false;else sessionStorage.setItem('rf-loaded','1');}catch(_){}if(!show){curtain.remove();return;}const start=performance.now(),minimum=1200;const tick=now=>{const p=Math.min(100,Math.round((1-Math.pow(1-Math.min(1,(now-start)/1600),3))*100));if(fill)fill.style.width=p+'%';if(number)number.textContent=p+'%';if(p<100&&now-start<4500){requestAnimationFrame(tick);return;}if(fill)fill.style.width='100%';if(number)number.textContent='100%';setTimeout(()=>{curtain.classList.add('done');setTimeout(()=>curtain.remove(),1200);},Math.max(0,minimum-(now-start))+150);};if(reduced){setTimeout(()=>{curtain.classList.add('done');setTimeout(()=>curtain.remove(),250);},200);}else requestAnimationFrame(tick);}
  function bindNav(){ $$('.tabs a').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();go(a.getAttribute('href'));}));$('#themeToggle')?.addEventListener('click',()=>applyTheme(document.documentElement.dataset.theme==='light'?'dark':'light'));$('#heroDetails')?.addEventListener('click',()=>{if(state.hero?.card)state.hero.card.click();});$('#heroPosterButton')?.addEventListener('click',()=>{if(state.hero?.card)state.hero.card.click();});$('#heroPlay')?.addEventListener('click',()=>{if(state.hero?.card)state.hero.card.click();const play=$('#modalPlay');if(play)setTimeout(()=>play.click(),80);});$('#modalClose')?.addEventListener('click',()=>{const m=$('#modalBackdrop');if(m)m.hidden=true;});$('#playerClose')?.addEventListener('click',()=>{const p=$('#playerBackdrop');if(p)p.hidden=true;});window.addEventListener('resize',positionIndicator,{passive:true});document.fonts?.ready?.then(positionIndicator);window.addEventListener('popstate',()=>{const r=route();if(r.page!=='detail'){const modal=$('#modalBackdrop');if(modal)modal.hidden=true;document.body.classList.remove('modal-open');}renderRoute();if(r.page==='search'&&r.query){document.dispatchEvent(new CustomEvent('rapiflix:search-submit',{detail:{query:r.query,committed:true}}));$('#catalogSection')?.scrollIntoView({behavior:reduced?'auto':'smooth',block:'start'});}});}
  const cardObserver=new MutationObserver(()=>{observeCards();});['#movieGrid','#freeMovieGrid'].forEach(selector=>{const grid=$(selector);if(grid)cardObserver.observe(grid,{childList:true,subtree:true});});
  readTheme();bindNav();searchBehavior();monitorModal();initCursor();loadingCurtain();const initial=route();if(initial.page==='search'){state.previous='trending';}renderRoute();if(initial.page==='search'&&initial.query){document.dispatchEvent(new CustomEvent('rapiflix:search-submit',{detail:{query:initial.query,committed:true}}));$('#catalogSection')?.scrollIntoView({behavior:reduced?'auto':'smooth',block:'start'});}setTimeout(()=>{if(state.page!=='trending'||$('#searchInput')?.value.trim())return;const first=$('.movie-card');if(first&&!state.hero){setHeroFromCard(first);setHue(titleHue($('.card-title',first)?.textContent||''));}},1200);
})();