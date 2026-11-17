(() => {
  "use strict";
  if (window.__rapiflixMouseMotionLoaded) return;
  window.__rapiflixMouseMotionLoaded = true;

  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  if (!finePointer.matches || reducedMotion.matches) return;

  let activeCard = null, activeMagnetic = null;

  // Cards lean subtly toward the pointer. Delegation keeps this working after SPA route changes.
  document.addEventListener("pointermove", (event) => {
    const card = event.target instanceof Element ? event.target.closest(".movie-card") : null;
    if (activeCard && activeCard !== card) resetCard(activeCard);
    activeCard = card;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const px = (event.clientX - rect.left) / rect.width;
    const py = (event.clientY - rect.top) / rect.height;
    card.classList.add("is-mouse-tilted");
    card.style.setProperty("--tilt-x", `${((px - 0.5) * 7).toFixed(2)}deg`);
    card.style.setProperty("--tilt-y", `${((0.5 - py) * 7).toFixed(2)}deg`);
    card.style.setProperty("--lift-x", `${((px - 0.5) * 5).toFixed(1)}px`);
    card.style.setProperty("--lift-y", `${((py - 0.5) * 5).toFixed(1)}px`);
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
    const el = event.target instanceof Element ? event.target.closest(".hero-cta,.primary-button,.ghost-button,.episode-watch,.ring-poster") : null;
    if (activeMagnetic && activeMagnetic !== el) {
      activeMagnetic.classList.remove("is-magnetic");
      activeMagnetic.style.removeProperty("translate");
    }
    activeMagnetic = el;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (!rect.width) return;
    const dx = (event.clientX - (rect.left + rect.width / 2)) * 0.10;
    const dy = (event.clientY - (rect.top + rect.height / 2)) * 0.10;
    el.classList.add("is-magnetic");
    el.style.translate = `${Math.max(-6, Math.min(6, dx)).toFixed(1)}px ${Math.max(-5, Math.min(5, dy)).toFixed(1)}px`;
  }, { passive: true });
  document.addEventListener("pointerout", (event) => {
    const el = event.target instanceof Element ? event.target.closest(".hero-cta,.primary-button,.ghost-button,.episode-watch,.ring-poster") : null;
    if (el && (!event.relatedTarget || !el.contains(event.relatedTarget))) {
      el.classList.remove("is-magnetic");
      el.style.removeProperty("translate");
    }
  }, { passive: true });
})();
