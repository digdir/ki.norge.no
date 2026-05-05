import { defineMiddleware } from 'astro:middleware';
import { env } from 'cloudflare:workers';

/**
 * Edge caching middleware.
 *
 * Normal requests get Cache-Control headers so Cloudflare CDN caches them
 * at the edge. After the first visit, subsequent requests are served from
 * cache (~20ms) without invoking the Worker or hitting Umbraco.
 *
 * Preview requests (HMAC-signed query param, or cookie) bypass the cache
 * entirely so editors always see fresh draft content.
 *
 * Cache invalidation: Umbraco publishes trigger a Cloudflare cache purge
 * via webhook, so the next visitor gets a fresh render.
 */

const CACHE_MAX_AGE = 60 * 60; // 1 hour edge cache
const STALE_WHILE_REVALIDATE = 60 * 60 * 24; // serve stale for up to 24h while revalidating
const PREVIEW_COOKIE_MAX_AGE = 60 * 10; // 10 minutes

const LAUNCH_MODE = env.LAUNCH_MODE || '';

function base64UrlEncode(bytes: Uint8Array): string {
  let str = '';
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

async function verifyPreviewSignature(
  secret: string,
  path: string,
  expSeconds: number,
  sig: string,
): Promise<boolean> {
  if (!secret || !sig || !Number.isFinite(expSeconds)) return false;
  if (Date.now() / 1000 > expSeconds) return false;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    enc.encode(`${path}|${expSeconds}`),
  );
  const expected = base64UrlEncode(new Uint8Array(signature));
  return constantTimeEqual(expected, sig);
}

const COMING_SOON_HTML = `<!doctype html>
<html lang="nb">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>KI Norge</title>
  <meta name="robots" content="noindex" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <style>
    * { margin: 0; box-sizing: border-box; }
    body { min-height: 100vh; display: flex; align-items: center; justify-content: center; font-family: 'Inter', system-ui, sans-serif; background: #f8fafc; color: #1e293b; }
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

export const onRequest = defineMiddleware(async (context, next) => {
  const { url, cookies } = context;

  // Admin access (status page, coming-soon bypass).
  // Visit /admin-tilgang?key=<ADMIN_SECRET> to set the ki_admin cookie.
  const adminSecret = env.ADMIN_SECRET || '';
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

  // Status page requires admin cookie
  if (url.pathname === '/status' && !cookies.has('ki_admin')) {
    return new Response('Ikke autorisert. Trenger ki_admin-cookie. Bruk /admin-tilgang?key=<secret>', {
      status: 401,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  // Coming-soon wall for ki.norge.no only.
  // The Azure URL remains open. Admin cookie bypasses.
  // Remove this block entirely when ready to launch.
  const isKiNorgeDomain = url.hostname === 'ki.norge.no';
  const isComingSoon = isKiNorgeDomain || LAUNCH_MODE === 'coming-soon';

  if (isComingSoon) {
    const isApiRoute = url.pathname.startsWith('/api/');
    const hasAdminCookie = cookies.has('ki_admin');

    if (!isApiRoute && !hasAdminCookie) {
      return new Response(COMING_SOON_HTML, {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
      });
    }
  }

  const previewSecret = env.PREVIEW_SECRET || '';
  const previewParam = url.searchParams.get('preview');
  const expParam = url.searchParams.get('exp');
  const sigParam = url.searchParams.get('sig');
  const hasPreviewQuery = previewParam !== null;

  let hasValidPreviewQuery = false;
  if (hasPreviewQuery && expParam !== null && sigParam !== null) {
    const expNum = Number.parseInt(expParam, 10);
    hasValidPreviewQuery = await verifyPreviewSignature(
      previewSecret,
      url.pathname,
      expNum,
      sigParam,
    );
  }
  const hasFailedPreviewQuery = hasPreviewQuery && !hasValidPreviewQuery;
  const hasPreviewCookie = cookies.has('preview');
  const isPreview = hasValidPreviewQuery || hasPreviewCookie;
  const isApiRoute = url.pathname.startsWith('/api/');
  const isAdminRoute = url.pathname === '/status' || url.pathname === '/admin-tilgang';

  if (hasValidPreviewQuery) {
    cookies.set('preview', '1', {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: url.protocol === 'https:',
      maxAge: PREVIEW_COOKIE_MAX_AGE,
    });
  }

  const response = await next();

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
  if (!response.headers.has('Referrer-Policy')) {
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  }
  if (!response.headers.has('Permissions-Policy')) {
    response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  }
  if (!response.headers.has('Strict-Transport-Security')) {
    // 1 year, include subdomains, preload-eligible. AKS ingress terminates TLS upstream.
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  if (!response.headers.has('Content-Security-Policy')) {
    // Loose CSP — allows inline styles (Astro), Google Fonts, and same-origin scripts.
    // Tighten by removing 'unsafe-inline' from style-src once Astro can be configured to nonce.
    response.headers.set(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com data:",
        "img-src 'self' data: https://cms.ki.norge.no https://cms.test-ki.norge.no",
        "connect-src 'self' https://cms.ki.norge.no https://cms.test-ki.norge.no",
        // Allow CMS to embed the frontend in the preview iframe. Both the prod CMS
        // origin and the localhost CMS dev origin are listed so preview works in dev too.
        "frame-ancestors 'self' https://cms.ki.norge.no https://cms.test-ki.norge.no http://localhost:5000 https://localhost:44391",
        "base-uri 'self'",
        "form-action 'self'",
      ].join('; '),
    );
  }

  // Don't cache preview (or failed preview attempts), API, or admin routes
  if (isPreview || hasFailedPreviewQuery || isApiRoute || isAdminRoute) {
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  }

  // Cache everything else at the edge
  response.headers.set(
    'Cache-Control',
    `public, s-maxage=${CACHE_MAX_AGE}, stale-while-revalidate=${STALE_WHILE_REVALIDATE}`,
  );

  return response;
});
