// Media from Umbraco (/media/...) is served through the frontend, so images are
// fetched from the portal address (ki.norge.no/media/...) and not from a CMS host.
// The page HTML uses relative /media URLs, and this route fetches them from
// UMBRACO_URL server side. See issue #962.

/** True for paths this proxy answers. The middleware uses the same test. */
export const isMediaPath = (pathname: string) => pathname.startsWith('/media/');

/**
 * Umbraco sets no Cache-Control on media files. One week, not immutable: Umbraco
 * stores media under unique key folders, so a replaced image normally gets a new
 * path, but a path is not promised to never be reused. Same value as the CMS proxy
 * worker (apps/cms-kinorgeportal).
 */
export const MEDIA_CACHE_CONTROL = 'public, max-age=604800';

// An SVG opened directly runs as a document on our origin. This keeps scripts in it from running.
export const SVG_CSP = "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox";

const NO_STORE = 'private, no-store';

// Headers from the CMS that the browser needs. Everything else (cookies, server
// headers, the CMS's own security headers) stays behind.
const PASS_THROUGH = ['Content-Type', 'Content-Length', 'ETag', 'Last-Modified', 'Content-Disposition'];

/**
 * Only plain /media/ paths reach the CMS. An encoded slash, backslash or dot segment
 * could otherwise be decoded by the CMS into a path outside /media (the Delivery API,
 * the backoffice).
 */
function isSafeMediaPath(pathname: string): boolean {
  if (!isMediaPath(pathname)) return false;
  if (/%2f|%5c|%2e|\\/i.test(pathname)) return false;
  return !pathname.split('/').some((segment) => segment === '.' || segment === '..');
}

function plain(status: number, text: string): Response {
  return new Response(text, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': NO_STORE },
  });
}

export async function proxyMedia(
  request: Request,
  umbracoUrl: string,
  fetchFn: typeof fetch = fetch,
): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD', 'Cache-Control': NO_STORE } });
  }

  const url = new URL(request.url);
  if (!isSafeMediaPath(url.pathname)) return plain(404, 'Not found');

  const target = `${umbracoUrl.replace(/\/$/, '')}${url.pathname}${url.search}`;

  let upstream: Response;
  try {
    // Called as a plain function: as a method, Workers throws "Illegal invocation".
    const f = fetchFn;
    upstream = await f(target, { method: request.method, headers: { Accept: request.headers.get('Accept') ?? '*/*' } });
  } catch (error) {
    console.error('Media fetch from CMS failed', target, error);
    return plain(502, 'Bad gateway');
  }

  // A miss or a CMS error must not be stored at the edge, or a short blip would
  // stick for everyone. The body from the CMS (an error page) is not passed on.
  if (!upstream.ok) {
    await upstream.body?.cancel();
    return plain(upstream.status === 404 ? 404 : 502, upstream.status === 404 ? 'Not found' : 'Bad gateway');
  }

  const headers = new Headers();
  for (const name of PASS_THROUGH) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set('Cache-Control', upstream.headers.get('Cache-Control') ?? MEDIA_CACHE_CONTROL);
  headers.set('X-Content-Type-Options', 'nosniff');
  if (headers.get('Content-Type')?.startsWith('image/svg+xml')) {
    headers.set('Content-Security-Policy', SVG_CSP);
  }

  return new Response(request.method === 'HEAD' ? null : upstream.body, { status: upstream.status, headers });
}
