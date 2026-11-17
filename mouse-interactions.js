/* Rapiflix pointer layer: projector beam, aperture cursor, frame tilt and magnetic buttons. */
(() => {
  "use strict";
  if (window.__rapiflixProjectorV1) return;
  window.__rapiflixProjectorV1 = true;

  const root = document.documentElement;
  const dot = document.querySelector(".cursor-dot");
  const ring = document.querySelector(".cursor-ring");
  const label = ring?.querySelector(".cursor-label") || null;

  const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");

  let enabled = false;
  let x = -240, y = -240, ringX = x, ringY = y, frame = 0;
  let hovered = null, tilted = null, magnetic = null;

  const INTERACTIVE = "a,button,select,[role='button'],[data-link]";
  const TILT = ".card";
  const MAGNETIC = ".btn-accent,.rail-btn";

  function readLabel(target) {
    if (!target) return "";
    if (target.matches(".card-btn") || target.closest(".card")) return "Open";
    if (target.matches(".btn-accent")) return target.closest(".stage-tools") ? "Load" : "Open";
    if (target.matches(".rail-btn")) return "Scroll";
    if (target.matches("select")) return "";
    if (target.closest("#searchTrigger")) return "Search";
    if (target.closest("#themeToggle,#paletteToggle")) return "Stock";
    if (target.closest(".search-close,[data-search-close]")) return "Close";
    if (target.matches(".icon-btn,.menu-btn")) return "Menu";
    return "Open";
  }

  function hiddenByOverlay() {
    return Boolean(document.querySelector("#searchOverlay:not([hidden]), #mobileNav:not([hidden])"));
  }

  function show() {
    if (!dot || !ring) return;
    dot.style.opacity = "1";
    ring.classList.add("is-on");
  }

  function hide() {
    if (!dot || !ring) return;
    dot.style.opacity = "0";
    ring.classList.remove("is-on", "is-active");
    if (label) label.textContent = "";
    clearCard();
    clearMagnetic();
    hovered = null;
  }

  function paint() {
    frame = 0;
    if (dot) dot.style.transform = `translate3d(${x}px,${y}px,0)`;
    if (ring) {
      ringX += (x - ringX) * 0.22;
      ringY += (y - ringY) * 0.22;
      ring.style.transform = `translate3d(${ringX}px,${ringY}px,0)`;
      if (Math.abs(x - ringX) + Math.abs(y - ringY) > 0.4) frame = requestAnimationFrame(paint);
    }
    /* One write per frame: the projector beam and hero parallax read these. */
    root.style.setProperty("--mx", `${x.toFixed(0)}px`);
    root.style.setProperty("--my", `${y.toFixed(0)}px`);
    const hero = document.querySelector("[data-hero]");
    if (hero) {
      hero.style.setProperty("--hx", `${((x / window.innerWidth - 0.5) * -16).toFixed(1)}`);
      hero.style.setProperty("--hy", `${((y / window.innerHeight - 0.5) * -10).toFixed(1)}`);
    }
  }

  function track(event) {
    x = event.clientX;
    y = event.clientY;
    if (!frame) frame = requestAnimationFrame(paint);
  }

  function setHover(target) {
    const next = target instanceof Element ? target.closest(INTERACTIVE) : null;
    if (next === hovered) return;
    hovered = next;
    const active = Boolean(hovered) && !hiddenByOverlay();
    ring?.classList.toggle("is-active", active);
    if (label) label.textContent = active ? readLabel(hovered) : "";
  }

  function tiltCard(event) {
    const card = event.target instanceof Element ? event.target.closest(TILT) : null;
    if (tilted && tilted !== card) clearCard();
    if (!card) return;
    const frameEl = card.querySelector(".card-frame");
    if (!frameEl) return;
    const rect = frameEl.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const px = (event.clientX - rect.left) / rect.width;
    const py = (event.clientY - rect.top) / rect.height;
    tilted = card;
    frameEl.style.setProperty("--rx", `${((0.5 - py) * 5).toFixed(2)}deg`);
    frameEl.style.setProperty("--ry", `${((px - 0.5) * 7).toFixed(2)}deg`);
  }

  function clearCard() {
    if (!tilted) return;
    const frameEl = tilted.querySelector(".card-frame");
    frameEl?.style.removeProperty("--rx");
    frameEl?.style.removeProperty("--ry");
    tilted = null;
  }

  function magnetise(target) {
    const el = target instanceof Element ? target.closest(MAGNETIC) : null;
    if (magnetic && magnetic !== el) clearMagnetic();
    if (!el || reduce.matches) return;
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dx = (target.clientX - (rect.left + rect.width / 2)) * 0.12;
    const dy = (target.clientY - (rect.top + rect.height / 2)) * 0.18;
    magnetic = el;
    el.classList.add("is-magnetic");
    el.style.translate = `${Math.max(-7, Math.min(7, dx)).toFixed(1)}px ${Math.max(-4, Math.min(4, dy)).toFixed(1)}px`;
  }

  function clearMagnetic() {
    if (!magnetic) return;
    magnetic.classList.remove("is-magnetic");
    magnetic.style.removeProperty("translate");
    magnetic = null;
  }

  function onMove(event) {
    if (!enabled) return;
    show();
    track(event);
    if (hiddenByOverlay()) { setHover(null); clearCard(); clearMagnetic(); return; }
    setHover(event.target);
    tiltCard(event);
    magnetise(event.target);
  }

  function onLeave() {
    hide();
  }

  function onOut(event) {
    if (!enabled) return;
    const related = event.relatedTarget;
    if (tilted && (!(related instanceof Element) || !tilted.contains(related))) clearCard();
    if (magnetic && (!(related instanceof Element) || !magnetic.contains(related))) clearMagnetic();
    if (!(related instanceof Element)) setHover(null);
  }

  function start() {
    if (enabled) return;
    enabled = true;
    document.body.classList.add("has-custom-cursor");
    document.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave, { passive: true });
    document.addEventListener("pointerout", onOut, { passive: true });
    window.addEventListener("blur", hide);
  }

  function stop() {
    if (!enabled) return;
    enabled = false;
    document.body.classList.remove("has-custom-cursor");
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerleave", onLeave);
    document.removeEventListener("pointerout", onOut);
    window.removeEventListener("blur", hide);
    hide();
    root.style.removeProperty("--mx");
    root.style.removeProperty("--my");
    if (frame) { cancelAnimationFrame(frame); frame = 0; }
  }

  function sync() {
    /* Animate on fine pointers; a coarse pointer gets the touch UI and no beam. */
    if (fine.matches && !reduce.matches) start();
    else stop();
  }

  fine.addEventListener?.("change", sync);
  reduce.addEventListener?.("change", sync);
  sync();
})();
