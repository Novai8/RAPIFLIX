/* Rapiflix shell: theme, boot sequence, navigation sheet, search overlay, shortcuts. */
(() => {
  "use strict";

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));

  /* ---------- theme + palette ---------- */
  const THEMES = ["dark", "light"];
  const PALETTES = ["vermilion", "cyanotype", "chartreuse", "ultraviolet"];
  const STOCKS = { vermilion: "Vermilion", cyanotype: "Cyanotype", chartreuse: "Chartreuse", ultraviolet: "Ultraviolet" };

  function read(key, fallback) {
    try { return localStorage.getItem(key) ?? fallback; } catch (_) { return fallback; }
  }
  function write(key, value) {
    try { localStorage.setItem(key, value); } catch (_) {}
  }

  const savedTheme = read("rapiflix-theme", "dark");
  document.documentElement.dataset.theme = THEMES.includes(savedTheme) ? savedTheme : "dark";
  const savedPalette = read("rapiflix-palette", "vermilion");
  document.documentElement.dataset.palette = PALETTES.includes(savedPalette) ? savedPalette : "vermilion";

  /* ---------- boot: academy leader ---------- */
  const boot = $("#loader");
  if (boot) {
    const fill = $("#loaderFill");
    const percent = $("#loaderPercent");
    const count = $("#loaderCount");
    const status = $("#loaderStatus");
    const lines = ["Threading the projector", "Cueing the leader", "Roll film"];
    let seen = false;
    try { seen = sessionStorage.getItem("rapiflix-booted") === "1"; } catch (_) {}
    const duration = reduce ? 40 : seen ? 260 : 1150;
    const start = performance.now();

    const tick = (now) => {
      const progress = Math.min(1, (now - start) / duration);
      const value = Math.round(progress * 100);
      if (fill) fill.style.width = `${value}%`;
      if (percent) percent.textContent = `${String(value).padStart(2, "0")}%`;
      if (count) count.textContent = String(3 - Math.min(2, Math.floor(progress * 3)));
      if (status) status.textContent = lines[Math.min(lines.length - 1, Math.floor(progress * 3))];
      if (progress < 1) {
        requestAnimationFrame(tick);
      } else {
        try { sessionStorage.setItem("rapiflix-booted", "1"); } catch (_) {}
        boot.classList.add("is-done");
        setTimeout(() => boot.remove(), reduce ? 20 : 760);
      }
    };
    requestAnimationFrame(tick);
  }

  /* ---------- header ---------- */
  const header = $("#siteHeader");
  const paintHeader = () => header && header.classList.toggle("is-scrolled", window.scrollY > 8);
  paintHeader();
  window.addEventListener("scroll", paintHeader, { passive: true });

  const themeToggle = $("#themeToggle");
  themeToggle?.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    write("rapiflix-theme", next);
    const meta = $('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", next === "light" ? "#efe7d8" : "#100e0c");
  });

  const paletteToggle = $("#paletteToggle");
  paletteToggle?.addEventListener("click", () => {
    const current = document.documentElement.dataset.palette || "vermilion";
    const next = PALETTES[(PALETTES.indexOf(current) + 1) % PALETTES.length];
    document.documentElement.dataset.palette = next;
    write("rapiflix-palette", next);
    paletteToggle.animate(
      [{ transform: "rotate(0) scale(1)" }, { transform: "rotate(-16deg) scale(1.08)" }, { transform: "rotate(0) scale(1)" }],
      { duration: 380, easing: "cubic-bezier(.2,.8,.2,1)" }
    );
    window.RapiflixUI?.toast?.(`${STOCKS[next]} film stock`);
  });

  /* ---------- scroll lock + focus trap ---------- */
  let locks = 0;
  function lockScroll() {
    locks += 1;
    document.body.style.overflow = "hidden";
  }
  function unlockScroll() {
    locks = Math.max(0, locks - 1);
    if (!locks) document.body.style.overflow = "";
  }
  function trap(event, root) {
    if (event.key !== "Tab" || !root) return;
    const items = $$('a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])', root)
      .filter((el) => el.offsetParent !== null || el === document.activeElement);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  /* ---------- mobile sheet ---------- */
  const sheet = $("#mobileNav");
  const menuButton = $("#menuButton");
  let sheetOpen = false;

  function openSheet() {
    if (!sheet) return;
    sheetOpen = true;
    sheet.hidden = false;
    menuButton?.setAttribute("aria-expanded", "true");
    lockScroll();
    $(".mobile-links a", sheet)?.focus({ preventScroll: true });
  }
  function closeSheet(restore = true) {
    if (!sheet || !sheetOpen) return;
    sheetOpen = false;
    sheet.hidden = true;
    menuButton?.setAttribute("aria-expanded", "false");
    unlockScroll();
    if (restore) menuButton?.focus({ preventScroll: true });
  }

  menuButton?.addEventListener("click", () => (sheetOpen ? closeSheet() : openSheet()));
  $("#menuClose")?.addEventListener("click", () => closeSheet());
  sheet?.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { event.preventDefault(); closeSheet(); }
    else trap(event, sheet);
  });
  sheet?.addEventListener("click", (event) => {
    if (event.target.closest("a")) closeSheet(false);
  });

  /* ---------- search overlay ---------- */
  const overlay = $("#searchOverlay");
  const input = $("#searchInput");
  const results = $("#searchSuggestions");
  const trigger = $("#searchTrigger");
  let overlayOpen = false;
  let lastFocus = null;
  let debounce = 0;
  let controller = null;
  let items = [];
  let activeIndex = -1;

  const RECENT_KEY = "rapiflix-recent";
  function recent() {
    try {
      const parsed = JSON.parse(sessionStorage.getItem(RECENT_KEY) || "[]");
      return Array.isArray(parsed) ? parsed.filter((x) => x && x.id).slice(0, 5) : [];
    } catch (_) { return []; }
  }
  function remember(item) {
    const list = recent().filter((x) => !(String(x.id) === String(item.id) && x.type === item.type));
    list.unshift({ id: item.id, type: item.type, title: item.title, poster: item.poster, year: item.year });
    try { sessionStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 5))); } catch (_) {}
  }

  const image = (path) => {
    if (!path) return "";
    return path.startsWith("http") ? path : `https://image.tmdb.org/t/p/w92${path}`;
  };
  const normalise = (item) => ({
    id: Number(item.id),
    type: item.media_type === "tv" ? "tv" : "movie",
    title: item.title || item.name || "Untitled",
    year: String(item.release_date || item.first_air_date || "").slice(0, 4),
    poster: item.poster_path || ""
  });

  function recentMarkup() {
    const list = recent();
    if (!list.length) {
      return `<div class="search-empty"><strong>Search Rapiflix</strong>Movies, series and anime from the TMDB catalogue.</div>`;
    }
    return `<span class="search-group-label">Recent</span>${list.map((item, index) => row(item, index)).join("")}`;
  }

  function row(item, index) {
    const poster = image(item.poster);
    const meta = `${item.type === "tv" ? "Series" : "Movie"}${item.year ? ` · ${item.year}` : ""}`;
    return `<button class="search-result" role="option" type="button" data-index="${index}" data-id="${esc(item.id)}" data-type="${esc(item.type)}">
      ${poster ? `<img src="${esc(poster)}" alt="" width="44" height="62" loading="lazy">` : `<span class="search-result-fallback" aria-hidden="true"></span>`}
      <span class="search-result-copy"><strong>${esc(item.title)}</strong><small>${esc(meta)}</small></span>
      <span class="search-result-go" aria-hidden="true">↗</span>
    </button>`;
  }

  function paintRecent() {
    items = recent();
    activeIndex = -1;
    results.innerHTML = recentMarkup();
  }

  function paintResults(list, query) {
    items = list;
    activeIndex = -1;
    if (!list.length) {
      results.innerHTML = `<div class="search-empty"><strong>No matches</strong>Nothing in the movie or TV index matched “${esc(query)}”.</div>`;
      return;
    }
    const movies = list.filter((item) => item.type === "movie");
    const series = list.filter((item) => item.type === "tv");
    let html = "";
    if (movies.length) html += `<span class="search-group-label">Movies</span>${movies.map((item) => row(item, list.indexOf(item))).join("")}`;
    if (series.length) html += `<span class="search-group-label">Series</span>${series.map((item) => row(item, list.indexOf(item))).join("")}`;
    results.innerHTML = html;
  }

  function openSearch() {
    if (!overlay) return;
    overlayOpen = true;
    lastFocus = document.activeElement;
    overlay.hidden = false;
    input?.setAttribute("aria-expanded", "true");
    lockScroll();
    input.value = "";
    paintRecent();
    requestAnimationFrame(() => input?.focus({ preventScroll: true }));
  }

  function closeSearch(restore = true) {
    if (!overlay || !overlayOpen) return;
    overlayOpen = false;
    overlay.hidden = true;
    input?.setAttribute("aria-expanded", "false");
    unlockScroll();
    controller?.abort();
    if (restore && lastFocus instanceof HTMLElement) lastFocus.focus({ preventScroll: true });
  }

  function navigateTo(path) {
    if (window.RapiflixApp && typeof window.RapiflixApp.go === "function") window.RapiflixApp.go(path);
    else window.location.assign(path);
  }

  function choose(item) {
    if (!item) return;
    remember(item);
    closeSearch(false);
    navigateTo(`/title/${item.id}?type=${item.type}`);
  }

  function move(delta) {
    const buttons = $$(".search-result", results);
    if (!buttons.length) return;
    activeIndex = (activeIndex + delta + buttons.length) % buttons.length;
    buttons.forEach((button, index) => button.classList.toggle("is-active", index === activeIndex));
    buttons[activeIndex].scrollIntoView({ block: "nearest" });
  }

  async function search(term) {
    controller?.abort();
    controller = new AbortController();
    const query = term.trim();
    if (query.length < 2) { paintRecent(); return; }
    results.innerHTML = `<span class="search-group-label">Searching</span>${Array.from({ length: 3 }, () => `<div class="search-result"><span class="sk sk-poster" style="width:44px;height:62px"></span><span class="search-result-copy"><span class="sk sk-line" style="width:70%"></span><span class="sk sk-line short"></span></span></div>`).join("")}`;
    try {
      const response = await fetch(`/api/tmdb/search/multi?query=${encodeURIComponent(query)}&include_adult=false&page=1`, { signal: controller.signal });
      if (!response.ok) throw new Error("Search is unavailable");
      const data = await response.json();
      const list = (data.results || [])
        .filter((item) => item.media_type === "movie" || item.media_type === "tv")
        .map(normalise)
        .filter((item) => item.poster)
        .slice(0, 8);
      paintResults(list, query);
    } catch (error) {
      if (error.name === "AbortError") return;
      results.innerHTML = `<div class="search-empty"><strong>Search is unavailable</strong>${esc(error.message || "Try again in a moment.")}</div>`;
    }
  }

  trigger?.addEventListener("click", openSearch);
  $("#mobileSearch")?.addEventListener("click", () => { closeSheet(false); openSearch(); });
  $$("[data-search-close]").forEach((element) => element.addEventListener("click", () => closeSearch()));

  input?.addEventListener("input", () => {
    clearTimeout(debounce);
    const value = input.value;
    debounce = window.setTimeout(() => search(value), 180);
  });

  overlay?.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { event.preventDefault(); closeSearch(); }
    else if (event.key === "ArrowDown") { event.preventDefault(); move(1); }
    else if (event.key === "ArrowUp") { event.preventDefault(); move(-1); }
    else if (event.key === "Enter") {
      event.preventDefault();
      if (activeIndex >= 0 && items[activeIndex]) choose(items[activeIndex]);
      else if (input.value.trim()) { closeSearch(false); navigateTo(`/search?q=${encodeURIComponent(input.value.trim())}`); }
    } else {
      trap(event, overlay);
    }
  });

  results?.addEventListener("click", (event) => {
    const button = event.target.closest(".search-result[data-id]");
    if (!button) return;
    const item = items[Number(button.dataset.index)];
    choose(item || { id: button.dataset.id, type: button.dataset.type, title: button.querySelector("strong")?.textContent || "", poster: "", year: "" });
  });

  /* ---------- global shortcuts ---------- */
  document.addEventListener("keydown", (event) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || "");
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      overlayOpen ? closeSearch() : openSearch();
      return;
    }
    if (event.key === "/" && !typing && !overlayOpen && !sheetOpen) {
      event.preventDefault();
      openSearch();
    }
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 860) closeSheet(false);
  });

  window.RapiflixUI = { reduce, $, $$, esc, openSearch, closeSearch, toast: null };

  /* toast is owned by app.js once it boots; this keeps a safe fallback. */
  window.RapiflixUI.toast = (message) => {
    const toast = $("#toast");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("is-show");
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove("is-show"), 2400);
  };
})();
