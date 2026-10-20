(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, root=document) => root.querySelector(s);
  const loader = $('#loader');
  const status = $('#loaderStatus');
  const fill = $('#loaderFill');
  const percent = $('#loaderPercent');
  const messages = ['Building your front row','Painting the night in gradients','Loading stories worth staying for'];
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
  addEventListener('pointermove',e=>{tx=e.clientX;ty=e.clientY;if(dot){dot.style.transform=`translate(${tx}px,${ty}px)`;} if(ring){ring.classList.add('visible');}});
  function follow(){rx+=(tx-rx)*.18; ry+=(ty-ry)*.18; if(ring) ring.style.transform=`translate(${rx}px,${ry}px)`; requestAnimationFrame(follow)}
  if(!reduce && matchMedia('(pointer:fine)').matches) follow();
  document.addEventListener('pointerover',e=>{if(e.target.closest('a,button,.movie-card,.poster-tile')) ring?.classList.add('active')});
  document.addEventListener('pointerout',e=>{if(e.target.closest('a,button,.movie-card,.poster-tile')) ring?.classList.remove('active')});
  document.addEventListener('keydown',e=>{if(e.key==='/' && !/input|textarea/i.test(document.activeElement.tagName)){e.preventDefault();$('#searchInput')?.focus()}});
  window.RapiflixUI={reduce,$};
})();
