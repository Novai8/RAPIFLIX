/* Rapiflix provider registry — source resolution outside the presentation layer. */
(() => {
  "use strict";
  if (window.RapiflixProviders) return;

  const HLS_CDN = "https://cdn.jsdelivr.net/npm/hls.js@1.6.13/dist/hls.min.js";
  const VIDEO_ID = /^[A-Za-z0-9-]{8,80}$/;

  const isHttps = (value) => {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password;
    } catch (_) {
      return false;
    }
  };

  const hostOf = (value) => {
    try {
      return new URL(value).hostname.toLowerCase();
    } catch (_) {
      return "";
    }
  };

  const isVidCoreHost = (value) => {
    const host = hostOf(value);
    return host === "vidcore.org" || host.endsWith(".vidcore.org");
  };

  function mediaOf(input) {
    const type = input?.type === "tv" ? "tv" : "movie";
    return {
      id: String(input?.id ?? ""),
      type,
      season: Math.max(0, Number(input?.season) || 1),
      episode: Math.max(0, Number(input?.episode) || 1)
    };
  }

  /* Order matters: a title-specific PeerTube mapping wins, then a title-specific
     VidCore/HTTPS override, then the global authorised template. */
  function sources(streams, input) {
    const config = streams && typeof streams === "object" ? streams : {};
    const media = mediaOf(input);
    const out = [];
    const push = (entry) => {
      if (!entry || !entry.url || !isHttps(entry.url)) return;
      if (out.some((item) => item.url === entry.url)) return;
      out.push(entry);
    };

    push(peerTube(config.peerTube, media));

    const override = (config.movies || {})[media.id];
    const candidates = Array.isArray(override) ? override : override ? [override] : [];
    for (const candidate of candidates) {
      if (!candidate || typeof candidate.url !== "string" || !isHttps(candidate.url)) continue;
      const kind = candidate.type === "hls" ? "hls" : candidate.mode === "iframe" ? "iframe" : "file";
      push({
        id: `override:${out.length}`,
        label: candidate.label || "Configured source",
        provider: candidate.provider || "Configured",
        kind,
        url: candidate.url,
        authorized: true
      });
    }

    push(vidCore(config, media));
    return out;
  }

  function peerTube(peerTubeConfig, media) {
    if (!peerTubeConfig || peerTubeConfig.enabled !== true) return null;
    const instance = peerTubeConfig.instanceUrl;
    if (!isHttps(instance)) return null;

    let base;
    try {
      base = new URL(instance);
    } catch (_) {
      return null;
    }
    if (base.pathname !== "/" || base.search || base.hash) return null;

    const key = media.type === "tv" ? `tv:${media.id}:${media.season}:${media.episode}` : `movie:${media.id}`;
    const raw = peerTubeConfig.videos?.[key];
    const videoId = typeof raw === "string" ? raw : raw?.uuid || raw?.id || "";
    if (!VIDEO_ID.test(videoId)) return null;

    const url = new URL(`/videos/embed/${encodeURIComponent(videoId)}`, base.origin);
    url.searchParams.set("api", "1");
    url.searchParams.set("title", "0");
    return {
      id: "peertube",
      label: "PeerTube",
      provider: "PeerTube",
      kind: "iframe",
      url: url.toString(),
      peerTube: true,
      authorized: true
    };
  }

  function vidCore(config, media) {
    const providers = Array.isArray(config.embedProviders) ? config.embedProviders : [];
    const provider = providers.find(
      (item) => item && item.authorized === true && item.mode === "iframe" && item.provider === "VidCore"
    );
    if (!provider) return null;

    const template = media.type === "tv" ? provider.tvUrlTemplate : provider.movieUrlTemplate;
    if (typeof template !== "string" || !isHttps(template) || !isVidCoreHost(template)) return null;

    const url = template
      .replaceAll("{tmdb_id}", encodeURIComponent(media.id))
      .replaceAll("{season}", String(media.season))
      .replaceAll("{episode}", String(media.episode));
    if (!isVidCoreHost(url)) return null;

    return {
      id: "vidcore",
      label: provider.label || "VidCore",
      provider: provider.provider,
      kind: "iframe",
      url,
      authorized: true
    };
  }

  function officialUrl(media) {
    const kind = media?.type === "tv" ? "tv" : "movie";
    return `https://www.themoviedb.org/${kind}/${encodeURIComponent(String(media?.id ?? ""))}/watch`;
  }

  /* HLS.js is only fetched when a configured source actually needs it. */
  let hlsPromise = null;
  function loadHls() {
    if (window.Hls) return Promise.resolve(window.Hls);
    if (hlsPromise) return hlsPromise;
    hlsPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = HLS_CDN;
      script.async = true;
      script.onload = () => (window.Hls ? resolve(window.Hls) : reject(new Error("HLS library did not initialise")));
      script.onerror = () => reject(new Error("HLS library could not be downloaded"));
      document.head.appendChild(script);
    });
    return hlsPromise;
  }

  /* The sandbox keeps scripts for the player but denies popups and top-level
     navigation, so a provider cannot turn a click into a forced redirect. */
  const IFRAME_SANDBOX = "allow-scripts allow-same-origin allow-forms allow-presentation";

  window.RapiflixProviders = {
    IFRAME_SANDBOX,
    sources,
    officialUrl,
    loadHls,
    isHttps,
    isVidCoreHost
  };
})();
