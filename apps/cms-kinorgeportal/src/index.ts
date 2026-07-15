export interface Env {
  ORIGIN: string;
}

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

    return response;
  },
} satisfies ExportedHandler<Env>;
