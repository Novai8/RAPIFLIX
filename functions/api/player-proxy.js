const INITIAL_HOSTS = new Set(["vidcore.org", "www.vidcore.org"]);
const REDIRECT_HOSTS = new Set(["vidcore.org", "www.vidcore.org", "vidspark.to", "www.vidspark.to"]);
const INITIAL_PATH = /^\/embed\/(?:movie\/[1-9][0-9]*|tv\/[1-9][0-9]*\/[0-9]+\/[0-9]+)\/?$/;
const REDIRECT_PATH = /^\/(?:embed\/(?:movie\/[1-9][0-9]*|tv\/[1-9][0-9]*\/[0-9]+\/[0-9]+)|movie\/[1-9][0-9]*|tv\/[1-9][0-9]*\/[0-9]+\/[0-9]+)\/?$/;

// This response-header sandbox avoids adding a sandbox attribute to the iframe.
// Scripts and forms work, but popups and top-level navigation remain blocked.
// allow-same-origin is intentionally omitted to isolate the proxied page from Rapiflix.
const PLAYER_CSP = "sandbox allow-scripts allow-forms allow-presentation allow-pointer-lock allow-orientation-lock";

function jsonError(status, message) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

function isHttpsAllowed(url, hosts, pathPattern) {
  return url.protocol === "https:" &&
    !url.username &&
    !url.password &&
    !url.port &&
    hosts.has(url.hostname.toLowerCase()) &&
    pathPattern.test(url.pathname);
}

function injectBase(html, origin) {
  const base = '<base href="' + origin + '/">';
  html = html.replace(/<base\b[^>]*>/gi, "");
  if (/<head\b[^>]*>/i.test(html)) {
    return html.replace(/<head\b[^>]*>/i, (head) => head + base);
  }
  return '<!doctype html><html><head>' + base + '</head><body>' + html + '</body></html>';
}

export async function onRequest({ request }) {
  if (request.method !== "GET") {
    return jsonError(405, "Only GET requests are supported.");
  }

  const incoming = new URL(request.url);
  const rawTarget = incoming.searchParams.get("url");
  if (!rawTarget || rawTarget.length > 2048) {
    return jsonError(400, "A valid VidCore embed URL is required.");
  }

  let target;
  try {
    target = new URL(rawTarget);
  } catch {
    return jsonError(400, "The supplied embed URL is invalid.");
  }

  if (!isHttpsAllowed(target, INITIAL_HOSTS, INITIAL_PATH) || target.hash) {
    return jsonError(403, "Only approved VidCore movie and TV embed URLs are allowed.");
  }

  let upstream;
  let current = target;
  try {
    for (let redirects = 0; redirects <= 3; redirects += 1) {
      upstream = await fetch(current.toString(), {
        method: "GET",
        redirect: "manual",
        headers: {
          "Accept": "text/html,application/xhtml+xml",
          "Accept-Language": request.headers.get("accept-language") || "en-US,en;q=0.9",
          "Referer": current.origin + "/"
        }
      });

      if (![301, 302, 303, 307, 308].includes(upstream.status)) break;

      const location = upstream.headers.get("location");
      if (!location || redirects === 3) {
        return jsonError(502, "The streaming provider returned an unsupported redirect.");
      }
      const next = new URL(location, current);
      if (!isHttpsAllowed(next, REDIRECT_HOSTS, REDIRECT_PATH) || next.hash) {
        return jsonError(502, "The streaming provider redirected to an unapproved host or path.");
      }
      current = next;
    }
  } catch (error) {
    console.error("Rapiflix player proxy failed", {
      errorName: error instanceof Error ? error.name : "UnknownError"
    });
    return jsonError(502, "The streaming provider could not be reached.");
  }

  if (!upstream || !upstream.ok) {
    return jsonError(502, "The streaming provider returned HTTP " + (upstream ? upstream.status : "unknown") + ".");
  }

  const contentType = upstream.headers.get("content-type") || "";
  if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) {
    return jsonError(502, "The provider did not return an embeddable HTML player.");
  }

  let html;
  try {
    html = await upstream.text();
  } catch {
    return jsonError(502, "The provider returned an unreadable player document.");
  }
  if (html.length > 2000000) {
    return jsonError(502, "The provider player document exceeded the allowed size.");
  }

  html = injectBase(html, current.origin);

  const headers = new Headers({
    "Content-Type": contentType.includes("charset=") ? contentType : contentType + "; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin"
  });
  const upstreamCsp = upstream.headers.get("content-security-policy");
  headers.set("Content-Security-Policy", upstreamCsp ? upstreamCsp + ", " + PLAYER_CSP : PLAYER_CSP);

  return new Response(html, {
    status: upstream.status,
    headers
  });
}
