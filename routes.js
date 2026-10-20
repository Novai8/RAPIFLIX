(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, root=document) => root.querySelector(s);
  const loader = $('#loader');
  const status = $('#loaderStatus');
  const fill = $('#loaderFill');
  const percent = $('#loaderPercent');
  const savedTheme=localStorage.getItem('rapiflix-theme')||'dark';
  document.documentElement.dataset.theme=savedTheme==='light'?'light':'dark';
  const messages = ['Tuning the projector','Painting the night in gradients','Locking the frame'];
  let start = performance.now();
  function tick(now){
    if(!loader || loader.classList.contains('done')) return;
    const p = Math.min(1,(now-start)/(reduce?420:1500));
    if(fill) fill.style.width = `${Math.round(p*100)}%`;
    if(percent) percent.textContent = `${String(Math.round(p*100)).padStart(2,'0')}%`;
    if(status) status.textContent = messages[Math.min(2,Math.floor(p*3))];
    if(p<1) requestAnimationFrame(tick); else { loader.classList.add('done'); setTimeout(()=>loader.remove(), reduce?30:620); }
  }
  requestAnimationFrame(tick);
  const dot=$('.pointer-dot'), ring=$('.pointer-ring'); let rx=0,ry=0,tx=0,ty=0;
  addEventListener('pointermove',e=>{tx=e.clientX;ty=e.clientY;if(dot){dot.style.transform=`translate(${tx}px,${ty}px)`;} if(ring){ring.classList.add('visible');}const root=document.documentElement;root.style.setProperty('--mouse-x',`${(e.clientX/innerWidth-.5).toFixed(3)}`);root.style.setProperty('--mouse-y',`${(e.clientY/innerHeight-.5).toFixed(3)}`);const card=e.target.closest('.movie-card,.hero-feature');if(card){const r=card.getBoundingClientRect();const x=(e.clientX-(r.left+r.width/2))/r.width;const y=(e.clientY-(r.top+r.height/2))/r.height;card.style.setProperty('--tilt-x',`${(x*7).toFixed(2)}deg`);card.style.setProperty('--tilt-y',`${(y*-7).toFixed(2)}deg`);card.style.setProperty('--lift-x',`${(x*8).toFixed(1)}px`);card.style.setProperty('--lift-y',`${(y*8).toFixed(1)}px`);}});
  function follow(){rx+=(tx-rx)*.18; ry+=(ty-ry)*.18; if(ring) ring.style.transform=`translate(${rx}px,${ry}px)`; requestAnimationFrame(follow)}
  if(!reduce && matchMedia('(pointer:fine)').matches) follow();
  document.addEventListener('pointerover',e=>{if(e.target.closest('a,button,.movie-card,.poster-tile')) ring?.classList.add('active')});
  document.addEventListener('pointerout',e=>{if(e.target.closest('a,button,.movie-card,.poster-tile')) ring?.classList.remove('active');const card=e.target.closest('.movie-card,.hero-feature');if(card){card.style.setProperty('--tilt-x','0deg');card.style.setProperty('--tilt-y','0deg');card.style.setProperty('--lift-x','0px');card.style.setProperty('--lift-y','0px')}});
  document.addEventListener('keydown',e=>{if(e.key==='/' && !/input|textarea/i.test(document.activeElement.tagName)){e.preventDefault();$('#searchInput')?.focus()}});
  const palettes=['lime','coral','cyan','violet'];
  const paletteButton=$('#paletteToggle');
  const savedPalette=localStorage.getItem('rapiflix-palette')||'lime';
  document.documentElement.dataset.palette=palettes.includes(savedPalette)?savedPalette:'lime';
  paletteButton?.addEventListener('click',()=>{const next=palettes[(palettes.indexOf(document.documentElement.dataset.palette)+1)%palettes.length];document.documentElement.dataset.palette=next;localStorage.setItem('rapiflix-palette',next);paletteButton.animate([{transform:'rotate(0) scale(1)'},{transform:'rotate(180deg) scale(1.18)'},{transform:'rotate(360deg) scale(1)'}],{duration:480,easing:'cubic-bezier(.2,.8,.2,1)'});});
  window.RapiflixUI={reduce,$};
})();
