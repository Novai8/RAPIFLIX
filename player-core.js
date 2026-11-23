/*
 * Rapiflix player core.
 *
 * Single source of truth for provider URL construction, parameter validation,
 * provider error classification, trusted postMessage checks and the player
 * loading state machine. Runs in the browser (window.RapiflixPlayer) and in
 * Node for unit tests (module.exports).
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.RapiflixPlayer = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var APPROVED_PROVIDER_ORIGINS = Object.freeze(["https://vidcore.org"]);
  var MEDIA_TYPES = Object.freeze(["movie", "tv"]);

  var STATES = Object.freeze({
    IDLE: "idle",
    VALIDATING: "validating",
    PREPARING: "preparing",
    IFRAME_LOADING: "iframe_loading",
    EMBED_LOADED: "embed_loaded",
    UNVERIFIED: "unverified",
    PLAYING: "playing",
    PAUSED: "paused",
    ENDED: "ended",
    PROVIDER_ERROR: "provider_error",
    TIMEOUT: "timeout",
    UNAVAILABLE: "unavailable"
  });

  var ACTIVE_STATES = Object.freeze([
    STATES.VALIDATING,
    STATES.PREPARING,
    STATES.IFRAME_LOADING,
    STATES.EMBED_LOADED,
    STATES.PLAYING,
    STATES.PAUSED
  ]);

  var ERROR_CATEGORIES = Object.freeze({
    NOT_FOUND: "not_found",
    RATE_LIMITED: "rate_limited",
    SERVER_ERROR: "server_error",
    NETWORK_ERROR: "network_error",
    FORBIDDEN: "forbidden",
    CLIENT_ERROR: "client_error",
    TIMEOUT: "timeout",
    INVALID_REQUEST: "invalid_request"
  });

  var ERROR_COPY = Object.freeze({
    not_found: {
      title: "Not in this provider's library",
      message: "The authorized provider does not currently have this title. Retrying will not help."
    },
    rate_limited: {
      title: "The provider is rate limiting requests",
      message: "Too many playback requests were made. Wait a moment, then try again."
    },
    server_error: {
      title: "The provider had a temporary problem",
      message: "The provider returned a server error. A limited retry may recover it."
    },
    network_error: {
      title: "The player could not be reached",
      message: "Check your connection and try again. Your selected title and episode are preserved."
    },
    forbidden: {
      title: "This embed is not authorized",
      message: "The provider refused this playback request. The site operator must verify the integration."
    },
    client_error: {
      title: "The playback request was rejected",
      message: "The provider rejected the request. Check the title, season and episode values."
    },
    timeout: {
      title: "The stream is taking too long",
      message: "The provider loaded, but playback did not start in time. Try again, or use official viewing options."
    },
    invalid_request: {
      title: "This title cannot be played here",
      message: "The selected title does not have a valid provider configuration."
    }
  });

  function isPlainObject(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
  }

  function normalizeTmdbId(value) {
    if (typeof value === "number") {
      return Number.isSafeInteger(value) && value > 0 && value <= 9999999999 ? value : null;
    }
    if (typeof value === "string" && /^[1-9][0-9]{0,9}$/.test(value.trim())) {
      return Number(value.trim());
    }
    return null;
  }

  function normalizeInteger(value, min, max) {
    if (typeof value === "number") {
      return Number.isInteger(value) && value >= min && value <= max ? value : null;
    }
    if (typeof value === "string" && /^[0-9]{1,6}$/.test(value.trim())) {
      var parsed = Number(value.trim());
      return parsed >= min && parsed <= max ? parsed : null;
    }
    return null;
  }

  function parseOrigin(value) {
    try {
      var url = new URL(value);
      return url.protocol === "https:" ? url.origin : null;
    } catch (_) {
      return null;
    }
  }

  function normalizeApprovedOrigins(list) {
    var origins = Array.isArray(list) && list.length ? list : APPROVED_PROVIDER_ORIGINS;
    var result = [];
    for (var i = 0; i < origins.length; i += 1) {
      var origin = parseOrigin(origins[i]);
      if (origin && result.indexOf(origin) === -1) result.push(origin);
    }
    return result;
  }

  function isApprovedEmbedUrl(value, approvedOrigins) {
    try {
      var url = new URL(value);
      if (url.protocol !== "https:") return false;
      if (url.username || url.password) return false;
      if (url.hostname === "rapiflix.online" || url.hostname.endsWith(".rapiflix.online")) return false;
      return normalizeApprovedOrigins(approvedOrigins).indexOf(url.origin) !== -1;
    } catch (_) {
      return false;
    }
  }

  function failure(code, message, extra) {
    var result = { ok: false, code: code, message: message };
    if (extra) {
      for (var key in extra) {
        if (Object.prototype.hasOwnProperty.call(extra, key)) result[key] = extra[key];
      }
    }
    return result;
  }

  /*
   * Build the exact provider embed URL.
   *
   * input = {
   *   mediaType: "movie" | "tv",
   *   tmdbId, season, episode,
   *   template, approvedOrigins,
   *   title, poster, language, settings   (accepted, not required, never used to
   *   invent unverified provider parameters)
   * }
   */
  function buildEmbedUrl(input) {
    if (!isPlainObject(input)) {
      return failure("invalid_input", "Playback input must be an object.");
    }

    var mediaType = input.mediaType;
    if (MEDIA_TYPES.indexOf(mediaType) === -1) {
      return failure("invalid_media_type", "Media type must be either movie or tv.");
    }

    var tmdbId = normalizeTmdbId(input.tmdbId);
    if (tmdbId === null) {
      return failure("invalid_tmdb_id", "A numeric TMDB ID is required.");
    }

    var season = null;
    var episode = null;
    if (mediaType === "tv") {
      if (input.season === undefined || input.season === null || input.season === "" ||
          input.episode === undefined || input.episode === null || input.episode === "") {
        return failure("missing_tv_context", "TV playback requires a season and episode.");
      }
      season = normalizeInteger(input.season, 0, 999);
      episode = normalizeInteger(input.episode, 1, 99999);
      if (season === null) {
        return failure("invalid_season", "Season must be a whole number between 0 and 999.");
      }
      if (episode === null) {
        return failure("invalid_episode", "Episode must be a whole number between 1 and 99999.");
      }
    }

    var template = input.template;
    if (typeof template !== "string" || !template.trim()) {
      return failure("invalid_provider_template", "The provider URL template is missing.");
    }
    if (!isApprovedEmbedUrl(template, input.approvedOrigins)) {
      return failure("provider_not_approved", "The provider URL is not on the approved origin list.");
    }

    // Detect a movie/TV template mismatch before checking placeholders so the
    // error names the real problem.
    try {
      var templatePath = new URL(template.replace(/\{[a-z_]+\}/gi, "0")).pathname;
      if (mediaType === "movie" && /\/embed\/tv\//.test(templatePath)) {
        return failure("media_type_mismatch", "A movie cannot use a TV embed template.");
      }
      if (mediaType === "tv" && /\/embed\/movie\//.test(templatePath)) {
        return failure("media_type_mismatch", "A TV episode cannot use a movie embed template.");
      }
    } catch (_) {
      return failure("invalid_provider_template", "The provider template is not a valid URL.");
    }

    var required = ["{tmdb_id}"];
    if (mediaType === "tv") required.push("{season}", "{episode}");
    for (var i = 0; i < required.length; i += 1) {
      if (template.indexOf(required[i]) === -1) {
        return failure("invalid_provider_template", "The provider template is missing " + required[i] + ".");
      }
    }

    var url = template
      .replace(/\{tmdb_id\}/g, String(tmdbId))
      .replace(/\{season\}/g, String(season === null ? 0 : season))
      .replace(/\{episode\}/g, String(episode === null ? 0 : episode));

    var origin = parseOrigin(url);
    if (!origin || !isApprovedEmbedUrl(url, input.approvedOrigins)) {
      return failure("provider_not_approved", "The constructed embed URL is not approved.");
    }

    var parsed = new URL(url);
    if (!/\/embed\/(movie|tv)\//.test(parsed.pathname)) {
      return failure("invalid_provider_template", "The provider template must target an /embed/movie or /embed/tv path.");
    }
    if (mediaType === "movie" && /\/tv\//.test(parsed.pathname)) {
      return failure("media_type_mismatch", "A movie cannot use a TV embed template.");
    }
    if (mediaType === "tv" && /\/movie\//.test(parsed.pathname)) {
      return failure("media_type_mismatch", "A TV episode cannot use a movie embed template.");
    }
    if (/\{[a-z_]+\}/i.test(url)) {
      return failure("invalid_provider_template", "The provider template contains unresolved placeholders.");
    }

    return {
      ok: true,
      url: url,
      origin: origin,
      mediaType: mediaType,
      tmdbId: tmdbId,
      season: season,
      episode: episode
    };
  }

  function classifyStatus(status, headers) {
    var headerValue = "";
    try {
      if (headers && typeof headers.get === "function") headerValue = headers.get("retry-after") || "";
      else if (headers && typeof headers === "object") headerValue = headers["retry-after"] || headers["Retry-After"] || "";
    } catch (_) {
      headerValue = "";
    }

    var retryAfterMs = 0;
    if (headerValue) {
      var seconds = Number(headerValue);
      if (Number.isFinite(seconds) && seconds >= 0) retryAfterMs = Math.min(seconds, 300) * 1000;
      else {
        var date = Date.parse(headerValue);
        if (!Number.isNaN(date)) retryAfterMs = Math.max(0, Math.min(date - Date.now(), 300000));
      }
    }

    if (status === 404) {
      return { category: ERROR_CATEGORIES.NOT_FOUND, retryable: false, retryAfterMs: retryAfterMs };
    }
    if (status === 429) {
      return { category: ERROR_CATEGORIES.RATE_LIMITED, retryable: true, retryAfterMs: retryAfterMs };
    }
    if (status === 401 || status === 403) {
      return { category: ERROR_CATEGORIES.FORBIDDEN, retryable: false, retryAfterMs: retryAfterMs };
    }
    if (status >= 500 && status <= 599) {
      return { category: ERROR_CATEGORIES.SERVER_ERROR, retryable: true, retryAfterMs: retryAfterMs };
    }
    if (typeof status === "number" && status >= 400) {
      return { category: ERROR_CATEGORIES.CLIENT_ERROR, retryable: false, retryAfterMs: retryAfterMs };
    }
    if (status === 0 || status === null || status === undefined) {
      return { category: ERROR_CATEGORIES.NETWORK_ERROR, retryable: true, retryAfterMs: retryAfterMs };
    }
    return { category: ERROR_CATEGORIES.CLIENT_ERROR, retryable: false, retryAfterMs: retryAfterMs };
  }

  function classifyFetchError(error) {
    if (error && (error.name === "AbortError" || error.name === "TimeoutError")) {
      return { category: ERROR_CATEGORIES.TIMEOUT, retryable: true, retryAfterMs: 0 };
    }
    return { category: ERROR_CATEGORIES.NETWORK_ERROR, retryable: true, retryAfterMs: 0 };
  }

  function retryDelayMs(attempt, options) {
    var opts = options || {};
    var base = Number(opts.baseMs) > 0 ? Number(opts.baseMs) : 800;
    var max = Number(opts.maxMs) > 0 ? Number(opts.maxMs) : 8000;
    var retryAfterMs = Number(opts.retryAfterMs) > 0 ? Number(opts.retryAfterMs) : 0;
    var random = typeof opts.random === "function" ? opts.random() : 0.5;
    var safeAttempt = Math.max(1, Number(attempt) || 1);
    var exponential = Math.min(max, base * Math.pow(2, safeAttempt - 1));
    var jitter = Math.round(exponential * 0.2 * Math.min(Math.max(random, 0), 1));
    return Math.min(300000, Math.max(exponential + jitter, retryAfterMs));
  }

  function canRetry(attempt, maxAttempts) {
    var max = Number(maxAttempts) > 0 ? Number(maxAttempts) : 2;
    return Math.max(0, Number(attempt) || 0) < max;
  }

  function describeError(category) {
    return ERROR_COPY[category] || ERROR_COPY.invalid_request;
  }

  function createPlaybackMachine(options) {
    var opts = options || {};
    var timeoutMs = Number(opts.timeoutMs) > 0 ? Number(opts.timeoutMs) : 18000;
    var playbackWaitMs = Number(opts.playbackWaitMs) > 0 ? Number(opts.playbackWaitMs) : 12000;
    var schedule = typeof opts.setTimer === "function" ? opts.setTimer : setTimeout;
    var cancelTimer = typeof opts.clearTimer === "function" ? opts.clearTimer : clearTimeout;
    var now = typeof opts.now === "function" ? opts.now : function () { return Date.now(); };
    var onChange = typeof opts.onTransition === "function" ? opts.onTransition : function () {};

    var state = STATES.IDLE;
    var timer = null;
    var seq = 0;
    var attempt = 0;
    var disposed = false;
    var detail = {};

    function clear() {
      if (timer !== null) {
        cancelTimer(timer);
        timer = null;
      }
    }

    function transition(next, extra) {
      var previous = state;
      if (previous === next && !extra) return;
      state = next;
      detail = extra || {};
      onChange({ state: previous === next ? state : previous, next: state, attempt: attempt, at: now(), detail: detail });
    }

    function arm(ms, reason) {
      clear();
      var token = seq;
      timer = schedule(function () {
        timer = null;
        if (disposed || token !== seq) return;
        if (reason === "playback_event") {
          // The provider document loaded but has not reported playback. VidCore
          // does not emit postMessage events, so this is unverifiable rather
          // than failed. Never present it as an error.
          transition(STATES.UNVERIFIED, { reason: "playback_not_reported", waitedMs: ms });
          return;
        }
        transition(STATES.TIMEOUT, { reason: reason || "no_playback", waitedMs: ms });
      }, ms);
    }

    function begin() {
      if (disposed) return null;
      clear();
      seq += 1;
      attempt += 1;
      transition(STATES.PREPARING, { attempt: attempt });
      transition(STATES.VALIDATING, { attempt: attempt });
      return seq;
    }

    function markIframeLoading(token) {
      if (disposed || token !== seq) return false;
      if (state !== STATES.VALIDATING && state !== STATES.PREPARING) return false;
      transition(STATES.IFRAME_LOADING);
      arm(timeoutMs, "iframe_load");
      return true;
    }

    function markIframeLoaded(token) {
      if (disposed || token !== seq) return false;
      if ([STATES.PREPARING, STATES.VALIDATING, STATES.IFRAME_LOADING].indexOf(state) === -1) return false;
      transition(STATES.EMBED_LOADED, { waitedMs: timeoutMs });
      arm(playbackWaitMs, "playback_event");
      return true;
    }

    function markPlaying(token) {
      if (disposed || token !== seq) return false;
      // A provider may start playing after our playback-event timeout fired.
      // A genuine event must still be able to correct the optimistic state.
      if (ACTIVE_STATES.indexOf(state) === -1 && state !== STATES.TIMEOUT && state !== STATES.UNVERIFIED) return false;
      clear();
      transition(STATES.PLAYING);
      return true;
    }

    function markPaused(token) {
      if (disposed || token !== seq) return false;
      if (state !== STATES.PLAYING) return false;
      transition(STATES.PAUSED);
      return true;
    }

    function markEnded(token) {
      if (disposed || token !== seq) return false;
      if (state !== STATES.PLAYING && state !== STATES.PAUSED) return false;
      clear();
      transition(STATES.ENDED);
      return true;
    }

    function fail(token, category, failOptions) {
      if (disposed || token !== seq) return false;
      var retryable = !(failOptions && failOptions.retryable === false);
      clear();
      transition(retryable ? STATES.PROVIDER_ERROR : STATES.UNAVAILABLE, {
        error: category || ERROR_CATEGORIES.CLIENT_ERROR,
        retryable: retryable
      });
      return true;
    }

    function retry() {
      if (disposed) return null;
      if (ACTIVE_STATES.indexOf(state) !== -1) return null;
      return begin();
    }

    function dispose() {
      clear();
      seq += 1;
      disposed = true;
      transition(STATES.IDLE, { disposed: true });
    }

    return {
      begin: begin,
      iframeLoading: markIframeLoading,
      iframeLoaded: markIframeLoaded,
      play: markPlaying,
      pause: markPaused,
      ended: markEnded,
      fail: fail,
      retry: retry,
      dispose: dispose,
      token: function () { return seq; },
      state: function () { return state; },
      attempt: function () { return attempt; },
      isDisposed: function () { return disposed; }
    };
  }

  function isTrustedProviderMessage(event, expected) {
    if (!event || typeof event !== "object") return false;
    if (!isPlainObject(event.data)) return false;
    if (!expected) return false;
    if (event.origin !== expected.origin) return false;
    if (expected.source !== undefined && expected.source !== null && event.source !== expected.source) return false;
    return true;
  }

  function parseProviderEvent(data) {
    if (!isPlainObject(data)) return null;
    var name = typeof data.event === "string" ? data.event : (typeof data.type === "string" ? data.type : "");
    if (name === "vidcore:play") return "play";
    if (name === "vidcore:pause") return "pause";
    if (name === "vidcore:ended") return "ended";
    return null;
  }

  /*
   * Guard used at render time and in regression tests. A provider iframe may
   * never be pointed at Rapiflix itself, even if configuration is corrupted.
   */
  function assertPlayerFrameUrl(url, approvedOrigins) {
    var result = { ok: false, url: String(url || ""), origin: null };
    try {
      var parsed = new URL(result.url);
      result.origin = parsed.origin;
      if (parsed.protocol !== "https:") {
        result.reason = "insecure_protocol";
        return result;
      }
      var host = parsed.hostname.toLowerCase();
      if (host === "rapiflix.online" || host.endsWith(".rapiflix.online") ||
          host === "rapiflix.hussnaintariq-ai.workers.dev" || host.endsWith(".hussnaintariq-ai.workers.dev")) {
        result.reason = "recursive_rapiflix_embed";
        return result;
      }
      if (normalizeApprovedOrigins(approvedOrigins).indexOf(parsed.origin) === -1) {
        result.reason = "provider_not_approved";
        return result;
      }
      if (!/\/embed\/(movie|tv)\//.test(parsed.pathname)) {
        result.reason = "not_an_embed_path";
        return result;
      }
      result.ok = true;
      return result;
    } catch (_) {
      result.reason = "invalid_url";
      return result;
    }
  }

  function createDiagnostics(options) {
    var opts = options || {};
    var enabled = opts.enabled === true;
    var entries = [];
    var limit = Number(opts.limit) > 0 ? Number(opts.limit) : 60;

    function record(type, detail) {
      if (!enabled) return null;
      var entry = { type: type, at: new Date().toISOString() };
      if (detail) {
        for (var key in detail) {
          if (!Object.prototype.hasOwnProperty.call(detail, key)) continue;
          if (/token|key|secret|authorization|cookie/i.test(key)) continue;
          entry[key] = detail[key];
        }
      }
      entries.push(entry);
      if (entries.length > limit) entries.shift();
      return entry;
    }

    function log(type, detail) {
      var entry = record(type, detail);
      if (entry && typeof console !== "undefined" && console.debug) console.debug("[rapiflix-player]", type, detail || "");
      return entry;
    }

    return {
      enabled: enabled,
      log: log,
      entries: function () { return entries.slice(); },
      snapshot: function () { return entries.slice(); }
    };
  }

  return {
    STATES: STATES,
    MEDIA_TYPES: MEDIA_TYPES,
    APPROVED_PROVIDER_ORIGINS: APPROVED_PROVIDER_ORIGINS,
    ERROR_CATEGORIES: ERROR_CATEGORIES,
    ERROR_COPY: ERROR_COPY,
    normalizeTmdbId: normalizeTmdbId,
    normalizeInteger: normalizeInteger,
    isApprovedEmbedUrl: isApprovedEmbedUrl,
    buildEmbedUrl: buildEmbedUrl,
    classifyStatus: classifyStatus,
    classifyFetchError: classifyFetchError,
    retryDelayMs: retryDelayMs,
    canRetry: canRetry,
    describeError: describeError,
    createPlaybackMachine: createPlaybackMachine,
    isTrustedProviderMessage: isTrustedProviderMessage,
    parseProviderEvent: parseProviderEvent,
    assertPlayerFrameUrl: assertPlayerFrameUrl,
    createDiagnostics: createDiagnostics
  };
});
