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

export default {
  async fetch(request, env, ctx) {
    const targetBase = env.ORIGIN;
    const url = new URL(request.url);

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

    // Kun media, og kun når origin ikke selv har sagt noe. Backoffice og
    // Delivery API skal ikke caches i nettleseren.
    if (
      url.pathname.startsWith("/media/") &&
      response.ok &&
      !response.headers.has("Cache-Control")
    ) {
      const cached = new Response(response.body, response);
      cached.headers.set("Cache-Control", MEDIA_CACHE_CONTROL);
      return cached;
    }

    return response;
  },
} satisfies ExportedHandler<Env>;
