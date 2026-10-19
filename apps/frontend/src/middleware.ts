import { defineMiddleware } from 'astro:middleware';
import {
  htmlToMarkdown,
  prefersMarkdown,
  markdownPathFor,
  pathFromMarkdownPath,
} from './lib/html-to-markdown';
import { isProdHost, CANONICAL_SITE_URL } from './lib/prod-hosts';
import { CONTENT_SIGNAL } from './lib/robots';
import { DEV_CSP, FALLBACK_CSP } from './lib/csp';
import { PREVIEW_COOKIE, bypassesCache, previewCookieOptions, resolvePreview, withoutSecret } from './lib/preview';

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
 * Selve cachen ligger i cache-workeren foran (apps/cache-kinorgeportal), som
 * cacher etter Cache-Control herfra. CMS-et purger selv ved publisering
 * (apps/cms-umbraco/CachePurge/), og en frontend-deploy purger med
 * scripts/purge-cache.mjs.
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

// /health er et maskin-endepunkt som /api/*, selv om adressen er lik
// info.altinn.no/health. Den skal aldri caches eller behandles som en side.
const isMachineRoute = (pathname: string) => pathname.startsWith('/api/') || pathname === '/health';

// Må matche HeadlessPreview:PreviewSecret i CMS-et, som legger den på
// forhåndsvisningslenkene sine. Er den tom eller for svak, er forhåndsvisning
// avslått for alle. Se USABLE_SECRET i lib/preview.ts.
const PREVIEW_SECRET = process.env.PREVIEW_SECRET || import.meta.env.PREVIEW_SECRET || '';

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

  // Eneste stedet forhåndsvisning avgjøres. Sidene leser svaret fra locals, så
  // ingen av dem kan komme til å stole på ?preview på egen hånd igjen.
  const { isPreview, shouldSetCookie } = resolvePreview({
    secretParam: url.searchParams.get('secret'),
    cookieValue: cookies.get(PREVIEW_COOKIE)?.value,
    configuredSecret: PREVIEW_SECRET,
  });
  context.locals.isPreview = isPreview;
  if (shouldSetCookie) {
    cookies.set(PREVIEW_COOKIE, PREVIEW_SECRET, previewCookieOptions());
    return new Response(null, {
      status: 302,
      headers: { Location: withoutSecret(url), 'Cache-Control': 'private, no-store' },
    });
  }

  const isApiRoute = isMachineRoute(url.pathname);

  const isReadRequest = context.request.method === 'GET' || context.request.method === 'HEAD';
  // /.well-known/ er maskin-endepunkter med egne ruter, ikke sider. Uten dette
  // kapret .md-omskrivingen /.well-known/agent-skills/<navn>/SKILL.md, som er en
  // ekte rute og ikke markdown-varianten av noen side.
  const isWellKnown = url.pathname.startsWith('/.well-known/');
  const isPage = !isApiRoute && !isWellKnown && isReadRequest;

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
  // and protocol downgrade. CSP-en står i lib/csp.ts.
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
  // Sider har allerede CSP-en fra Astro, med hasher for inline-skriptene. Et tomt
  // 404- eller 500-svar bytter Astro ut med feilsiden, og da vinner headerne herfra
  // over feilsidens egne. Reservepolicyen der ville blokkert skriptene på 404-siden.
  if (response.body !== null && !response.headers.has('Content-Security-Policy')) {
    response.headers.set('Content-Security-Policy', import.meta.env.DEV ? DEV_CSP : FALLBACK_CSP);
  }

  // Don't cache preview or API routes — eller sider som selv har bedt om
  // å ikke caches. En side setter `no-store` i sin egen catch når CMS-henting
  // feilet, slik at en degradert render (manglende hero/innhold) aldri caches på
  // edgen og serveres til alle. Uten dette ville et transient CMS-blaff bli
  // fanget i edge-cachen i opptil s-maxage og vist til alle besøkende.
  const pageOptedOutOfCache = response.headers.get('Cache-Control')?.includes('no-store');
  if (bypassesCache(url, isPreview) || isApiRoute || pageOptedOutOfCache) {
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
