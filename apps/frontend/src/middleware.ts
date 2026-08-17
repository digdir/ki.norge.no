import { defineMiddleware } from 'astro:middleware';
import {
  htmlToMarkdown,
  prefersMarkdown,
  markdownPathFor,
  pathFromMarkdownPath,
} from './lib/html-to-markdown';
import { isProdHost, CANONICAL_SITE_URL } from './lib/prod-hosts';
import { CONTENT_SIGNAL } from './lib/robots';

/**
 * Edge caching middleware.
 *
 * Normal requests get Cache-Control headers so Cloudflare CDN caches them
 * at the edge. After the first visit, subsequent requests are served from
 * cache (~20ms) without invoking the Worker or hitting Umbraco.
 *
 * Preview requests (cookie or query param) bypass the cache entirely so
 * editors always see fresh draft content.
 *
 * Cache invalidation: Umbraco publishes trigger a Cloudflare cache purge
 * via webhook, so the next visitor gets a fresh render.
 *
 * Browser revalidation: HTML bruker s-maxage (delt/edge-cache) men max-age=0,
 * must-revalidate for nettleseren. Uten dette serverte nettleseren cachet HTML
 * stale i opptil 24t (stale-while-revalidate), og den HTML-en pekte på
 * fingeravtrykk-hashede _astro/*.css fra en eldre build. En frontend-deploy
 * roterer CSS-hashen og sletter den gamle fila, så stale HTML ga 404 på CSS-en
 * og en ustylet side. Nettleseren må derfor alltid revalidere HTML mot edgen,
 * som har gjeldende asset-hasher.
 */

const CACHE_MAX_AGE = 60 * 10; // 10 minutes edge cache (s-maxage)

// Public hostnames that sit behind the holding page until launch. The
// *.workers.dev preview URLs and localhost are intentionally NOT listed, so
// CMS preview and editor access stay open without a key.
const GATED_HOSTS = new Set(['ki.norge.no', 'ki.test.norge.no']);

// Ruter som krever ki_admin-cookie. Statussiden og API-et den henter fra hører
// sammen: beskytter du bare siden, ligger dataene fortsatt åpne på API-ruta.
const ADMIN_ONLY_PATHS = new Set(['/status', '/api/status-checks']);

// Launch switch. Gated hosts show the holding page UNLESS LAUNCH_MODE is "live".
// Fail-safe: any other value (or unset) keeps them gated, so a misconfigured
// deploy can never accidentally expose the site.
// To go live: set LAUNCH_MODE=live for that env in wrangler.jsonc and deploy.
const LAUNCH_MODE = process.env.LAUNCH_MODE || import.meta.env.LAUNCH_MODE || '';

// Branding-/delingsassets som alltid skal kunne hentes, selv mens hosten er
// gated. Slik kan lenkeforhandsvisninger (og:image) og favicon hentes for
// lansering uten a eksponere sideinnhold. Kun statiske merkevarefiler her,
// ikke JS-bundles eller sider.
const PUBLIC_ASSET_PATHS = new Set([
  '/og-image.png',
  '/og-image.svg',
  '/favicon.ico',
  '/manifest.webmanifest',
]);

// Ikonvariantene ligger samlet under /favicon/. Prefiks framfor å liste hver
// enkelt størrelse, så en ny variant ikke blir gated ved et uhell.
const PUBLIC_ASSET_PREFIXES = ['/favicon/'];

const COMING_SOON_HTML = `<!doctype html>
<html lang="no">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>KI Norge</title>
  <meta name="robots" content="noindex" />
  <style>
    /* Systemfont. Denne siden er noindex og står alene uten bundlet CSS, så den
       skal ikke dra inn en fontfil. Hentet Inter fra Google fram til nå. */
    * { margin: 0; box-sizing: border-box; }
    body { min-height: 100vh; display: flex; align-items: center; justify-content: center; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: var(--ds-color-background-default); color: #1e293b; }
    .card { text-align: center; padding: 3rem 2rem; max-width: 600px; }
    h1 { font-size: 2rem; font-weight: 600; margin-bottom: 1rem; }
    p { font-size: 1.1rem; line-height: 1.6; color: #475569; }
  </style>
</head>
<body>
  <div class="card">
    <h1>KI Norge</h1>
  </div>
</body>
</html>`;

