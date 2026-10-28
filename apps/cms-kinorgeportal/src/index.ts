export interface Env {
  ORIGIN: string;
}

/**
 * Umbraco sets no Cache-Control on media files. The browser therefore got
 * no cache directive at all and fetched every image again on every
 * visit. The edge cached them anyway (cf-cache-status HIT), so this concerns
 * the browser layer, not the CDN.
 *
 * One week, not immutable. Umbraco stores media under unique key folders, so a
 * replaced image normally gets a new path rather than mutating the old one. That makes a long
 * lifetime safe, but not safe enough to promise that a path is never reused.
 */
const MEDIA_CACHE_CONTROL = "public, max-age=604800";

/**
 * cms.ki.norge.no answered on plain http, including the backoffice login form.
 * norge.no is not HSTS-preloaded, so an editor who typed the address without
 * https could send the password in clear text.
 */
const HSTS = "max-age=31536000";

/**
 * SVG can contain scripts, and Umbraco does not sanitize uploaded SVGs. Opened
 * directly on cms.ki.norge.no the script runs on the backoffice origin, with
 * the login of whoever clicked. In an <img> scripts never run anyway, so
 * this does not change how the images are shown on the website.
 */
const SVG_CSP = "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

export default {
  async fetch(request, env, ctx) {
    const targetBase = env.ORIGIN;
    const blockContentDeliveryAPI = env.BLOCK_API;

    const url = new URL(request.url);

    if (url.protocol === "http:" && !LOCAL_HOSTS.has(url.hostname)) {
      url.protocol = "https:";
      return Response.redirect(url.toString(), 301);
    }

    // The CMS is headless and has nothing at the root; send people to the backoffice.
    if (url.pathname === "/") {
      return Response.redirect(`${url.origin}/umbraco`, 302);
    }

    if (blockContentDeliveryAPI !== "false" && url.pathname.toLowerCase().startsWith("/umbraco/delivery/api/")) {
      return new Response(null, { status: 404 });
    }

    const targetUrl = targetBase + url.pathname + url.search;
    const incomingUrl = new URL(request.url);

    const headers = new Headers(request.headers);
    headers.set("Host", incomingUrl.host);
    headers.set("X-Forwarded-Host", incomingUrl.host);
    headers.set("X-Forwarded-Proto", incomingUrl.protocol.replace(":", ""));


    const proxyRequest = new Request(targetUrl.toString(), {
      method: request.method,
      headers,
      body:
        request.method !== "GET" && request.method !== "HEAD"
          ? request.body
          : undefined,
      redirect: "manual",
    });

    const response: Response = await fetch(proxyRequest);

    // The backoffice uses a websocket. A copy of the response loses it.
    if (response.webSocket) return response;

    const proxied = new Response(response.body, response);
    proxied.headers.set("Strict-Transport-Security", HSTS);

    // Only media, and only when origin has not said anything itself. The backoffice and
    // Delivery API must not be cached in the browser.
    if (
      url.pathname.startsWith("/media/") &&
      response.ok &&
      !response.headers.has("Cache-Control")
    ) {
      proxied.headers.set("Cache-Control", MEDIA_CACHE_CONTROL);
    }

    if (url.pathname.startsWith("/media/")) {
      proxied.headers.set("X-Content-Type-Options", "nosniff");
      if (response.headers.get("Content-Type")?.startsWith("image/svg+xml")) {
        proxied.headers.set("Content-Security-Policy", SVG_CSP);
      }
    }

    return proxied;
  },
} satisfies ExportedHandler<Env>;
