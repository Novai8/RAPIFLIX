(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const $ = (s, r = document) => r.querySelector(s);
  const loader = $('#loader');
  const status = $('#loaderStatus');
  const fill = $('#loaderFill');
  const percent = $('#loaderPercent');
  const reel = $('#loaderReel');
  const reelScene = $('.reel-scene');
  const savedTheme = localStorage.getItem('rapiflix-theme') || 'dark';
  document.documentElement.dataset.theme = savedTheme === 'light' ? 'light' : 'dark';

  /* ---------------- loader: 3D film reel that unloads ---------------- */
  // Real posters from the local fallback catalogue — always available offline.
  const REEL_POSTERS = [
    'oYuLEt3zVCKq57qu2F8dT7NIa6f.jpg', 'gEU2QniE6E77NI6lCU6MxlNBvIx.jpg',
    '1pdfLvkbY9ohJlCjQH2CZjjYVvJ.jpg', '8Vt6mWEReuy4Of61Lnj5Xj704m8.jpg',
    '74xTEgt7R36Fpooo50r9T25onhq.jpg', 'x2FJsf1ElAgr63Y3PNPtJrcmpoe.jpg',
    '3bhkrj58Vtu7enYsRolD1fZdja1.jpg', 'k3waqVXSnvCZWfJYNtdamTgTtTA.jpg'
  ];
  const PANELS = REEL_POSTERS.length, PSTEP = 360 / PANELS;
  const PR = Math.round((PANELS * 104) / (2 * Math.PI));
  if (reel) {
    reel.innerHTML = REEL_POSTERS.map((p, i) =>
      `<div class="reel-panel" data-i="${i}"><img src="https://image.tmdb.org/t/p/w92/${p}" alt="" loading="${i > 3 ? 'lazy' : 'eager'}" decoding="async"></div>`
    ).join('');
    reel.querySelectorAll('.reel-panel').forEach((el, i) => {
      el.style.transform = `rotateY(${i * PSTEP}deg) translateZ(${PR}px)`;
    });
  }
  const messages = ['Tuning the projector', 'Threading the reel', 'Lights down'];
  const DUR = reduce ? 400 : 1700;
  const UNLOAD = reduce ? 60 : 680;
  let start = performance.now(), lastFrame = start, reelRot = 0, phase = 1, unloadAt = 0;
  function tick(now) {
    if (!loader) return;
    const dt = Math.min(50, now - lastFrame); lastFrame = now;
    if (phase === 1) {
      if (!loader.classList.contains('done')) {
        const p = Math.min(1, (now - start) / DUR);
        const eased = 1 - Math.pow(1 - p, 3);
        reelRot += dt * (.03 + p * .18); // motor winds up
        if (fill) fill.style.width = `${Math.round(eased * 100)}%`;
        if (percent) percent.textContent = `${String(Math.round(eased * 100)).padStart(2, '0')}%`;
        if (status) status.textContent = messages[Math.min(2, Math.floor(p * 3))];
        if (p < 1) requestAnimationFrame(tick);
        else {
          phase = 2; unloadAt = now;
          loader.classList.add('unload');
          document.body.classList.add('ready');
          window.dispatchEvent(new CustomEvent('rapiflix:ready'));
          setTimeout(() => loader.remove(), UNLOAD + 60);
        }
      }
      if (reel) reel.style.transform = `rotateY(${reelRot}deg)`;
    } else {
      // unload: dolly toward the camera while the panels scatter outward
      const u = Math.min(1, (now - unloadAt) / UNLOAD);
      const easedU = u * u;
      reelRot += dt * (.55 + u * .45);
      if (reelScene) reelScene.style.transform = `scale(${1 + easedU * 2.3})`;
      if (reel) {
        reel.style.transform = `rotateY(${reelRot}deg)`;
        reel.querySelectorAll('.reel-panel').forEach(el => {
          el.style.transform = el.style.transform.replace(/translateZ\([^)]+\)/, `translateZ(${PR + easedU * 300}px)`);
        });
      }
      if (u >= 1) return;
      requestAnimationFrame(tick);
    }
  }
  requestAnimationFrame(tick);

  /* ---------------- viewfinder cursor ---------------- */
  const cursor = $('.focus-cursor');
  const cursorLabel = $('#cursorLabel');
  let cx = -100, cy = -100, tx = cx, ty = cy, vTilt = 0, lastX = 0, hoverEl = null, pressed = false, idleT = performance.now();
  if (finePointer && !reduce && cursor) {
    document.documentElement.classList.add('cursor-on');
    addEventListener('pointermove', e => {
      tx = e.clientX; ty = e.clientY;
      idleT = performance.now();
      const el = e.target instanceof Element
        ? e.target.closest('a,button,[role="button"],.movie-card,.poster-tile,.episode-card,.search-suggestion,.ring-poster,[data-cursor-label]')
        : null;
      if (el !== hoverEl) {
        hoverEl = el;
        cursor.classList.toggle('is-hover', Boolean(el));
        if (cursorLabel) {
          const custom = el?.closest('[data-cursor-label]')?.dataset.cursorLabel;
          cursorLabel.textContent = custom || (el?.matches('.movie-card,.poster-tile,.ring-poster') ? 'EXPLORE'
            : el?.matches('.episode-card') ? 'EPISODE'
            : el?.matches('a,button,[role="button"]') ? 'OPEN' : '');
        }
      }
    }, { passive: true });
    addEventListener('pointerdown', () => { pressed = true; cursor.classList.add('is-press'); });
    addEventListener('pointerup', () => { pressed = false; cursor.classList.remove('is-press'); });
    document.addEventListener('pointerover', e => {
      const text = e.target instanceof Element && e.target.closest('input,textarea,[contenteditable]');
      cursor.classList.toggle('is-text', Boolean(text));
    }, { passive: true });
    (function follow(now) {
      // magnetic pull toward the hovered element's center
      let gx = tx, gy = ty;
      if (hoverEl && document.contains(hoverEl)) {
        const r = hoverEl.getBoundingClientRect();
        if (r.width) {
          const mx = r.left + r.width / 2, my = r.top + r.height / 2;
          const dist = Math.hypot(mx - tx, my - ty);
          const pull = Math.max(0, 1 - dist / 300) * .55;
          gx = tx + (mx - tx) * pull; gy = ty + (my - ty) * pull;
        }
      }
      const prevX = cx;
      cx += (gx - cx) * .3; cy += (gy - cy) * .3;
      vTilt += ((cx - prevX) * 1.4 - vTilt) * .12;
      vTilt = Math.max(-10, Math.min(10, vTilt));
      const breathe = 1 + Math.sin((now - idleT) / 900) * .03;
      cursor.style.transform = `translate3d(${cx}px,${cy}px,0) rotate(${vTilt.toFixed(2)}deg) scale(${(pressed ? .72 : breathe).toFixed(3)})`;
      requestAnimationFrame(follow);
    })(performance.now());
  }

  /* ---------------- keyboard + palette (preserved) ---------------- */
  document.addEventListener('keydown', e => {
    if (e.key === '/' && !/input|textarea/i.test(document.activeElement.tagName)) { e.preventDefault(); $('#searchInput')?.focus() }
  });
  const palettes = ['lime', 'coral', 'cyan', 'violet'];
  const paletteButton = $('#paletteToggle');
  const savedPalette = localStorage.getItem('rapiflix-palette') || 'lime';
  document.documentElement.dataset.palette = palettes.includes(savedPalette) ? savedPalette : 'lime';
  paletteButton?.addEventListener('click', () => {
    const next = palettes[(palettes.indexOf(document.documentElement.dataset.palette) + 1) % palettes.length];
    document.documentElement.dataset.palette = next;
    localStorage.setItem('rapiflix-palette', next);
    paletteButton.animate([{ transform: 'rotate(0) scale(1)' }, { transform: 'rotate(180deg) scale(1.18)' }, { transform: 'rotate(360deg) scale(1)' }], { duration: 480, easing: 'cubic-bezier(.2,.8,.2,1)' });
  });
  // scrolled header state
  const header = $('.site-header');
  let scrollTicking = false;
  addEventListener('scroll', () => {
    if (scrollTicking) return;
    scrollTicking = true;
    requestAnimationFrame(() => { header?.classList.toggle('is-scrolled', scrollY > 24); scrollTicking = false; });
  }, { passive: true });
  window.RapiflixUI = { reduce, $ };
})();