/**
 * Markdown for agenter, i to former.
 *
 * `/veiledning.md` er den pålitelige: egen URL, egen cache-nøkkel, cachebar som
 * alt annet.
 *
 * `Accept: text/markdown` på den vanlige URL-en er et tillegg, og det er kun
 * best effort. Cloudflare bryr seg ikke om Vary på annet enn Accept-Encoding, så
 * ligger HTML-en allerede i edge-cachen blir den servert uten at Workeren kjører
 * i det hele tatt, og agenten får HTML. Derfor markeres markdown fra denne veien
 * som no-store: uten det ville en agent som traff en kald cache lagt markdown i
 * den, og alle nettleserne etterpå hadde fått rå markdown i stedet for siden.
 * Målt på tt02 før det ble fikset.
 */
async function toMarkdownResponse(
  response: Response,
  requestUrl: URL,
  { cacheable }: { cacheable: boolean },
): Promise<Response> {
  if (response.status !== 200) return response;
  if (!response.headers.get('Content-Type')?.startsWith('text/html')) return response;

  // Samme regel som sitemap og llms.txt: lest fra workers.dev-hosten skal
  // lenkene i markdownen peke på det kanoniske domenet.
  const base = isProdHost(requestUrl.hostname) ? CANONICAL_SITE_URL : requestUrl.origin;

  try {
    const page = htmlToMarkdown(await response.clone().text(), base);
    if (!page) return response;

    const markdown = new Response(page.markdown, {
      status: 200,
      headers: response.headers,
    });
    markdown.headers.set('Content-Type', 'text/markdown; charset=utf-8');
    // Arvet fra HTML-svaret og gjelder ikke lenger for denne kroppen.
    markdown.headers.delete('Content-Length');
    markdown.headers.delete('Content-Encoding');
    if (!cacheable) markdown.headers.set('Cache-Control', 'private, no-store');
    return markdown;
  } catch (error) {
    console.error('[markdown] konvertering feilet', error);
    return response;
  }
}

