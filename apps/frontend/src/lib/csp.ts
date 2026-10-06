// Felles for astro.config.mjs og middleware. Sider får CSP-en fra Astro, med
// hasher for inline-skriptene i bygget. Middleware setter den samme policyen,
// uten hasher, på svar som ikke har fått den fra Astro.

const CMS_ORIGINS = [
  'https://kinorgeportal.prod.dis-core.altinn.cloud',
  'https://kinorgeportal.tt02.dis-core.altinn.cloud',
  'https://cms-kinorgeportal-prod.digitaliseringsdirektoratet.workers.dev',
  'https://cms-kinorgeportal-tt02.digitaliseringsdirektoratet.workers.dev',
  'https://cms.ki.norge.no',
];

// challenges.cloudflare.com er Turnstile på «Del KI-tiltak». Widgeten laster et
// skript og rendrer seg selv i en iframe, så den trenger både script-src og frame-src.
export const SCRIPT_SOURCES = [
  "'self'",
  'https://survey.skyra.no',
  'https://siteimproveanalytics.com',
  'https://challenges.cloudflare.com',
];

// Skript som må kjøre før første tegning og derfor ikke kan bundles av Astro.
// Astro hasher ikke is:inline, så astro.config.mjs hasher disse filene.
export const INLINE_SCRIPT_FILES = ['src/components/shared/cookie-notice.inline.js'];

// 'unsafe-inline' fordi Astro inliner kritisk CSS og komponentene bruker style-attributter.
export const STYLE_SOURCES = ["'self'", "'unsafe-inline'", 'https://altinncdn.no', 'https://survey.skyra.no'];

export const OTHER_DIRECTIVES = [
  "default-src 'self'",
  "font-src 'self' https://altinncdn.no data:",
  // Siteimprove sender sidevisnings-beacon som bilde (image.aspx), derfor img-src.
  `img-src 'self' data: ${CMS_ORIGINS.join(' ')} https://survey.skyra.no https://*.siteimproveanalytics.io`,
  `connect-src 'self' ${CMS_ORIGINS.join(' ')} https://survey.skyra.no https://*.skyra.no https://*.siteimproveanalytics.io`,
  // CMS-et viser frontenden i forhåndsvisnings-iframen. Derfor ingen X-Frame-Options.
  // cms.ki.test.norge.no manglet da backoffice flyttet dit i #481, og forhåndsvisning
  // i tt02 ble blokkert («refused to connect»).
  "frame-ancestors 'self' https://cms.ki.norge.no https://cms.ki.test.norge.no https://cms-kinorgeportal-prod.digitaliseringsdirektoratet.workers.dev https://cms-kinorgeportal-tt02.digitaliseringsdirektoratet.workers.dev https://kinorgeportal.prod.dis-core.altinn.cloud https://kinorgeportal.tt02.dis-core.altinn.cloud http://localhost:5000 https://localhost:44391",
  // Uten en egen frame-src faller Turnstile-iframen tilbake på default-src og blir blokkert.
  "frame-src 'self' https://challenges.cloudflare.com",
  "base-uri 'self'",
  "form-action 'self'",
] as const;

const policy = (scriptSources: string[]) =>
  [...OTHER_DIRECTIVES, `script-src ${scriptSources.join(' ')}`, `style-src ${STYLE_SOURCES.join(' ')}`].join('; ');

export const FALLBACK_CSP = policy(SCRIPT_SOURCES);

// Astro setter ikke CSP i dev, og Vite legger inn egne inline-skript der.
export const DEV_CSP = policy([...SCRIPT_SOURCES, "'unsafe-inline'"]);
