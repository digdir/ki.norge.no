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
 * Uten en konfigurert hemmelighet er forhåndsvisning AV. Feiler heller lukket
 * enn å la en manglende variabel åpne utkastene for alle.
 */

export const PREVIEW_COOKIE = 'preview';

/** Editoren rekker å klikke seg rundt, uten at en glemt cookie lever evig. */
export const PREVIEW_COOKIE_MAX_AGE = 60 * 60 * 8;

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
  /** PREVIEW_SECRET fra miljøet. Tom streng betyr at preview er avslått. */
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
  if (configuredSecret === '') return { isPreview: false, shouldSetCookie: false };

  if (secretParam !== null && timingSafeEqual(secretParam, configuredSecret)) {
    return { isPreview: true, shouldSetCookie: true };
  }

  if (cookieValue !== undefined && timingSafeEqual(cookieValue, configuredSecret)) {
    return { isPreview: true, shouldSetCookie: false };
  }

  return { isPreview: false, shouldSetCookie: false };
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
 * SameSite=None fordi backoffice viser frontend i en iframe fra et annet
 * domene (cms.ki.norge.no rundt ki.norge.no). Med Lax ville cookien ikke blitt
 * sendt der, og editoren mistet forhåndsvisningen ved første klikk videre.
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
    sameSite: 'none',
  } as const;
}