export const onRequest = defineMiddleware(async (context, next) => {
  const { url, cookies } = context;

  // Admin access (status page, coming-soon bypass).
  // Visit /admin-tilgang?key=<ADMIN_SECRET> to set the ki_admin cookie.
  const adminSecret = process.env.ADMIN_SECRET || import.meta.env.ADMIN_SECRET || '';
  if (url.pathname === '/admin-tilgang') {
    const key = url.searchParams.get('key');
    if (key && adminSecret && key === adminSecret) {
      const res = new Response('Tilgang gitt! Du blir videresendt...', {
        status: 302,
        headers: { 'Location': '/status', 'Cache-Control': 'no-store' },
      });
      res.headers.append('Set-Cookie', `ki_admin=1; Path=/; Max-Age=${60 * 60 * 24 * 30}; SameSite=Lax; HttpOnly`);
      return res;
    }
    return new Response('Ugyldig nøkkel', { status: 401 });
  }

  // Statussiden og datakilden bak den krever admin-cookie. /api/status-checks
  // sto utenfor og var offentlig lesbar på prod, selv om ruta selv dokumenterte
  // at middlewaren beskyttet den. Den svarer med interne vertsnavn i dis-core.
  if (ADMIN_ONLY_PATHS.has(url.pathname) && !cookies.has('ki_admin')) {
    return new Response('Ikke autorisert. Trenger ki_admin-cookie. Bruk /admin-tilgang?key=<secret>', {
      status: 401,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  // Holding-page wall for the public domains (GATED_HOSTS). The admin cookie
  // (see /admin-tilgang) bypasses it; workers.dev and localhost are never gated,
  // so CMS preview stays open. Flip LAUNCH_MODE to "live" and deploy to launch.
  const isComingSoon = LAUNCH_MODE !== 'live' && GATED_HOSTS.has(url.hostname);

  if (isComingSoon) {
    const isApiRoute = url.pathname.startsWith('/api/');
    const hasAdminCookie = cookies.has('ki_admin');
    const isPublicAsset =
      PUBLIC_ASSET_PATHS.has(url.pathname) ||
      PUBLIC_ASSET_PREFIXES.some((prefix) => url.pathname.startsWith(prefix));

    if (!isApiRoute && !hasAdminCookie && !isPublicAsset) {
      return new Response(COMING_SOON_HTML, {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
      });
    }
  }

  const isPreview =
    url.searchParams.has('preview') || cookies.has('preview');
  const isApiRoute = url.pathname.startsWith('/api/');
  const isAdminRoute = ADMIN_ONLY_PATHS.has(url.pathname) || url.pathname === '/admin-tilgang';

  const isReadRequest = context.request.method === 'GET' || context.request.method === 'HEAD';
  // /.well-known/ er maskin-endepunkter med egne ruter, ikke sider. Uten dette
  // kapret .md-omskrivingen /.well-known/agent-skills/<navn>/SKILL.md, som er en
  // ekte rute og ikke markdown-varianten av noen side.
  const isWellKnown = url.pathname.startsWith('/.well-known/');
  const isPage = !isApiRoute && !isAdminRoute && !isWellKnown && isReadRequest;

  // `/veiledning.md` rendrer den vanlige siden og leverer den som markdown. Egen
  // URL gir egen cache-nøkkel, og det er det som gjør denne veien pålitelig.
  const markdownRoute = isPage ? pathFromMarkdownPath(url.pathname) : null;

  let response = markdownRoute ? await next(markdownRoute) : await next();

  const isHtml = response.headers.get('Content-Type')?.startsWith('text/html') ?? false;
  const wantsMarkdownByAccept =
    isPage && !markdownRoute && isHtml && prefersMarkdown(context.request.headers.get('Accept'));

  if (markdownRoute || wantsMarkdownByAccept) {
    response = await toMarkdownResponse(response, url, { cacheable: Boolean(markdownRoute) });

    // Ingen markdown ut betyr at siden ikke hadde hovedinnhold å konvertere.
    // På .md-ruta finnes da ingen variant, og HTML ville vært feil svar der.
    if (markdownRoute && !response.headers.get('Content-Type')?.startsWith('text/markdown')) {
      response = new Response('Ingen markdown-variant for denne siden.', {
        status: 404,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }
  } else if (isPage && isHtml) {
    // Vary er korrekt HTTP, og nettlesercacher og proxyer respekterer det.
    // Cloudflare gjør det ikke, og det er derfor .md-ruta finnes.
    response.headers.append('Vary', 'Accept');
    // Kun på sider som faktisk finnes. Uten statussjekken lovet 404-siden en
    // markdown-variant av alt som ble spurt etter, som /openapi.json.md.
    if (response.status === 200) {
      response.headers.append(
        'Link',
        `<${markdownPathFor(url.pathname)}>; rel="alternate"; type="text/markdown"`,
      );
    }
  }

  // ── Security headers (apply to all responses) ──
  // Defends against clickjacking, MIME sniffing, leaking referrer to other origins,
  // and protocol downgrade. CSP is intentionally loose for now (allows inline styles
  // because Astro inlines critical CSS, and Google Fonts is allowed); tighten later.
  // X-Frame-Options is intentionally NOT set globally — it would block the CMS preview
  // iframe on /umbraco/section/content/.../preview from embedding the frontend. CSP
  // frame-ancestors below is the modern replacement and lets the CMS embed us.
  if (!response.headers.has('X-Content-Type-Options')) {
    response.headers.set('X-Content-Type-Options', 'nosniff');
  }
  // Content-Signal sier hva innholdet kan brukes til. Lag fra robots.txt hit
  // fordi direktivet ikke finnes i robots.txt-spesifikasjonen, og validatorer
  // derfor forkastet HELE robots.txt som ugyldig. Kun prod-hostene signaliserer:
  // testmiljoene svarer allerede Disallow: / og har ingenting a signalisere om.
  if (isProdHost(url.hostname) && !response.headers.has('Content-Signal')) {
    response.headers.set('Content-Signal', CONTENT_SIGNAL);
  }
  if (!response.headers.has('Referrer-Policy')) {
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  }
  if (!response.headers.has('Permissions-Policy')) {
    response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  }
  if (!response.headers.has('Strict-Transport-Security')) {
    // 1 year, include subdomains, preload-eligible. Cloudflare terminates TLS at the edge.
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  if (!response.headers.has('Content-Security-Policy')) {
    // Loose CSP — allows inline styles (Astro) and same-origin scripts.
    // Tighten by removing 'unsafe-inline' from style-src once Astro can be configured to nonce.
    // Google Fonts er fjernet fra style-src og font-src fordi fontene na er selvhostet.
    response.headers.set(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' https://survey.skyra.no https://siteimproveanalytics.com",
        "style-src 'self' 'unsafe-inline' https://altinncdn.no https://survey.skyra.no",
        "font-src 'self' https://altinncdn.no data:",
        // CMS-hoster (union av alle reelle origins). Frontend henter media fra CMS,
        // sa img-src/connect-src ma tillate dem ellers blokkeres bildene. Den dode
        // Container Apps-hosten er fjernet.
        // Siteimprove sender sidevisnings-beacon som bilde (image.aspx), derfor img-src.
        "img-src 'self' data: https://kinorgeportal.prod.dis-core.altinn.cloud https://kinorgeportal.tt02.dis-core.altinn.cloud https://cms-kinorgeportal-prod.digitaliseringsdirektoratet.workers.dev https://cms-kinorgeportal-tt02.digitaliseringsdirektoratet.workers.dev https://cms.ki.norge.no https://survey.skyra.no https://*.siteimproveanalytics.io",
        "connect-src 'self' https://kinorgeportal.prod.dis-core.altinn.cloud https://kinorgeportal.tt02.dis-core.altinn.cloud https://cms-kinorgeportal-prod.digitaliseringsdirektoratet.workers.dev https://cms-kinorgeportal-tt02.digitaliseringsdirektoratet.workers.dev https://cms.ki.norge.no https://survey.skyra.no https://*.skyra.no https://*.siteimproveanalytics.io",
        // Allow CMS to embed the frontend in the preview iframe. Prod og tt02 CMS
        // (dis-core + workers.dev) pluss localhost CMS dev-origin slik at preview
        // virker i dev ogsa.
        "frame-ancestors 'self' https://cms.ki.norge.no https://cms-kinorgeportal-prod.digitaliseringsdirektoratet.workers.dev https://cms-kinorgeportal-tt02.digitaliseringsdirektoratet.workers.dev https://kinorgeportal.prod.dis-core.altinn.cloud https://kinorgeportal.tt02.dis-core.altinn.cloud http://localhost:5000 https://localhost:44391",
        "base-uri 'self'",
        "form-action 'self'",
      ].join('; '),
    );
  }

  // Don't cache preview, API, or admin routes — eller sider som selv har bedt om
  // å ikke caches. En side setter `no-store` i sin egen catch når CMS-henting
  // feilet, slik at en degradert render (manglende hero/innhold) aldri caches på
  // edgen og serveres til alle. Uten dette ville et transient CMS-blaff bli
  // fanget i edge-cachen i opptil s-maxage og vist til alle besøkende.
  const pageOptedOutOfCache = response.headers.get('Cache-Control')?.includes('no-store');
  if (isPreview || isApiRoute || isAdminRoute || pageOptedOutOfCache) {
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  }

  // Cache everything else at the edge (s-maxage), but force the browser to
  // revalidate every navigation (max-age=0, must-revalidate). Det hindrer at
  // nettleseren serverer stale HTML som peker på _astro-asset-hasher en senere
  // deploy har slettet -> 404 på CSS/JS -> ustylet side.
  response.headers.set(
    'Cache-Control',
    `public, s-maxage=${CACHE_MAX_AGE}, max-age=0, must-revalidate`,
  );

  return response;
});
