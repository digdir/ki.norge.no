import { defineMiddleware } from 'astro:middleware';

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
 */

const CACHE_MAX_AGE = 60 * 60; // 1 hour edge cache
const STALE_WHILE_REVALIDATE = 60 * 60 * 24; // serve stale for up to 24h while revalidating

const LAUNCH_MODE = process.env.LAUNCH_MODE || import.meta.env.LAUNCH_MODE || '';

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
    body { min-height: 100vh; display: flex; align-items: center; justify-content: center; font-family: 'Inter', system-ui, sans-serif; background: var(--ds-color-background-default); color: #1e293b; }
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

  const isPreview =
    url.searchParams.has('preview') || cookies.has('preview');
  const isApiRoute = url.pathname.startsWith('/api/');
  const isAdminRoute = url.pathname === '/status' || url.pathname === '/admin-tilgang';

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
    // 1 year, include subdomains, preload-eligible. Container Apps already terminates TLS.
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  if (!response.headers.has('Content-Security-Policy')) {
    // Loose CSP — allows inline styles (Astro), Google Fonts, and same-origin scripts.
    // Tighten by removing 'unsafe-inline' from style-src once Astro can be configured to nonce.
    response.headers.set(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' https://survey.skyra.no",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://altinncdn.no https://survey.skyra.no",
        "font-src 'self' https://fonts.gstatic.com https://altinncdn.no data:",
        "img-src 'self' data: https://ki-norge-cms.greentree-c9e56a64.norwayeast.azurecontainerapps.io https://cms.ki.norge.no https://survey.skyra.no",
        "connect-src 'self' https://ki-norge-cms.greentree-c9e56a64.norwayeast.azurecontainerapps.io https://cms.ki.norge.no https://survey.skyra.no https://*.skyra.no",
        // Allow CMS to embed the frontend in the preview iframe. Both the prod CMS
        // origin and the localhost CMS dev origin are listed so preview works in dev too.
        "frame-ancestors 'self' https://cms.ki.norge.no https://ki-norge-cms.greentree-c9e56a64.norwayeast.azurecontainerapps.io http://localhost:5000 https://localhost:44391",
        "base-uri 'self'",
        "form-action 'self'",
      ].join('; '),
    );
  }

  // Don't cache preview, API, or admin routes
  if (isPreview || isApiRoute || isAdminRoute) {
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
