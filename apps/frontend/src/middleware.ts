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
 *
 * Browser revalidation: HTML bruker s-maxage (delt/edge-cache) men max-age=0,
 * must-revalidate for nettleseren. Uten dette serverte nettleseren cachet HTML
 * stale i opptil 24t (stale-while-revalidate), og den HTML-en pekte på
 * fingeravtrykk-hashede _astro/*.css fra en eldre build. En frontend-deploy
 * roterer CSS-hashen og sletter den gamle fila, så stale HTML ga 404 på CSS-en
 * og en ustylet side. Nettleseren må derfor alltid revalidere HTML mot edgen,
 * som har gjeldende asset-hasher.
 */

const CACHE_MAX_AGE = 60 * 60; // 1 hour edge cache (s-maxage)

// Public hostnames that sit behind the holding page until launch. The
// *.workers.dev preview URLs and localhost are intentionally NOT listed, so
// CMS preview and editor access stay open without a key.
const GATED_HOSTS = new Set(['ki.norge.no', 'ki.test.norge.no']);

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
  '/favicon.svg',
  '/favicon.ico',
  '/manifest.webmanifest',
]);

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

  // Holding-page wall for the public domains (GATED_HOSTS). The admin cookie
  // (see /admin-tilgang) bypasses it; workers.dev and localhost are never gated,
  // so CMS preview stays open. Flip LAUNCH_MODE to "live" and deploy to launch.
  const isComingSoon = LAUNCH_MODE !== 'live' && GATED_HOSTS.has(url.hostname);

  if (isComingSoon) {
    const isApiRoute = url.pathname.startsWith('/api/');
    const hasAdminCookie = cookies.has('ki_admin');
    const isPublicAsset = PUBLIC_ASSET_PATHS.has(url.pathname);

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
    // 1 year, include subdomains, preload-eligible. Cloudflare terminates TLS at the edge.
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  if (!response.headers.has('Content-Security-Policy')) {
    // Loose CSP — allows inline styles (Astro), Google Fonts, and same-origin scripts.
    // Tighten by removing 'unsafe-inline' from style-src once Astro can be configured to nonce.
    response.headers.set(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' https://survey.skyra.no https://siteimproveanalytics.com",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://altinncdn.no https://survey.skyra.no",
        "font-src 'self' https://fonts.gstatic.com https://fonts.googleapis.com https://altinncdn.no data:",
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

  // Don't cache preview, API, or admin routes
  if (isPreview || isApiRoute || isAdminRoute) {
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
