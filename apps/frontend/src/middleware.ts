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
 * The cache itself lives in the cache worker in front (apps/cache-kinorgeportal),
 * which caches according to the Cache-Control set here. The CMS purges on its own
 * when publishing (apps/cms-umbraco/CachePurge/), and a frontend deploy purges with
 * scripts/purge-cache.mjs.
 *
 * Browser revalidation: HTML uses s-maxage (shared/edge cache) but max-age=0,
 * must-revalidate for the browser. Without this the browser served cached HTML
 * stale for up to 24h (stale-while-revalidate), and that HTML pointed to
 * fingerprint-hashed _astro/*.css from an older build. A frontend deploy
 * rotates the CSS hash and deletes the old file, so stale HTML gave a 404 on the CSS
 * and an unstyled page. The browser must therefore always revalidate HTML against the edge,
 * which has the current asset hashes.
 */

const CACHE_MAX_AGE = 60 * 10; // 10 minutes edge cache (s-maxage)

// /health is a machine endpoint like /api/*, even though the address matches
// info.altinn.no/health. It must never be cached or treated as a page.
const isMachineRoute = (pathname: string) => pathname.startsWith('/api/') || pathname === '/health';

// Must match HeadlessPreview:PreviewSecret in the CMS, which adds it to
// its preview links. If it is empty or too weak, preview is
// turned off for everyone. See USABLE_SECRET in lib/preview.ts.
const PREVIEW_SECRET = process.env.PREVIEW_SECRET || import.meta.env.PREVIEW_SECRET || '';

/**
 * Markdown for agents, in two forms.
 *
 * `/veiledning.md` is the reliable one: its own URL, its own cache key, cacheable like
 * everything else.
 *
 * `Accept: text/markdown` on the regular URL is an extra, and it is only
 * best effort. Cloudflare ignores Vary on anything other than Accept-Encoding, so
 * if the HTML is already in the edge cache it is served without the Worker running
 * at all, and the agent gets HTML. That is why markdown from this path is marked
 * no-store: without it an agent hitting a cold cache would have put markdown in
 * it, and every browser afterwards would have got raw markdown instead of the page.
 * Measured on tt02 before it was fixed.
 */
async function toMarkdownResponse(
  response: Response,
  requestUrl: URL,
  { cacheable }: { cacheable: boolean },
): Promise<Response> {
  if (response.status !== 200) return response;
  if (!response.headers.get('Content-Type')?.startsWith('text/html')) return response;

  // Same rule as sitemap and llms.txt: when read from the workers.dev host, the
  // links in the markdown should point to the canonical domain.
  const base = isProdHost(requestUrl.hostname) ? CANONICAL_SITE_URL : requestUrl.origin;

  try {
    const page = htmlToMarkdown(await response.clone().text(), base);
    if (!page) return response;

    const markdown = new Response(page.markdown, {
      status: 200,
      headers: response.headers,
    });
    markdown.headers.set('Content-Type', 'text/markdown; charset=utf-8');
    // Inherited from the HTML response and no longer valid for this body.
    markdown.headers.delete('Content-Length');
    markdown.headers.delete('Content-Encoding');
    if (!cacheable) markdown.headers.set('Cache-Control', 'private, no-store');
    return markdown;
  } catch (error) {
    console.error('[markdown] conversion failed', error);
    return response;
  }
}

export const onRequest = defineMiddleware(async (context, next) => {
  const { url, cookies } = context;

  // The only place preview is decided. Pages read the answer from locals, so
  // none of them can end up trusting ?preview on their own again.
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
  // /.well-known/ are machine endpoints with their own routes, not pages. Without this
  // the .md rewrite hijacked /.well-known/agent-skills/<name>/SKILL.md, which is a
  // real route and not the markdown variant of any page.
  const isWellKnown = url.pathname.startsWith('/.well-known/');
  const isPage = !isApiRoute && !isWellKnown && isReadRequest;

  // `/veiledning.md` renders the regular page and delivers it as markdown. Its own
  // URL gives its own cache key, and that is what makes this path reliable.
  const markdownRoute = isPage ? pathFromMarkdownPath(url.pathname) : null;

  let response = markdownRoute ? await next(markdownRoute) : await next();

  const isHtml = response.headers.get('Content-Type')?.startsWith('text/html') ?? false;
  const wantsMarkdownByAccept =
    isPage && !markdownRoute && isHtml && prefersMarkdown(context.request.headers.get('Accept'));

  if (markdownRoute || wantsMarkdownByAccept) {
    response = await toMarkdownResponse(response, url, { cacheable: Boolean(markdownRoute) });

    // No markdown out means the page had no main content to convert.
    // On the .md route there is then no variant, and HTML would be the wrong answer there.
    if (markdownRoute && !response.headers.get('Content-Type')?.startsWith('text/markdown')) {
      response = new Response('Ingen markdown-variant for denne siden.', {
        status: 404,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }
  } else if (isPage && isHtml) {
    // Vary is correct HTTP, and browser caches and proxies respect it.
    // Cloudflare does not, and that is why the .md route exists.
    response.headers.append('Vary', 'Accept');
    // Only on pages that actually exist. Without the status check the 404 page promised a
    // markdown variant of everything requested, like /openapi.json.md.
    if (response.status === 200) {
      response.headers.append(
        'Link',
        `<${markdownPathFor(url.pathname)}>; rel="alternate"; type="text/markdown"`,
      );
    }
  }

  // ── Security headers (apply to all responses) ──
  // Defends against clickjacking, MIME sniffing, leaking referrer to other origins,
  // and protocol downgrade. The CSP lives in lib/csp.ts.
  if (!response.headers.has('X-Content-Type-Options')) {
    response.headers.set('X-Content-Type-Options', 'nosniff');
  }
  // Content-Signal says what the content may be used for. Moved here from robots.txt
  // because the directive does not exist in the robots.txt specification, and validators
  // therefore rejected the WHOLE robots.txt as invalid. Only the prod hosts signal:
  // the test environments already answer Disallow: / and have nothing to signal about.
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
  // Pages already have the CSP from Astro, with hashes for the inline scripts. An empty
  // 404 or 500 response is replaced by Astro with the error page, and then the headers from here
  // win over the error page's own. The fallback policy there would have blocked the scripts on the 404 page.
  if (response.body !== null && !response.headers.has('Content-Security-Policy')) {
    response.headers.set('Content-Security-Policy', import.meta.env.DEV ? DEV_CSP : FALLBACK_CSP);
  }

  // Don't cache preview or API routes, or pages that have asked
  // not to be cached. A page sets `no-store` in its own catch when the CMS fetch
  // failed, so a degraded render (missing hero/content) is never cached at
  // the edge and served to everyone. Without this a transient CMS blip would be
  // caught in the edge cache for up to s-maxage and shown to all visitors.
  const pageOptedOutOfCache = response.headers.get('Cache-Control')?.includes('no-store');
  if (bypassesCache(url, isPreview) || isApiRoute || pageOptedOutOfCache) {
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  }

  // Cache everything else at the edge (s-maxage), but force the browser to
  // revalidate every navigation (max-age=0, must-revalidate). That prevents
  // the browser from serving stale HTML that points to _astro asset hashes a later
  // deploy has deleted -> 404 on CSS/JS -> unstyled page.
  response.headers.set(
    'Cache-Control',
    `public, s-maxage=${CACHE_MAX_AGE}, max-age=0, must-revalidate`,
  );

  return response;
});
