(() => {
  "use strict";
  if (window.__rapiflixMouseMotionLoaded) return;
  window.__rapiflixMouseMotionLoaded = true;

  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  if (!finePointer.matches || reducedMotion.matches) return;

  const dot = document.querySelector(".pointer-dot");
  const ring = document.querySelector(".pointer-ring");
  if (!dot || !ring) return;

  const label = ring.querySelector("span");
  let x = -100, y = -100, ringX = x, ringY = y, frame = 0, hovered = null;

  const move = (event) => {
    x = event.clientX;
    y = event.clientY;
    if (!frame) frame = requestAnimationFrame(paint);
  };
  function paint() {
    frame = 0;
    dot.style.transform = `translate3d(${x}px,${y}px,0)`;
    ringX += (x - ringX) * 0.22;
    ringY += (y - ringY) * 0.22;
    ring.style.transform = `translate3d(${ringX}px,${ringY}px,0)`;
    if (Math.abs(x - ringX) + Math.abs(y - ringY) > 0.5) frame = requestAnimationFrame(paint);
  }

  function updateTarget(target) {
    const next = target instanceof Element
      ? target.closest("a,button,[role='button'],.movie-card,.feature-poster,.episode-card,.poster-tile")
      : null;
    if (next === hovered) return;
    hovered?.classList.remove("mouse-spotlight");
    hovered = next;
    hovered?.classList.add("mouse-spotlight");
    ring.classList.toggle("active", Boolean(hovered));
    if (label) {
      label.textContent = !hovered ? "" :
        hovered.matches(".movie-card,.feature-poster,.poster-tile") ? "Explore" :
        hovered.matches(".episode-card") ? "Episode" :
        hovered.matches("a,button,[role='button']") ? "Open" : "View";
    }
  }

  document.addEventListener("pointermove", (event) => {
    move(event);
    updateTarget(event.target);
  }, { passive: true });
  document.addEventListener("pointerover", (event) => updateTarget(event.target), { passive: true });
  document.addEventListener("pointerout", (event) => {
    if (event.relatedTarget instanceof Element) updateTarget(event.relatedTarget);
    else updateTarget(null);
  }, { passive: true });
  document.addEventListener("pointerleave", () => {
    dot.style.opacity = "0";
    ring.classList.remove("visible");
  });
  document.addEventListener("pointerenter", () => {
    dot.style.opacity = "1";
    ring.classList.add("visible");
  });

  // Cards lean subtly toward the pointer. Delegation keeps this working after SPA route changes.
  document.addEventListener("pointermove", (event) => {
    const card = event.target instanceof Element ? event.target.closest(".movie-card") : null;
    document.querySelectorAll(".movie-card.is-mouse-tilted").forEach((item) => {
      if (item !== card) resetCard(item);
    });
    if (!card) return;
    const rect = card.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const px = (event.clientX - rect.left) / rect.width;
    const py = (event.clientY - rect.top) / rect.height;
    card.classList.add("is-mouse-tilted");
    card.style.setProperty("--tilt-x", `${(px - 0.5) * 7}deg`);
    card.style.setProperty("--tilt-y", `${(0.5 - py) * 7}deg`);
    card.style.setProperty("--lift-x", `${(px - 0.5) * 5}px`);
    card.style.setProperty("--lift-y", `${(py - 0.5) * 5}px`);
  }, { passive: true });

  function resetCard(card) {
    card.classList.remove("is-mouse-tilted");
    card.style.removeProperty("--tilt-x");
    card.style.removeProperty("--tilt-y");
    card.style.removeProperty("--lift-x");
    card.style.removeProperty("--lift-y");
  }
  document.addEventListener("pointerout", (event) => {
    const card = event.target instanceof Element ? event.target.closest(".movie-card") : null;
    if (card && (!event.relatedTarget || !card.contains(event.relatedTarget))) resetCard(card);
  }, { passive: true });

  // Small magnetic pull on primary controls, using CSS translate so existing transforms remain intact.
  document.addEventListener("pointermove", (event) => {
    const el = event.target instanceof Element ? event.target.closest(".hero-cta,.watch-button,.episode-watch,.rf-guide-launcher") : null;
    document.querySelectorAll(".is-magnetic").forEach((item) => {
      if (item !== el) {
        item.classList.remove("is-magnetic");
        item.style.removeProperty("translate");
      }
    });
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const dx = (event.clientX - (rect.left + rect.width / 2)) * 0.10;
    const dy = (event.clientY - (rect.top + rect.height / 2)) * 0.10;
    el.classList.add("is-magnetic");
    el.style.translate = `${Math.max(-6, Math.min(6, dx))}px ${Math.max(-5, Math.min(5, dy))}px`;
  }, { passive: true });
  document.addEventListener("pointerout", (event) => {
    const el = event.target instanceof Element ? event.target.closest(".hero-cta,.watch-button,.episode-watch,.rf-guide-launcher") : null;
    if (el && (!event.relatedTarget || !el.contains(event.relatedTarget))) {
      el.classList.remove("is-magnetic");
      el.style.removeProperty("translate");
    }
  }, { passive: true });

  ring.classList.add("visible");
})();