export interface Env {
  ORIGIN: string;
}

/**
 * Umbraco setter ingen Cache-Control på mediefiler. Nettleseren fikk dermed
 * ingen cache-direktiv i det hele tatt og hentet hvert bilde på nytt ved hvert
 * besøk. Edgen cachet dem uansett (cf-cache-status HIT), så dette gjelder
 * nettleserlaget, ikke CDN-et.
 *
 * En uke, ikke immutable. Umbraco lagrer media under unike nøkkelmapper, så et
 * erstattet bilde får normalt ny sti framfor å mutere den gamle. Det gjør lang
 * levetid trygt, men ikke trygt nok til å love at en sti aldri gjenbrukes.
 */
const MEDIA_CACHE_CONTROL = "public, max-age=604800";

/**
 * cms.ki.norge.no svarte på ren http, også innloggingsskjemaet til backoffice.
 * norge.no er ikke HSTS-preloadet, så en redaktør som skrev adressen uten
 * https kunne sende passordet i klartekst.
 */
const HSTS = "max-age=31536000";

/**
 * SVG kan inneholde skript, og Umbraco renser ikke opplastede SVG-er. Åpnet
 * direkte på cms.ki.norge.no kjører skriptet på backoffice-opphavet, med
 * innloggingen til den som klikket. I et <img> kjører skript uansett ikke, så
 * dette endrer ikke hvordan bildene vises på nettstedet.
 */
const SVG_CSP = "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

export default {
  async fetch(request, env, ctx) {
    const targetBase = env.ORIGIN;
    const url = new URL(request.url);

    if (url.protocol === "http:" && !LOCAL_HOSTS.has(url.hostname)) {
      url.protocol = "https:";
      return Response.redirect(url.toString(), 301);
    }

    // CMS-et er headless og har ingenting på rot; send folk til backoffice.
    if (url.pathname === "/") {
      return Response.redirect(`${url.origin}/umbraco`, 302);
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

    // Backoffice bruker websocket. En kopi av svaret mister den.
    if (response.webSocket) return response;

    const proxied = new Response(response.body, response);
    proxied.headers.set("Strict-Transport-Security", HSTS);

    // Kun media, og kun når origin ikke selv har sagt noe. Backoffice og
    // Delivery API skal ikke caches i nettleseren.
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
