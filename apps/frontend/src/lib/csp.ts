// Shared by astro.config.mjs and middleware. Pages get the CSP from Astro, with
// hashes for the inline scripts in the build. Middleware sets the same policy,
// without hashes, on responses that have not got it from Astro.

const CMS_ORIGINS = [
  'https://kinorgeportal.prod.dis-core.altinn.cloud',
  'https://kinorgeportal.tt02.dis-core.altinn.cloud',
  'https://cms-kinorgeportal-prod.digitaliseringsdirektoratet.workers.dev',
  'https://cms-kinorgeportal-tt02.digitaliseringsdirektoratet.workers.dev',
  'https://cms.ki.norge.no',
];

// challenges.cloudflare.com is Turnstile on "Del KI-tiltak". The widget loads a
// script and renders itself in an iframe, so it needs both script-src and frame-src.
export const SCRIPT_SOURCES = [
  "'self'",
  'https://survey.skyra.no',
  'https://siteimproveanalytics.com',
  'https://challenges.cloudflare.com',
];

// Scripts that must run before first paint and therefore cannot be bundled by Astro.
// Astro does not hash is:inline, so astro.config.mjs hashes these files.
export const INLINE_SCRIPT_FILES = ['src/components/shared/cookie-notice.inline.js'];

// 'unsafe-inline' because Astro inlines critical CSS and the components use style attributes.
export const STYLE_SOURCES = ["'self'", "'unsafe-inline'", 'https://altinncdn.no', 'https://survey.skyra.no'];

export const OTHER_DIRECTIVES = [
  "default-src 'self'",
  "font-src 'self' https://altinncdn.no data:",
  // Siteimprove sends the page view beacon as an image (image.aspx), hence img-src.
  `img-src 'self' data: ${CMS_ORIGINS.join(' ')} https://survey.skyra.no https://*.siteimproveanalytics.io`,
  `connect-src 'self' ${CMS_ORIGINS.join(' ')} https://survey.skyra.no https://*.skyra.no https://*.siteimproveanalytics.io`,
  // The CMS shows the frontend in the preview iframe. Hence no X-Frame-Options.
  // cms.ki.test.norge.no was missing when the backoffice moved there in #481, and preview
  // in tt02 was blocked ("refused to connect").
  "frame-ancestors 'self' https://cms.ki.norge.no https://cms.ki.test.norge.no https://cms-kinorgeportal-prod.digitaliseringsdirektoratet.workers.dev https://cms-kinorgeportal-tt02.digitaliseringsdirektoratet.workers.dev https://kinorgeportal.prod.dis-core.altinn.cloud https://kinorgeportal.tt02.dis-core.altinn.cloud http://localhost:5000 https://localhost:44391",
  // Without its own frame-src the Turnstile iframe falls back to default-src and gets blocked.
  "frame-src 'self' https://challenges.cloudflare.com",
  "base-uri 'self'",
  "form-action 'self'",
] as const;

const policy = (scriptSources: string[]) =>
  [...OTHER_DIRECTIVES, `script-src ${scriptSources.join(' ')}`, `style-src ${STYLE_SOURCES.join(' ')}`].join('; ');

export const FALLBACK_CSP = policy(SCRIPT_SOURCES);

// Astro does not set CSP in dev, and Vite adds its own inline scripts there.
export const DEV_CSP = policy([...SCRIPT_SOURCES, "'unsafe-inline'"]);
