/**
 * Avgjør om en forespørsel får se upublisert innhold.
 *
 * CMS-et legger en hemmelighet på forhåndsvisningslenkene sine
 * (`?preview=true&secret=...`, se HeadlessPreviewUrlProvider.cs), men frontend
 * sjekket den aldri. Da holdt det å skrive `?preview=true` bak en hvilken som
 * helst adresse for å lese utkast som ikke var publisert.
 *
 * Cookien bærer selve hemmeligheten, ikke et flagg. En cookie er
 * klient-kontrollert, så `preview=1` ville vært like lett å forfalske som
 * query-parameteren den erstattet.
 *
 * Uten en brukbar hemmelighet er forhåndsvisning AV. Feiler heller lukket
 * enn å la en manglende variabel åpne utkastene for alle.
 */

/** cache-kinorgeportal går rett til origin når en cookie med dette navnet er med. */
export const PREVIEW_COOKIE = 'preview';

/** Editoren rekker å klikke seg rundt, uten at en glemt cookie lever evig. */
export const PREVIEW_COOKIE_MAX_AGE = 60 * 60 * 8;

/**
 * Minst 32 tegn, og bare tegn som overlever URL-en uendret. CMS-et URL-koder
 * ikke verdien, så en `+` fra base64 blir til mellomrom og treffer aldri.
 * Plassholdere som `change-me` fra et offentlig repo stopper her.
 */
const USABLE_SECRET = /^[A-Za-z0-9_-]{32,}$/;

/**
 * Sammenligner uten å avsløre hvor langt inn i strengen første avvik kom.
 * Lengden lekker, som i alle vanlige implementasjoner, og er ikke hemmelig her.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  if (left.length !== right.length) return false;

  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left[i] ^ right[i];
  return diff === 0;
}

export interface PreviewRequest {
  /** `secret`-parameteren fra URL-en, slik CMS-et sender den. */
  secretParam: string | null;
  /** Verdien av preview-cookien, satt av oss ved forrige gyldige lenke. */
  cookieValue: string | undefined;
  /** PREVIEW_SECRET fra miljøet. Tom eller for svak betyr at preview er avslått. */
  configuredSecret: string;
}

export interface PreviewVerdict {
  /** Sann bare når hemmeligheten stemmer. Styrer både innhold og caching. */
  isPreview: boolean;
  /** Sann når hemmeligheten kom i URL-en, og cookien derfor skal settes. */
  shouldSetCookie: boolean;
}

export function resolvePreview({
  secretParam,
  cookieValue,
  configuredSecret,
}: PreviewRequest): PreviewVerdict {
  if (!USABLE_SECRET.test(configuredSecret)) return { isPreview: false, shouldSetCookie: false };

  if (secretParam !== null && timingSafeEqual(secretParam, configuredSecret)) {
    return { isPreview: true, shouldSetCookie: true };
  }

  if (cookieValue !== undefined && timingSafeEqual(cookieValue, configuredSecret)) {
    return { isPreview: true, shouldSetCookie: false };
  }

  return { isPreview: false, shouldSetCookie: false };
}

/**
 * Adressen redaktøren sendes videre til når cookien er satt. Hemmeligheten skal
 * ikke bli stående i adresselinja, i historikken, i en lenke som limes inn i
 * Teams eller i location.href som analyseskriptene leser. Cookien bærer den videre.
 */
export function withoutSecret(url: URL): string {
  const target = new URL(url);
  target.searchParams.delete('secret');
  return localPath(target);
}

/**
 * Hvor «Avslutt forhåndsvisning» sender redaktøren. Bare egne sider, ellers er
 * ruta en åpen redirect fra ki.norge.no til hvor som helst.
 */
export function exitTarget(redirectParam: string | null, url: URL): string {
  const target = new URL(redirectParam || '/', url);
  return target.origin === url.origin ? localPath(target) : '/';
}

// `//host/sti` er en adresse til en annen host, ikke en sti.
function localPath(target: URL): string {
  return `/${target.pathname.replace(/^\/+/, '')}${target.search}`;
}

/**
 * Også forsøk som ikke slapp gjennom holdes utenfor edge-cachen. Ellers havner
 * en ekte `secret` i en offentlig cache-oppføring så lenge frontend mangler
 * hemmeligheten, og hver gjetning på den lager en ny oppføring.
 */
export function bypassesCache(url: URL, isPreview: boolean): boolean {
  return isPreview || url.searchParams.has('preview') || url.searchParams.has('secret');
}

/**
 * Backoffice viser frontend i en iframe, cms.ki.norge.no rundt ki.norge.no.
 * norge.no står ikke på Public Suffix List, så de to er samme site, og Lax
 * holder. Derfor peker HeadlessPreview__FrontendUrl i syncroot på ki.norge.no og
 * ki.test.norge.no. workers.dev står på lista, så fra en workers.dev-host ble
 * cookien en tredjeparts-cookie som Safari blokkerer.
 * Verdien er hemmeligheten selv, derfor HttpOnly og Secure.
 */
export function previewCookieOptions() {
  return { ...previewCookieDeleteOptions(), maxAge: PREVIEW_COOKIE_MAX_AGE };
}

/**
 * Samme attributter som cookien ble satt med. En Set-Cookie uten dem avvises i
 * iframen, og da sto cookien igjen i åtte timer uten vei ut.
 */
export function previewCookieDeleteOptions() {
  return {
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
  } as const;
}
